import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

type ExtractResponsePayload = {
  worldId: string;
  documentName: string;
  personagens: any[];
  locais: any[];
  empresas: any[];
  agencias: any[];
  midias: any[];
};

export async function POST(req: NextRequest) {
  try {
    // Garante em tempo de execução e satisfaz o TypeScript:
    if (!openai) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY não configurada. Defina a chave no painel de variáveis de ambiente da Vercel.",
        },
        { status: 500 },
      );
    }

    const body = await req.json();
    const worldId = String(body.worldId ?? "").trim();
    const documentName = String(body.documentName ?? "").trim();
    const text = String(body.text ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "Texto vazio. Envie um texto para análise." },
        { status: 400 },
      );
    }

    const systemInstructions = `
Você é Or, guardião do AntiVerso, encarregado de analisar roteiros e textos
para extrair entidades e transformá-las em fichas de lore.

Você deve SEMPRE devolver a resposta em JSON válido, sem comentários, sem texto
explicativo, no seguinte formato exato:

{
  "personagens": [ { ... } ],
  "locais": [ { ... } ],
  "empresas": [ { ... } ],
  "agencias": [ { ... } ],
  "midias": [ { ... } ]
}

Cada item deve ter preferencialmente os campos abaixo:

- "tipo": um destes valores exatos: "personagem", "local", "empresa", "agencia", "midia"
- "titulo": nome curto da entidade (obrigatório)
- "resumo": descrição resumida da entidade
- "conteudo": descrição mais longa
- "tags": lista de palavras-chave (array de strings)
- "ano_diegese": ano em que a entidade aparece na história (se fizer sentido)
- "ordem_cronologica": número ou índice que ajude a ordenar eventos
- "aparece_em": texto curto explicando em quais episódios/cenas esse elemento aparece
- "codes": lista de códigos sugeridos (ex: ["AV1-PS1", "SAL1-PS3"]) – se não souber, deixe lista vazia

Se não encontrar nada em alguma categoria, devolva um array vazio para ela.
`;

    const userPrompt = `
Mundo de destino: ${worldId || "desconhecido"}
Nome do documento: ${documentName || "sem nome"}

Leia o texto abaixo e extraia TODAS as entidades relevantes para o lore,
classificando-as em PERSONAGENS, LOCAIS, EMPRESAS, AGÊNCIAS e MÍDIAS.

Texto a analisar (em português):

"""${text}"""
`;

    const completion = await openai!.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1400,
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed: any | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error("Falha ao fazer JSON.parse da resposta de extração:", err);
      return NextResponse.json(
        {
          error:
            "A resposta da IA não veio em JSON válido. Tente novamente com um texto menor ou revise o conteúdo.",
        },
        { status: 500 },
      );
    }

    const payload: ExtractResponsePayload = {
      worldId,
      documentName,
      personagens: Array.isArray(parsed?.personagens)
        ? parsed.personagens
        : [],
      locais: Array.isArray(parsed?.locais) ? parsed.locais : [],
      empresas: Array.isArray(parsed?.empresas) ? parsed.empresas : [],
      agencias: Array.isArray(parsed?.agencias) ? parsed.agencias : [],
      midias: Array.isArray(parsed?.midias) ? parsed.midias : [],
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Erro inesperado em /api/lore/extract:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a extração de lore." },
      { status: 500 },
    );
  }
}
