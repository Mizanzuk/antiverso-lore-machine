
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY não configurada. Defina a chave no painel de variáveis de ambiente da Vercel.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages = (body.messages || []) as Message[];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "";

    const loreResults = await searchLore(userQuestion);

    const systemPrompt = [
      "Você é Or, o guardião do AntiVerso, um assistente especializado em organizar e expandir o universo ficcional do AntiVerso.",
      "Você está em um ambiente fechado: só pode usar informações fornecidas no banco de dados de lore e em trechos de contexto.",
      "Modo CONSULTA: se o usuário pedir explicitamente para NÃO inventar nada ou disser 'em modo consulta', responda apenas com base no contexto de lore fornecido, e se algo não existir diga que ainda não foi definido.",
      "Modo CRIAÇÃO: se o usuário pedir ajuda para criar, expandir ou inventar histórias, você pode propor ideias novas, mas tente mantê-las coerentes com o lore fornecido.",
      "Sempre deixe claro quando estiver propondo algo novo ('proposta de novo elemento de lore') e quando estiver citando algo que já existe no canon.",
    ].join("\n");

    const loreContext =
      loreResults.length > 0
        ? loreResults
            .map(
              (c, idx) =>
                `# Trecho ${idx + 1} — ${c.title} [fonte: ${c.source}]
${c.content}`
            )
            .join("\n\n")
        : "Nenhum trecho relevante encontrado no banco de lore.";

    const contextMessage: Message = {
      role: "system",
      content:
        systemPrompt +
        "\n\n### Contexto de lore disponível:\n" +
        loreContext,
    };

    // STREAMING: usamos o SDK novo da OpenAI com `stream: true`
    const stream = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      max_tokens: 900,
      stream: true,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (!delta) continue;
            controller.enqueue(encoder.encode(delta));
          }
        } catch (error) {
          console.error("Erro durante o streaming da resposta:", error);
          controller.enqueue(
            encoder.encode(
              "Desculpe, ocorreu um erro enquanto eu gerava a resposta."
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a requisição." },
      { status: 500 }
    );
  }
}
