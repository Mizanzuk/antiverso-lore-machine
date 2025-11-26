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
Sua tarefa é ler o trecho de texto (Parte ${chunkIndex + 1} de ${totalChunks}) e extrair FICHAS DE LORE estruturadas.

TIPOS PERMITIDOS:
${typeInstructions}

DIRETRIZES DE EXTRAÇÃO:
1. **Seja Específico:** Não crie fichas para conceitos genéricos (ex: "medo", "escuro") a menos que sejam entidades sobrenaturais definidas.
2. **Personagens:** Identifique nomes próprios. Se for um figurante sem nome, ignore.
3. **Eventos:** Se houver uma cena datada ou um acontecimento chave, crie uma ficha de EVENTO com o máximo de dados temporais (ano, data).
4. **Relações Cruzadas:** O campo "meta.relacoes" é CRÍTICO. Conecte quem fez o quê, onde e com quem.

FORMATO JSON ESPERADO:
{
  "fichas": [
    {
      "tipo": "personagem", // use apenas os tipos permitidos
      "titulo": "Nome Principal",
      "resumo": "Uma frase resumindo quem é.",
      "conteudo": "Descrição detalhada baseada no texto.",
      "tags": ["tag1", "tag2"],
      "aparece_em": "Citação breve de onde aparece no texto",
      "ano_diegese": 1995, // número ou null
      "descricao_data": "Verão de 95", // string ou null
      "data_inicio": "1995-02-15", // YYYY-MM-DD ou null
      "granularidade_data": "mes", // dia, mes, ano, vago
      "camada_temporal": "linha_principal", // flashback, sonho_visao, linha_principal
      "meta": { 
        "relacoes": [
           {"tipo": "amigo_de", "alvo_titulo": "Outro Personagem"},
           {"tipo": "localizado_em", "alvo_titulo": "Nome do Local"}
        ] 
      }
    }
  ]
}
`.trim();

  const userPrompt = `Texto para análise:\n"""${text}"""`;

  try {
    const completion = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1, // Baixa temperatura para ser mais factual
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

// Mescla fichas duplicadas (mesmo título e tipo) encontradas em diferentes chunks
function deduplicateFichas(allFichas: ExtractedFicha[]): ExtractedFicha[] {
  const map = new Map<string, ExtractedFicha>();

  for (const f of allFichas) {
    // Chave única baseada em tipo + título normalizado
    const key = `${f.tipo}-${f.titulo.toLowerCase().trim()}`;

    if (map.has(key)) {
      const existing = map.get(key)!;
      // Mescla conteúdo (concatena informações novas)
      existing.conteudo += `\n\n[Continuação extraída]: ${f.conteudo}`;
      
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
      
      // Mantém a data mais específica se a existente for nula
      if (!existing.ano_diegese && f.ano_diegese) existing.ano_diegese = f.ano_diegese;
      if (!existing.data_inicio && f.data_inicio) existing.data_inicio = f.data_inicio;

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
    // Isso garante que temos o texto original preservado
    let roteiroId: string | null = null;
    if (supabaseAdmin) {
      const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : normalizeEpisode(String(unitNumber ?? ""));
      const titulo = typeof documentName === "string" && documentName.trim() ? documentName.trim() : "Roteiro sem título";
      
      // Tenta inserir na tabela 'roteiros'. Se ela não existir ou der erro, apenas loga e segue.
      try {
        const { data, error } = await supabaseAdmin
          .from("roteiros")
          .insert({ world_id: worldId ?? null, titulo, conteudo: text, episodio })
          .select("id")
          .single();
        if (!error && data) roteiroId = data.id;
      } catch (err) {
        console.warn("Aviso: Não foi possível salvar na tabela 'roteiros' (pode não existir ainda).", err);
      }
    }

    // 2. DIVIDIR E CONQUISTAR (CHUNKING)
    const chunks = splitTextIntoChunks(text);
    console.log(`Texto dividido em ${chunks.length} bloco(s) para análise.`);

    // Processa todos os chunks em paralelo
    const promises = chunks.map((chunk, index) => processChunk(chunk, index, chunks.length));
    const results = await Promise.all(promises);

    // Flatten: junta todos os arrays de resultados em um só
    const allRawFichas = results.flat();

    // 3. DEDUPLICAÇÃO E LIMPEZA
    const uniqueFichas = deduplicateFichas(allRawFichas);

    // 4. ADICIONAR FICHA DO PRÓPRIO ROTEIRO (Manual)
    // Garante que sempre haja uma ficha representando o documento em si
    const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : "0";
    const tituloDoc = documentName?.trim() || "Roteiro Processado";
    
    const fichaRoteiro: ExtractedFicha = {
      tipo: "roteiro",
      titulo: tituloDoc,
      resumo: `Ficha técnica automática do documento/episódio ${episodio}.`,
      conteudo: text.slice(0, 2000) + (text.length > 2000 ? "..." : ""), // Preview do texto
      tags: ["roteiro", `ep-${episodio}`],
      ano_diegese: null,
      aparece_em: `Episódio ${episodio}`,
      meta: { status: "ativo" }
    };

    // Coloca a ficha do roteiro no topo da lista
    uniqueFichas.unshift(fichaRoteiro);

    // 5. PREPARAR RESPOSTA FILTRADA PARA O FRONTEND
    // Filtros simples para ajudar o frontend a categorizar se necessário,
    // embora o frontend atual mostre tudo junto.
    const cleanFichas = uniqueFichas.map(f => ({
      ...f,
      titulo: f.titulo.trim(),
      tipo: f.tipo.toLowerCase().trim(),
      // Garante que meta.relacoes exista
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
