import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FichaMeta = {
  // Campos temporais específicos para fichas do tipo "evento"
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  generalidade_data?:
    | "dia"
    | "mes"
    | "ano"
    | "decada"
    | "intervalo"
    | "desconhecida"
    | null;
  camada_temporal?: "diegese" | "relato" | "publicacao" | "meta" | null;

  // Campos auxiliares
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
  // Campo legado, mantido apenas por compatibilidade com a UI atual
  ano_diegese: number | null;
  aparece_em: string;

  // Campos temporais normalizados (principalmente para fichas do tipo "evento")
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  generalidade_data?: string | null;
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

Dado um texto de entrada, você deve extrair uma lista de FICHAS DE LORE estruturadas.
Cada ficha representa um elemento importante da história (personagens, locais, conceitos, eventos, etc.).

Regras importantes:
- Use apenas os tipos permitidos: ${typeInstructions}.
- Não crie fichas óbvias demais ou irrelevantes.
- Prefira tipos mais específicos (personagem, local, evento, etc.) em vez de "conceito" quando fizer sentido.
- Respeite ao máximo as informações presentes no texto; evite inventar detalhes que não estejam no texto.
- Se o texto for muito curto, crie no máximo 1 a 3 fichas.

Modelo mental importante sobre TEMPO:
- Datas e eventos são tratados como FICHAS DO TIPO "evento".
- Um mesmo texto pode gerar vários eventos diferentes (ex.: acidente em 2014, relato em 2024, publicação em 2025).
- Personagens, locais, organizações etc. normalmente NÃO carregam datas próprias; as datas pertencem aos eventos.

O formato de saída DEVE ser estritamente JSON com a seguinte forma:

{
  "fichas": [
    {
      "tipo": "personagem | local | midia | agencia | empresa | conceito | regra_de_mundo | evento | epistemologia",
      "titulo": "nome curto da ficha",
      "resumo": "resumo em 1 ou 2 frases, em português",
      "conteudo": "descrição mais longa da ficha, em português",
      "tags": ["lista", "de", "tags"],
      "aparece_em": "onde essa ficha aparece no texto (capítulo, episódio, cena, etc.)",
      "descricao_data": "frase original da data, quando essa ficha for um EVENTO (ex: '9 de janeiro de 2014', 'nos anos 90', 'entre 2003 e 2005'); caso não se aplique, use null",
      "data_inicio": "data aproximada no formato AAAA-MM-DD para ordenar na linha do tempo (ex: '2014-01-09', '2014-01-01', '1990-01-01'); se não houver data, use null",
      "data_fim": "apenas para intervalos; data final aproximada (ex: '1999-12-31' para 'anos 90', '2005-12-31' para 'entre 2003 e 2005'); caso não se aplique, use null",
      "generalidade_data": "dia | mes | ano | decada | intervalo | desconhecida",
      "camada_temporal": "diegese | relato | publicacao | meta | null",
      "meta": {
        "referencias_temporais": ["frases ou pistas do texto que indicam o tempo"],
        "aparece_em_detalhado": [
          {
            "mundo": "nome do mundo (se for possível inferir)",
            "codigo_mundo": "prefixo do mundo (ex: AV, TVC) se estiver claro no texto, ou null",
            "episodio": "número ou identificação do episódio/cena, se ficar claro (ex: 1, 'ARIS-042')"
          }
        ],
        "relacoes": [
          {
            "tipo": "tipo de relação (ex: 'relacionado_a', 'participa_do_evento', 'membro_de')",
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

Regras específicas sobre EVENTOS:
- Sempre que o texto contiver uma data ou referência temporal relevante, crie uma ficha do tipo "evento".
- Cada referência de tempo importante deve gerar UM evento próprio.
- Para fichas do tipo "evento", preencha SEMPRE:
  - "descricao_data"
  - "data_inicio" (e "data_fim" quando houver intervalo)
  - "generalidade_data"
  - "camada_temporal" (diegese, relato, publicacao ou meta), com o melhor chute possível baseado no contexto.
- Para fichas que NÃO são eventos, esses campos normalmente devem ser null.

Observações adicionais:
- Não invente datas específicas sem evidência; prefira usar "generalidade_data" adequada e deixar "data_inicio"/"data_fim" como null quando não der para aproximar.
- Evite criar eventos para menções de tempo irrelevantes (“um dia”, “certa vez”) a menos que sejam cruciais para a trama.
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
          descricao_data:
            typeof rawMeta.descricao_data === "string"
              ? rawMeta.descricao_data
              : null,
          data_inicio:
            typeof rawMeta.data_inicio === "string"
              ? rawMeta.data_inicio
              : null,
          data_fim:
            typeof rawMeta.data_fim === "string"
              ? rawMeta.data_fim
              : null,
          generalidade_data:
            typeof rawMeta.generalidade_data === "string"
              ? rawMeta.generalidade_data
              : null,
          camada_temporal:
            typeof rawMeta.camada_temporal === "string"
              ? rawMeta.camada_temporal
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
          meta.descricao_data ||
          meta.data_inicio ||
          meta.data_fim ||
          meta.generalidade_data ||
          meta.camada_temporal ||
          (meta.referencias_temporais &&
            meta.referencias_temporais.length > 0) ||
          (meta.aparece_em_detalhado &&
            meta.aparece_em_detalhado.length > 0) ||
          (meta.relacoes && meta.relacoes.length > 0) ||
          (meta.fontes && meta.fontes.length > 0) ||
          meta.notas_do_autor ||
          meta.nivel_sigilo ||
          meta.status;

        // Também aceitamos que alguns modelos coloquem esses campos direto na ficha,
        // então usamos o que vier em f.* como fallback.
        const descricao_data =
          typeof f.descricao_data === "string"
            ? f.descricao_data
            : meta.descricao_data ?? null;
        const data_inicio =
          typeof f.data_inicio === "string"
            ? f.data_inicio
            : meta.data_inicio ?? null;
        const data_fim =
          typeof f.data_fim === "string" ? f.data_fim : meta.data_fim ?? null;
        const generalidade_data =
          typeof f.generalidade_data === "string"
            ? f.generalidade_data
            : meta.generalidade_data ?? null;
        const camada_temporal =
          typeof f.camada_temporal === "string"
            ? f.camada_temporal
            : meta.camada_temporal ?? null;

        return {
          tipo: normalizedTipo,
          titulo: String(f.titulo ?? "").trim(),
          resumo: String(f.resumo ?? "").trim(),
          conteudo: String(f.conteudo ?? "").trim(),
          tags: Array.isArray(f.tags)
            ? f.tags.map((t: any) => String(t))
            : [],
          // Mantemos ano_diegese apenas como campo legado, sempre null por enquanto
          ano_diegese:
            typeof f.ano_diegese === "number" ? f.ano_diegese : null,
          aparece_em: String(f.aparece_em ?? "").trim(),
          descricao_data,
          data_inicio,
          data_fim,
          generalidade_data,
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
      descricao_data: null,
      data_inicio: null,
      data_fim: null,
      generalidade_data: null,
      camada_temporal: null,
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
