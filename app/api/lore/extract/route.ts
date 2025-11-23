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

    const systemPrompt = `
Você é um assistente especialista em análise de narrativa e worldbuilding.

Sua tarefa é, dado um texto de entrada, extrair uma lista de FICHAS DE LORE estruturadas.
Cada ficha representa um elemento importante da história (personagens, locais, conceitos, eventos, etc.).

Regras gerais:
- Use apenas os tipos permitidos: ${typeInstructions}.
- Não crie fichas óbvias demais ou irrelevantes.
- Prefira tipos mais específicos (personagem, local, evento, etc.) em vez de "conceito" quando fizer sentido.
- Respeite ao máximo as informações presentes no texto; evite inventar detalhes que não estejam lá.
- Se o texto for muito curto, crie no máximo 1 a 3 fichas.
- Um mesmo texto pode gerar VÁRIOS eventos diferentes (cada acontecimento pode ser uma ficha de tipo "evento").

Campos temporais (doutrina):
- Campos de tempo só fazem sentido para fichas de tipo "evento".
- Para tipos que NÃO são "evento" (personagem, local, objeto, conceito, etc.), deixe todos os campos temporais como null ou simplesmente não inclua.
- Não invente anos ou datas específicas sem evidência forte no texto.
- Quando a data for vaga ("há muitos anos", "no futuro distante"), use "descricao_data" para a frase original e defina "granularidade_data" como algo vago (por exemplo: "desconhecido" ou "vago").

O formato de saída DEVE ser estritamente JSON com a seguinte forma:

{
  "fichas": [
    {
      "tipo": "personagem | local | midia | agencia | empresa | epistemologia | conceito | evento | regras_de_mundo | registro_anomalo | roteiro",
      "titulo": "título curto e claro da ficha",
      "resumo": "resumo em 1 ou 2 frases, em português",
      "conteudo": "descrição um pouco mais detalhada, em parágrafos curtos",
      "tags": ["lista", "de", "tags", "simples"],
      "ano_diegese": 1993 ou null,
      "aparece_em": "texto curto indicando onde isso aparece, se você souber; caso contrário, use string vazia ou null",

      "descricao_data": "frase original da data, APENAS se tipo === \"evento\" (ex.: \"dez anos atrás, numa noite de quinta-feira\") ou null,
      "data_inicio": "data da linha do tempo em formato ISO (YYYY-MM-DD) ou apenas ano (YYYY) quando apropriado, APENAS se tipo === \"evento\"; caso contrário, null",
      "data_fim": "data final do intervalo, quando houver (também em ISO ou ano), ou null",
      "granularidade_data": "dia | mes | ano | decada | seculo | vago | desconhecido, APENAS para eventos; caso contrário, null",
      "camada_temporal": "linha_principal | flashback | passado_mitico | futuro | narrador | documento | desconhecido, APENAS para eventos; caso contrário, null",

      "meta": {
        "periodo_diegese": "opcional; texto livre curto descrevendo o período na diegese (ex.: 'anos 1990 na cidade X')",
        "ordem_cronologica": 10,
        "referencias_temporais": ["lista opcional de expressões de tempo usadas no texto"],
        "aparece_em_detalhado": [
          {
            "mundo": "nome do mundo, se estiver explícito",
            "codigo_mundo": "código curto do mundo, se houver",
            "episodio": "episódio ou capítulo, se fizer sentido"
          }
        ],
        "relacoes": [
          {
            "tipo": "tipo de relação (ex.: 'parente', 'mora_em', 'membro_de')",
            "alvo_titulo": "título ou nome do outro elemento relacionado, se existir",
            "alvo_id": "id ou código, se estiver explícito no texto"
          }
        ],
        "fontes": ["trechos curtos do texto original que justificam as informações principais da ficha"],
        "notas_do_autor": "observações breves que ajudem o autor a lembrar do contexto futuro, se necessário",
        "nivel_sigilo": "publico | interno | rascunho",
        "status": "ativo | obsoleto | mesclado"
      }
    }
  ]
}

Regras importantes sobre temporalidade:
- NUNCA aplique campos de tempo (descricao_data, data_inicio, data_fim, granularidade_data, camada_temporal) em fichas que não sejam do tipo "evento".
- Para um mesmo texto, identifique cada acontecimento relevante como um possível evento separado.
- Se não for possível determinar uma data minimamente útil para a linha do tempo, deixe data_inicio e data_fim como null, mas preencha descricao_data com a frase original de tempo, quando existir.

Observações finais:
- O campo "meta" é opcional, mas quando possível você deve preenchê-lo com inferências úteis e concisas.
- Não invente anos específicos sem evidência; prefira deixar "ano_diegese" como null e usar apenas "periodo_diegese" textual em "meta" se necessário.
- Mantenha o campo "meta" enxuto: no máximo 3 itens em cada lista (referencias_temporais, relacoes, fontes), e use frases curtas.
- Evite repetir trechos longos do texto dentro de "meta"; use resumos breves.
- Limite o tamanho total do JSON: priorize fichas principais (personagens, locais, eventos, roteiros) em vez de meta excessiva.
- NUNCA retorne comentários fora desse JSON.
`.trim();

    const userPrompt = `
Texto base para extração de lore:

"""${text}"""

Extraia as fichas seguindo exatamente o formato JSON especificado.
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 2800,
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

        const meta: FichaMeta = {
          periodo_diegese:
            typeof rawMeta.periodo_diegese === "string"
              ? rawMeta.periodo_diegese
              : null,
          ordem_cronologica:
            typeof rawMeta.ordem_cronologica === "number"
              ? rawMeta.ordem_cronologica
              : null,
          referencias_temporais: Array.isArray(rawMeta.referencias_temporais)
            ? rawMeta.referencias_temporais.map((r: any) => String(r))
            : [],
          aparece_em_detalhado: Array.isArray(rawMeta.aparece_em_detalhado)
            ? rawMeta.aparece_em_detalhado.map((item: any) => ({
                mundo: item?.mundo ? String(item.mundo) : undefined,
                codigo_mundo:
                  item?.codigo_mundo != null
                    ? String(item.codigo_mundo)
                    : undefined,
                episodio:
                  item?.episodio != null && item.episodio !== ""
                    ? item.episodio
                    : undefined,
              }))
            : undefined,
          relacoes: Array.isArray(rawMeta.relacoes)
            ? rawMeta.relacoes.map((rel: any) => ({
                tipo: rel?.tipo ? String(rel.tipo) : "",
                alvo_titulo: rel?.alvo_titulo
                  ? String(rel.alvo_titulo)
                  : undefined,
                alvo_id: rel?.alvo_id ? String(rel.alvo_id) : undefined,
              }))
            : undefined,
          fontes: Array.isArray(rawMeta.fontes)
            ? rawMeta.fontes.map((r: any) => String(r))
            : undefined,
          notas_do_autor:
            typeof rawMeta.notas_do_autor === "string"
              ? rawMeta.notas_do_autor
              : undefined,
          nivel_sigilo:
            typeof rawMeta.nivel_sigilo === "string"
              ? rawMeta.nivel_sigilo
              : undefined,
          status:
            typeof rawMeta.status === "string" ? rawMeta.status : undefined,
        };

        // Remove campos vazios do meta para evitar ruído
        const hasAnyMetaValue =
          meta.periodo_diegese ||
          typeof meta.ordem_cronologica === "number" ||
          (meta.referencias_temporais &&
            meta.referencias_temporais.length > 0) ||
          (meta.aparece_em_detalhado &&
            meta.aparece_em_detalhado.length > 0) ||
          (meta.relacoes && meta.relacoes.length > 0) ||
          (meta.fontes && meta.fontes.length > 0) ||
          meta.notas_do_autor ||
          meta.nivel_sigilo ||
          meta.status;

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
          meta: hasAnyMetaValue ? meta : undefined,
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

    // Compatibilidade com a UI atual: agrupa por tipo (sem separar "roteiro")
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
