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
  // Campos temporais: só fazem sentido para fichas de tipo "evento".
  // Para outros tipos, o modelo deve deixar como null ou omitir.
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: FichaMeta;
};

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
        {
          error:
            "OPENAI_API_KEY não configurada. Defina a chave no painel de variáveis de ambiente da Vercel.",
        },
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
        { error: "Campo 'text' é obrigatório no corpo da requisição." },
        { status: 400 },
      );
    }

    // 1) Salvar texto bruto como Roteiro
    let roteiroId: string | null = null;

    if (supabaseAdmin) {
      const episodio =
        typeof unitNumber === "string"
          ? normalizeEpisode(unitNumber)
          : normalizeEpisode(String(unitNumber ?? ""));

      const titulo =
        typeof documentName === "string" && documentName.trim()
          ? documentName.trim()
          : "Roteiro sem título";

      try {
        const { data, error } = await supabaseAdmin
          .from("roteiros")
          .insert({
            world_id: worldId ?? null,
            titulo,
            conteudo: text,
            episodio,
          })
          .select("id")
          .single();

        if (error) {
          console.error("Erro ao salvar roteiro em 'roteiros':", error);
        } else if (data?.id) {
          roteiroId = data.id;
        }
      } catch (err) {
        console.error("Erro inesperado ao inserir em 'roteiros':", err);
      }
    }

    // 2) Chamar modelo para extrair fichas estruturadas
    const typeInstructions = allowedTypes.map((t) => `"${t}"`).join(", ");

    // PROMPT DE SISTEMA MELHORADO (AGRESSIVO NA EXTRAÇÃO)
    const systemPrompt = `
Você é o Motor de Lore do AntiVerso. Sua função é ler narrativas e atomizar TUDO em fichas de banco de dados.

OBJETIVO:
Identifique e extraia SEPARADAMENTE todas as entidades mencionadas no texto.
NÃO agrupe informações. Se o texto menciona 3 personagens, crie 3 fichas. Se menciona 2 locais, crie 2 fichas.

TIPOS PERMITIDOS:
${typeInstructions}

REGRAS OBRIGATÓRIAS:
1. **Personagens:** Crie uma ficha para CADA pessoa citada que tenha nome ou relevância (ex: João, Pedro, Maria).
2. **Locais:** Crie fichas para lugares físicos (ex: Padaria, Escola, Praça).
3. **Eventos (CRUCIAL):** Se houver datas específicas (ex: "abril de 2011", "23/08/2012") ou cenas de memória, CRIE UMA FICHA DE EVENTO PARA CADA UM.
   - Preencha "descricao_data" com o texto original.
   - Preencha "data_inicio" com o formato ISO (YYYY-MM-DD) se possível.
   - Defina a "granularidade_data" (dia, mes, ano).
4. **Conceitos:** Para ideias abstratas ou sobrenaturais.

FORMATO DE SAÍDA (JSON ESTRITO):
{
  "fichas": [
    {
      "tipo": "personagem",
      "titulo": "Nome",
      "resumo": "Quem é.",
      "conteudo": "O que fez no texto.",
      "tags": ["tag1"],
      "ano_diegese": null,
      "aparece_em": "Contexto",
      "meta": { "relacoes": [{"tipo": "amigo_de", "alvo_titulo": "Outro"}] }
    },
    {
      "tipo": "evento",
      "titulo": "Título do Evento",
      "resumo": "O que aconteceu.",
      "conteudo": "Detalhes.",
      "descricao_data": "texto da data",
      "data_inicio": "YYYY-MM-DD",
      "granularidade_data": "dia/mes/ano",
      "camada_temporal": "flashback"
    }
  ]
}
`.trim();

    const userPrompt = `
Texto para análise:
"""${text}"""

Extraia todas as fichas possíveis agora.
`.trim();

    // CHAMADA OPENAI COM GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1, // Baixa temperatura para maior fidelidade
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent =
      completion.choices[0]?.message?.content ?? '{"fichas": []}';

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error(
        "Falha ao fazer JSON.parse da resposta de /api/lore/extract:",
        err,
        rawContent,
      );
      parsed = { fichas: [] };
    }

    const rawFichas = Array.isArray(parsed.fichas) ? parsed.fichas : [];

    const cleanFichas: ExtractedFicha[] = rawFichas
      .filter((f: any) => f && f.tipo && f.titulo)
      .map((f: any) => {
        const tipo = String(f.tipo || "").toLowerCase().trim();
        const normalizedTipo = allowedTypes.includes(tipo) ? tipo : "conceito";

        const rawMeta = f.meta && typeof f.meta === "object" ? f.meta : {};

        // Preserva metadados, incluindo relações e campos extras
        const meta: FichaMeta = {
          periodo_diegese: typeof rawMeta.periodo_diegese === "string" ? rawMeta.periodo_diegese : null,
          ordem_cronologica: typeof rawMeta.ordem_cronologica === "number" ? rawMeta.ordem_cronologica : null,
          referencias_temporais: Array.isArray(rawMeta.referencias_temporais)
            ? rawMeta.referencias_temporais.map((r: any) => String(r))
            : [],
          aparece_em_detalhado: Array.isArray(rawMeta.aparece_em_detalhado)
            ? rawMeta.aparece_em_detalhado
            : undefined,
          relacoes: Array.isArray(rawMeta.relacoes)
            ? rawMeta.relacoes.map((rel: any) => ({
                tipo: rel?.tipo ? String(rel.tipo) : "relacionado_a",
                alvo_titulo: rel?.alvo_titulo ? String(rel.alvo_titulo) : undefined,
                alvo_id: rel?.alvo_id ? String(rel.alvo_id) : undefined,
              }))
            : [],
          fontes: Array.isArray(rawMeta.fontes) ? rawMeta.fontes : undefined,
          notas_do_autor: typeof rawMeta.notas_do_autor === "string" ? rawMeta.notas_do_autor : undefined,
          nivel_sigilo: typeof rawMeta.nivel_sigilo === "string" ? rawMeta.nivel_sigilo : undefined,
          status: typeof rawMeta.status === "string" ? rawMeta.status : undefined,
        };

        const isEvento = normalizedTipo === "evento";

        const descricao_data =
          isEvento && typeof f.descricao_data === "string"
            ? String(f.descricao_data).trim()
            : null;

        const data_inicio =
          isEvento && typeof f.data_inicio === "string"
            ? String(f.data_inicio).trim()
            : null;

        const data_fim =
          isEvento && typeof f.data_fim === "string"
            ? String(f.data_fim).trim()
            : null;

        const granularidade_data =
          isEvento && typeof f.granularidade_data === "string"
            ? String(f.granularidade_data).trim()
            : null;

        const camada_temporal =
          isEvento && typeof f.camada_temporal === "string"
            ? String(f.camada_temporal).trim()
            : null;

        return {
          tipo: normalizedTipo,
          titulo: String(f.titulo ?? "").trim(),
          resumo: String(f.resumo ?? "").trim(),
          conteudo: String(f.conteudo ?? "").trim(),
          tags: Array.isArray(f.tags)
            ? f.tags.map((t: any) => String(t))
            : [],
          ano_diegese:
            typeof f.ano_diegese === "number" ? f.ano_diegese : null,
          aparece_em: String(f.aparece_em ?? "").trim(),
          descricao_data,
          data_inicio,
          data_fim,
          granularidade_data,
          camada_temporal,
          meta: meta,
        };
      });

    // 3) Criar ficha especial do tipo "roteiro" com o texto completo
    const episodio =
      typeof unitNumber === "string"
        ? normalizeEpisode(unitNumber)
        : normalizeEpisode(String(unitNumber ?? ""));

    const tituloRoteiro =
      typeof documentName === "string" && documentName.trim()
        ? documentName.trim()
        : "Roteiro sem título";

    const roteiroFicha: ExtractedFicha = {
      tipo: "roteiro",
      titulo: tituloRoteiro,
      resumo: episodio
        ? `Roteiro completo do episódio ${episodio}.`
        : "Roteiro completo do texto base.",
      conteudo: text,
      tags: ["roteiro", "texto_base"],
      ano_diegese: null,
      aparece_em: episodio ? `Episódio ${episodio}` : "",
    };

    // Coloca o roteiro no começo da lista de fichas
    cleanFichas.unshift(roteiroFicha);

    // 4) RESTAURADO: Filtros de compatibilidade para quem consome a API esperando listas separadas
    const personagens = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "personagem",
    );
    const locais = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "local",
    );
    const empresas = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "empresa",
    );
    const agencias = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "agencia",
    );
    const midias = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "midia",
    );

    return NextResponse.json({
      fichas: cleanFichas,
      roteiroId,
      personagens,
      locais,
      empresas,
      agencias,
      midias,
    });
  } catch (err) {
    console.error("Erro inesperado em /api/lore/extract:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a extração de lore." },
      { status: 500 },
    );
  }
}
