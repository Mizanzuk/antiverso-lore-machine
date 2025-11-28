import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importação crítica

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// TIPOS
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

const allowedTypes = [
  "personagem", "local", "midia", "agencia", "empresa", "conceito",
  "regra_de_mundo", "evento", "epistemologia", "registro_anomalo", "objeto",
];

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

function splitTextIntoChunks(text: string, maxChars = 12000): string[] {
  if (!text || text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = text.split("\n");
  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > maxChars) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += p + "\n";
  }
  if (currentChunk.trim()) chunks.push(currentChunk);
  return chunks;
}

async function processChunk(text: string, chunkIndex: number, totalChunks: number): Promise<ExtractedFicha[]> {
    const typeInstructions = allowedTypes.map((t) => `"${t}"`).join(", ");
    const systemPrompt = `
  Você é o Motor de Lore do AntiVerso.
  Sua tarefa é ler o texto e extrair FICHAS DE LORE estruturadas.
  
  TIPOS PERMITIDOS: ${typeInstructions}
  
  DIRETRIZES:
  1. AGRESSIVIDADE TEMPORAL: Crie fichas de TIPO "evento" para datas específicas.
  2. PERSONAGENS: Foque na personalidade.
  3. LOCAIS: Não ignore locais genéricos.
  4. RELAÇÕES: Conecte personagens e locais.
  
  FORMATO JSON: { "fichas": [...] }
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
      console.error(`Erro chunk ${chunkIndex}:`, err);
      return [];
    }
}

function deduplicateFichas(allFichas: ExtractedFicha[]): ExtractedFicha[] {
    const map = new Map<string, ExtractedFicha>();
    for (const f of allFichas) {
      // FIX: Adicionada verificação de segurança (|| "") para evitar crash se a IA não retornar título/tipo
      const safeTitulo = (f.titulo || "").toLowerCase().trim();
      const safeTipo = (f.tipo || "conceito").toLowerCase().trim();

      if (!safeTitulo) continue; // Pula se não tiver título

      const key = `${safeTipo}-${safeTitulo}`;
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        // Check de segurança para conteudo
        const safeConteudo = f.conteudo || "";
        const existingConteudo = existing.conteudo || "";

        if (safeConteudo && !existingConteudo.includes(safeConteudo.slice(0, 20))) {
            existing.conteudo += `\n\n[Mais]: ${safeConteudo}`;
        }
        
        const mergedTags = new Set([...(existing.tags || []), ...(f.tags || [])]);
        existing.tags = Array.from(mergedTags);
        
        if (f.meta?.relacoes) {
          const existingRels = existing.meta?.relacoes || [];
          existing.meta = { ...existing.meta, relacoes: [...existingRels, ...f.meta.relacoes] };
        }
        if (!existing.data_inicio && f.data_inicio) {
           existing.data_inicio = f.data_inicio;
           existing.ano_diegese = f.ano_diegese;
           existing.descricao_data = f.descricao_data;
           existing.granularidade_data = f.granularidade_data;
        }
      } else {
        // Garante que a ficha nova tenha campos seguros antes de entrar no mapa
        f.titulo = f.titulo || "Sem Título";
        f.tipo = f.tipo || "conceito";
        f.conteudo = f.conteudo || "";
        f.tags = f.tags || [];
        map.set(key, f);
      }
    }
    return Array.from(map.values());
}

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }
    
    // Auth com Fallback
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId && supabaseAdmin) {
            clientToUse = supabaseAdmin;
            userId = headerUserId;
        }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized (401)." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { worldId, unitNumber, text, documentName } = body as {
      worldId?: string;
      unitNumber?: string;
      text?: string;
      documentName?: string | null;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Campo 'text' é obrigatório." }, { status: 400 });
    }

    // 1. SALVAR ROTEIRO
    let roteiroId: string | null = null;
    if (clientToUse) {
      const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : normalizeEpisode(String(unitNumber ?? ""));
      const titulo = typeof documentName === "string" && documentName.trim() ? documentName.trim() : "Roteiro sem título";
      
      try {
        const { data, error } = await clientToUse
          .from("roteiros")
          .insert({ 
            world_id: worldId ?? null, 
            titulo, 
            conteudo: text, 
            episodio,
          })
          .select("id")
          .single();
        if (!error && data) roteiroId = data.id;
      } catch (err) {
        console.warn("Aviso: Erro ao salvar roteiro.", err);
      }
    }

    // 2. DIVIDIR E CONQUISTAR
    const chunks = splitTextIntoChunks(text);
    const promises = chunks.map((chunk, index) => processChunk(chunk, index, chunks.length));
    const results = await Promise.all(promises);
    const allRawFichas = results.flat();

    // 3. DEDUPLICAÇÃO
    const uniqueFichas = deduplicateFichas(allRawFichas);

    // 4. FICHA DO ROTEIRO
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
      // FIX: Adicionada verificação de segurança aqui também para evitar erro 500 no retorno
      titulo: (f.titulo || "").trim(),
      tipo: (f.tipo || "conceito").toLowerCase().trim(),
      meta: { ...f.meta, relacoes: f.meta?.relacoes || [] }
    }));

    return NextResponse.json({
      fichas: cleanFichas,
      roteiroId,
      totalExtracted: cleanFichas.length
    });

  } catch (err: any) {
    console.error("Erro fatal:", err);
    return NextResponse.json({ error: `Erro interno: ${err.message}` }, { status: 500 });
  }
}
