import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FichaMeta = {
  periodo_diegese?: string | null;
  ordem_cronologica?: number | null;
  referencias_temporais?: string[];
  aparece_em_detalhado?: {
    mundo?: string;
    codigo_mundo?: string | null;
    episodio?: string | number | null;
  }[];
  relacoes?: {
    tipo: string;
    alvo_titulo?: string;
    alvo_id?: string;
  }[];
  fontes?: string[];
  notas_do_autor?: string;
  nivel_sigilo?: "publico" | "interno" | "rascunho";
  status?: "ativo" | "obsoleto" | "mesclado";
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
  // Campos temporais
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: FichaMeta;
};

// Tipos permitidos para o Prompt (refletindo o frontend)
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

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

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

    // 1) Salvar Roteiro
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
        if (data?.id) roteiroId = data.id;
      } catch (err) {
        console.error("Erro ao salvar roteiro:", err);
      }
    }

    // 2) Extração com IA
    const typeInstructions = allowedTypes.map((t) => `"${t}"`).join(", ");

    const systemPrompt = `
Você é o Motor de Lore do AntiVerso.
Sua tarefa é ler o texto e criar FICHAS DE LORE para cada elemento relevante.

TIPOS PERMITIDOS:
${typeInstructions}

REGRAS CRUCIAIS PARA EVENTOS (Timeline):
- Se o texto mencionar uma data específica (ex: "23 de agosto de 2012") ou um momento narrativo claro ("O reencontro de 2025"), CRIE UMA FICHA DO TIPO "evento".
- Para "evento", preencha OBRIGATORIAMENTE:
  - "descricao_data": o texto original da data (ex: "início de fevereiro de 2025").
  - "data_inicio": data ISO YYYY-MM-DD estimada (ex: "2025-02-01").
  - "granularidade_data": "dia", "mes", "ano", "vago".
  - "camada_temporal": "linha_principal" (padrão), "flashback", "flashforward", "sonho_visao".

FORMATO DE SAÍDA (JSON):
{
  "fichas": [
    {
      "tipo": "personagem",
      "titulo": "Nome",
      "resumo": "Resumo.",
      "conteudo": "Detalhes.",
      "tags": ["tag"],
      "aparece_em": "Contexto",
      "meta": { "relacoes": [{"tipo": "amigo", "alvo_titulo": "Outro"}] }
    },
    {
      "tipo": "evento",
      "titulo": "O que aconteceu",
      "resumo": "Resumo do evento",
      "conteudo": "Detalhes do evento",
      "descricao_data": "Texto da data",
      "data_inicio": "YYYY-MM-DD",
      "granularidade_data": "dia",
      "camada_temporal": "linha_principal"
    }
  ]
}
`.trim();

    const userPrompt = `Texto:\n"""${text}"""\n\nExtraia tudo.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{"fichas": []}';
    let parsed: any = { fichas: [] };
    try { parsed = JSON.parse(rawContent); } catch (e) { console.error(e); }

    const rawFichas = Array.isArray(parsed.fichas) ? parsed.fichas : [];

    const cleanFichas: ExtractedFicha[] = rawFichas.map((f: any) => {
      const tipo = String(f.tipo || "conceito").toLowerCase().trim();
      const isEvento = tipo === "evento";
      
      // Metadados
      const meta: FichaMeta = {
        relacoes: Array.isArray(f.meta?.relacoes) ? f.meta.relacoes : [],
        notas_do_autor: f.meta?.notas_do_autor,
        status: f.meta?.status
      };

      return {
        tipo,
        titulo: String(f.titulo ?? "").trim(),
        resumo: String(f.resumo ?? "").trim(),
        conteudo: String(f.conteudo ?? "").trim(),
        tags: Array.isArray(f.tags) ? f.tags : [],
        ano_diegese: typeof f.ano_diegese === "number" ? f.ano_diegese : null,
        aparece_em: String(f.aparece_em ?? "").trim(),
        
        // Campos Temporais
        descricao_data: isEvento ? (f.descricao_data || null) : null,
        data_inicio: isEvento ? (f.data_inicio || null) : null,
        data_fim: isEvento ? (f.data_fim || null) : null,
        granularidade_data: isEvento ? (f.granularidade_data || null) : null,
        camada_temporal: isEvento ? (f.camada_temporal || null) : null,
        
        meta
      };
    });

    // Adiciona Roteiro
    const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : normalizeEpisode(String(unitNumber ?? ""));
    const tituloRoteiro = typeof documentName === "string" && documentName.trim() ? documentName.trim() : "Roteiro sem título";
    
    cleanFichas.unshift({
      tipo: "roteiro",
      titulo: tituloRoteiro,
      resumo: episodio ? `Roteiro do ep. ${episodio}` : "Roteiro completo.",
      conteudo: text,
      tags: ["roteiro"],
      ano_diegese: null,
      aparece_em: episodio ? `Ep. ${episodio}` : "",
    });

    // Filtros de compatibilidade
    const personagens = cleanFichas.filter(f => f.tipo === "personagem");
    const locais = cleanFichas.filter(f => f.tipo === "local");
    const empresas = cleanFichas.filter(f => f.tipo === "empresa");
    const agencias = cleanFichas.filter(f => f.tipo === "agencia");
    const midias = cleanFichas.filter(f => f.tipo === "midia");

    return NextResponse.json({
      fichas: cleanFichas,
      roteiroId,
      personagens,
      locais,
      empresas,
      agencias,
      midias
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro na extração." }, { status: 500 });
  }
}
