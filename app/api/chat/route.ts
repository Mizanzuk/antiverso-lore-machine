import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: NextRequest) {
  try {
    // Se a chave não estiver configurada, avisa claramente
    if (!openai) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY não configurada. Defina a chave no painel de variáveis de ambiente da Vercel.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);

    const messages = (body?.messages ?? []) as Message[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma mensagem válida enviada para /api/chat." },
        { status: 400 }
      );
    }

    // Última mensagem do usuário para usar na busca de lore
    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    const userQuestion =
      lastUser?.content ??
      "Resuma a conversa e responda da melhor forma possível com base no AntiVerso.";

    // Busca trechos relevantes no banco de lore
    const loreResults = await searchLore(userQuestion, 8);

    const loreContext =
      loreResults && loreResults.length > 0
        ? loreResults
            .map(
              (chunk: any, idx: number) =>
                `### Trecho ${idx + 1} — ${chunk.title} [fonte: ${chunk.source}]
${chunk.content}`
            )
            .join("\n\n")
        : "Nenhum trecho relevante encontrado no banco de lore.";

    // Mensagem de contexto para o modelo, antes das mensagens originais
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, guardião do AntiVerso.",
        "Você está respondendo dentro da AntiVerso Lore Machine.",
        "Use APENAS o lore abaixo como base factual. Se algo não estiver nos trechos, deixe claro que é especulação ou criação nova.",
        "",
        loreContext,
      ].join("\n"),
    };

    // Chamada ao modelo (sem streaming, resposta única)
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      max_tokens: 900,
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "Não consegui gerar uma resposta no momento.";

    // IMPORTANTE: volta a responder em JSON,
    // compatível com o front que faz `const data = await res.json()`
    return NextResponse.json({
      reply,
      sources: loreResults ?? [],
    });
  } catch (err) {
    console.error("Erro em /api/chat:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a requisição." },
      { status: 500 }
    );
  }
}
