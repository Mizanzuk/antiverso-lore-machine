import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ExtractedFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  ano_diegese: number | null;
  aparece_em: string;
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

    // 1) Salvar o texto bruto como Roteiro
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

    // 2) Chamar o modelo para extrair fichas estruturadas
    const systemPrompt = `
Você é um assistente especialista em análise de narrativa e worldbuilding.

Dado um texto de entrada, você deve extrair uma lista de FICHAS DE LORE estruturadas.
Cada ficha representa um elemento importante da história (personagens, locais, conceitos, eventos, etc.).

Regras importantes:
- Use apenas os tipos permitidos: ${allowedTypes.join(", ")}.
- Não crie fichas óbvias demais ou irrelevantes.
- Se tiver dúvida entre "conceito" e outro tipo, prefira um dos tipos mais específicos (personagem, local, evento, etc.).
- Respeite ao máximo as informações presentes no texto; evite inventar detalhes que não estão lá.
- Se o texto for muito curto, crie no máximo 1 a 3 fichas.

O formato de saída DEVE ser estritamente JSON com a seguinte forma:

{
  "fichas": [
    {
      "tipo": "personagem | local | midia | agencia | empresa | conceito | regra_de_mundo | evento | epistemologia",
      "titulo": "nome curto da ficha",
      "resumo": "resumo em 1 ou 2 frases, em português",
      "conteudo": "descrição mais longa da ficha, em português",
      "tags": ["lista", "de", "tags"],
      "ano_diegese": 1993 ou null,
      "aparece_em": "onde essa ficha aparece no texto (capítulo, episódio, cena, etc.)"
    }
  ]
}

NUNCA retorne comentários fora desse JSON.
`.trim();

    const userPrompt = `
Texto base para extração de lore:

"""${text}"""

Extraia as fichas seguindo exatamente o formato JSON especificado.
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 1500,
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
        };
      });

    // Compatibilidade com a UI atual: agrupa por tipo
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
      midias, // campos antigos, para a UI atual não quebrar
    });
  } catch (err) {
    console.error("Erro inesperado em /api/lore/extract:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a extração de lore." },
      { status: 500 },
    );
  }
}
