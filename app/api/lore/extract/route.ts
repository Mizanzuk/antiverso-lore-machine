import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

// Permite execução de até 60 segundos na Vercel (Pro) para textos longos
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// --- TIPOS ---

type FichaMeta = {
  periodo_diegese?: string | null;
  status?: "ativo" | "obsoleto" | "mesclado";
  relacoes?: {
    tipo: string;
    alvo_titulo?: string;
    alvo_id?: string;
  }[];
  [key: string]: any;
};

type ExtractedFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  ano_diegese: number | null;
  aparece_em: string;
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: FichaMeta;
};

// Tipos permitidos para guiar a IA
const allowedTypes = [
  "personagem",
  "local",
  "midia",
  "agencia",
  "empresa",
  "conceito",
  "regra_de_mundo",
  "evento",
  "epistemologia",
  "registro_anomalo",
  "objeto",
];

// --- HELPERS ---

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

// Divide texto em blocos de ~12.000 caracteres para caber na janela de contexto
function splitTextIntoChunks(text: string, maxChars = 12000): string[] {
  if (!text || text.length <= maxChars) return [text];
  
  const chunks: string[] = [];
  let currentChunk = "";
  
  // Divide por parágrafos para não cortar frases no meio
  const paragraphs = text.split("\n");

  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > maxChars) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += p + "\n";
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

// Processa um único bloco de texto com a IA
async function processChunk(text: string, chunkIndex: number, totalChunks: number): Promise<ExtractedFicha[]> {
  const typeInstructions = allowedTypes.map((t) => `"${t}"`).join(", ");

  const systemPrompt = `
Você é o Motor de Lore do AntiVerso.
Sua tarefa é ler o texto e extrair FICHAS DE LORE estruturadas.

TIPOS PERMITIDOS:
${typeInstructions}

DIRETRIZES DE EXTRAÇÃO (IMPORTANTE):

1. **AGRESSIVIDADE TEMPORAL (CRÍTICO):**
   - O objetivo principal é montar uma Linha do Tempo.
   - Se o texto menciona uma data específica (ex: "abril de 2011", "em 2015", "naquela tarde de 1999"), você **DEVE** criar uma ficha de TIPO "evento" separada.
   - Não agrupe acontecimentos de datas diferentes na mesma ficha. Separe-os.
   - Extraia o "data_inicio" no formato YYYY-MM-DD sempre que possível.

2. **PERSONAGENS:**
   - Crie fichas para os nomes próprios.
   - No campo "resumo", foque na personalidade ou papel geral.

3. **LOCAIS (CENÁRIOS):**
   - Extraia fichas de TIPO "local" para qualquer cenário onde uma cena acontece.
   - **NÃO IGNORE** locais genéricos. Se o texto diz "Padaria da Esquina", crie uma ficha "Padaria da Esquina". Se diz "Ponto de Ônibus", crie uma ficha "Ponto de Ônibus".
   - Eles são os "palcos" dos eventos e precisam existir no banco de dados.

4. **RELAÇÕES (Conectando tudo):**
   - No "meta.relacoes" dos Eventos, conecte:
     - "envolve": os Personagens presentes.
     - "ocorreu_em": o Local onde aconteceu.

FORMATO JSON ESPERADO:
{
  "fichas": [
    {
      "tipo": "evento",
      "titulo": "Título descritivo do evento",
      "resumo": "O que aconteceu.",
      "conteudo": "Detalhes da cena.",
      "descricao_data": "Abril de 2011",
      "data_inicio": "2011-04-01",
      "granularidade_data": "mes",
      "camada_temporal": "linha_principal",
      "meta": { 
        "relacoes": [
           {"tipo": "envolve", "alvo_titulo": "Nome do Personagem"},
           {"tipo": "ocorreu_em", "alvo_titulo": "Nome do Local"} // Importante!
        ] 
      }
    },
    {
      "tipo": "local",
      "titulo": "Padaria da Esquina",
      "resumo": "Local onde Pedro costumava tomar café e se atrasar.",
      "conteudo": "Descrição do ambiente se houver..."
    }
  ]
}
`.trim();

  const userPrompt = `Texto para análise:\n"""${text}"""`;

  try {
    const completion = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2, 
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) return [];

    const parsed = JSON.parse(rawContent);
    return Array.isArray(parsed.fichas) ? parsed.fichas : [];
  } catch (err) {
    console.error(`Erro ao processar chunk ${chunkIndex}:`, err);
    return [];
  }
}

// Mescla fichas duplicadas
function deduplicateFichas(allFichas: ExtractedFicha[]): ExtractedFicha[] {
  const map = new Map<string, ExtractedFicha>();

  for (const f of allFichas) {
    // Normaliza chave
    const key = `${f.tipo}-${f.titulo.toLowerCase().trim()}`;

    if (map.has(key)) {
      const existing = map.get(key)!;
      
      // Mescla conteúdo sem repetir frases exatas
      if (f.conteudo && !existing.conteudo.includes(f.conteudo.slice(0, 20))) {
         existing.conteudo += `\n\n[Mais detalhes]: ${f.conteudo}`;
      }
      
      // Mescla tags
      const mergedTags = new Set([...existing.tags, ...f.tags]);
      existing.tags = Array.from(mergedTags);

      // Mescla relações
      if (f.meta?.relacoes) {
        const existingRels = existing.meta?.relacoes || [];
        existing.meta = {
          ...existing.meta,
          relacoes: [...existingRels, ...f.meta.relacoes]
        };
      }
      
      // Prioriza dados temporais se a ficha existente não tiver
      if (!existing.data_inicio && f.data_inicio) {
         existing.data_inicio = f.data_inicio;
         existing.ano_diegese = f.ano_diegese;
         existing.descricao_data = f.descricao_data;
         existing.granularidade_data = f.granularidade_data;
      }

    } else {
      map.set(key, f);
    }
  }

  return Array.from(map.values());
}

// --- HANDLER PRINCIPAL ---

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada." },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { worldId, unitNumber, text, documentName } = body as {
      worldId?: string;
      unitNumber?: string;
      text?: string;
      documentName?: string | null;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Campo 'text' é obrigatório." },
        { status: 400 },
      );
    }

    // 1. SALVAR ROTEIRO BRUTO NO SUPABASE
    let roteiroId: string | null = null;
    if (supabaseAdmin) {
      const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : normalizeEpisode(String(unitNumber ?? ""));
      const titulo = typeof documentName === "string" && documentName.trim() ? documentName.trim() : "Roteiro sem título";
      
      try {
        const { data, error } = await supabaseAdmin
          .from("roteiros")
          .insert({ world_id: worldId ?? null, titulo, conteudo: text, episodio })
          .select("id")
          .single();
        if (!error && data) roteiroId = data.id;
      } catch (err) {
        console.warn("Aviso: Não foi possível salvar na tabela 'roteiros'.", err);
      }
    }

    // 2. DIVIDIR E CONQUISTAR (CHUNKING)
    const chunks = splitTextIntoChunks(text);
    console.log(`Texto dividido em ${chunks.length} bloco(s) para análise.`);

    const promises = chunks.map((chunk, index) => processChunk(chunk, index, chunks.length));
    const results = await Promise.all(promises);

    const allRawFichas = results.flat();

    // 3. DEDUPLICAÇÃO
    const uniqueFichas = deduplicateFichas(allRawFichas);

    // 4. ADICIONAR FICHA DO PRÓPRIO ROTEIRO
    const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : "0";
    const tituloDoc = documentName?.trim() || "Roteiro Processado";
    
    const fichaRoteiro: ExtractedFicha = {
      tipo: "roteiro",
      titulo: tituloDoc,
      resumo: `Ficha técnica automática do documento/episódio ${episodio}.`,
      conteudo: text.slice(0, 2000) + (text.length > 2000 ? "..." : ""),
      tags: ["roteiro", `ep-${episodio}`],
      ano_diegese: null,
      aparece_em: `Episódio ${episodio}`,
      meta: { status: "ativo" }
    };

    uniqueFichas.unshift(fichaRoteiro);

    // 5. RETORNO
    const cleanFichas = uniqueFichas.map(f => ({
      ...f,
      titulo: f.titulo.trim(),
      tipo: f.tipo.toLowerCase().trim(),
      meta: {
        ...f.meta,
        relacoes: f.meta?.relacoes || []
      }
    }));

    return NextResponse.json({
      fichas: cleanFichas,
      roteiroId,
      totalExtracted: cleanFichas.length
    });

  } catch (err: any) {
    console.error("Erro fatal na rota de extração:", err);
    return NextResponse.json({ error: `Erro interno: ${err.message}` }, { status: 500 });
  }
}
