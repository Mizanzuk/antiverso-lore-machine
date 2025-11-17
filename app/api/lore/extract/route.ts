import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

// Tipos permitidos (no futuro podem vir do banco)
const allowedTypes = [
  "personagem",
  "local",
  "midia",
  "agencia",
  "empresa",
  "conceito",
  "regra_de_mundo",
  "evento",
  "epistemologia"
];

export const dynamic = "force-dynamic";

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

    const typeInstructions = allowedTypes
      .map((t) => `"${t}"`)
      .join(", ");

    const systemInstructions = `
Você é Or, guardião do AntiVerso.

Sua tarefa é analisar textos e extrair as entidades relevantes para o lore,
classificando-as de acordo com os tipos permitidos.

Nunca invente tipos fora da lista abaixo.

Tipos permitidos:
${typeInstructions}

Sempre devolva um JSON com a estrutura:

{
  "fichas": [
    {
      "tipo": um valor exato entre os tipos permitidos,
      "titulo": nome curto da entidade,
      "resumo": descrição resumida,
      "conteudo": explicação mais detalhada sobre a entidade,
      "tags": lista de palavras-chave (strings),
      "ano_diegese": ano da narrativa (se houver),
      "aparece_em": explicação breve de onde essa entidade aparece
    }
  ]
}

Se não encontrar nenhuma entidade válida, devolva "fichas": [].
`;

    const userPrompt = `
Mundo de destino: ${worldId || "desconhecido"}
Nome do documento: ${documentName || "sem nome"}

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
      max_tokens: 1600,
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

    const fichas = Array.isArray(parsed?.fichas) ? parsed.fichas : [];

    // Normaliza os campos
    const cleanFichas = fichas.map((f: any, index: number) => ({
      id_temp: `ficha_${index + 1}`,
      tipo: typeof f.tipo === "string" ? f.tipo : "conceito",
      titulo: String(f.titulo ?? "").trim(),
      resumo: String(f.resumo ?? "").trim(),
      conteudo: String(f.conteudo ?? "").trim(),
      tags: Array.isArray(f.tags) ? f.tags.map((t: any) => String(t)) : [],
      ano_diegese: typeof f.ano_diegese === "number" ? f.ano_diegese : null,
      aparece_em: String(f.aparece_em ?? "").trim(),
    }));

    // Compatibilidade com a UI atual: agrupa por tipo
    const personagens = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "personagem"
    );
    const locais = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "local"
    );
    const empresas = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "empresa"
    );
    const agencias = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "agencia"
    );
    const midias = cleanFichas.filter(
      (f) => f.tipo.toLowerCase() === "midia"
    );

    return NextResponse.json({
      worldId,
      documentName,
      fichas: cleanFichas, // modelo novo, mais geral
      personagens,
      locais,
      empresas,
      agencias,
      midias,              // campos antigos, para a UI atual não quebrar
    });
  } catch (err) {
    console.error("Erro inesperado em /api/lore/extract:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a extração de lore." },
      { status: 500 },
    );
  }
}
