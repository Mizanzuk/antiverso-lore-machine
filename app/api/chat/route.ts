import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// Função auxiliar para buscar regras globais do AntiVerso
async function fetchGlobalRules(): Promise<string> {
  if (!supabaseAdmin) return "";

  // 1. Descobrir o ID do mundo "AntiVerso" (ou usar hardcoded se você tiver certeza do ID)
  // Aqui vamos buscar pelo slug ou nome, assumindo que o ID textual seja 'antiverso' ou buscamos pelo nome
  // No seu seed atual, o id é 'antiverso'.
  const worldId = "antiverso"; 

  // 2. Buscar fichas de Regra de Mundo e Epistemologia desse universo
  const { data } = await supabaseAdmin
    .from("fichas")
    .select("titulo, conteudo, tipo")
    .eq("world_id", worldId)
    .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]); // Tipos que definem leis universais

  if (!data || data.length === 0) return "";

  // 3. Formatar como texto para o Prompt
  const rulesText = data
    .map(f => `- [${f.tipo.toUpperCase()}] ${f.titulo}: ${f.conteudo}`)
    .join("\n");

  return `
### LEIS IMUTÁVEIS DO UNIVERSO (ANTIVERSO)
Estas regras se aplicam a TODOS os mundos e histórias, sem exceção:
${rulesText}
`;
}

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

    const body = await req.json().catch(() => null);
    const messages = (body?.messages ?? []) as Message[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma mensagem válida enviada para /api/chat." },
        { status: 400 }
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Vetorial (RAG) baseada na pergunta do usuário
    const loreResults = await searchLore(userQuestion, { limit: 8 });
    
    const loreContext =
      loreResults && loreResults.length > 0
        ? loreResults
            .map(
              (chunk: any, idx: number) =>
                `### Trecho Relacionado ${idx + 1} — ${chunk.title} [fonte: ${chunk.source}]\n${chunk.content}`
            )
            .join("\n\n")
        : "Nenhum trecho específico encontrado.";

    // 2. Busca de Regras Globais (Injeção de Contexto)
    const globalRules = await fetchGlobalRules();

    // 3. Montagem do System Prompt
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, guardião do AntiVerso.",
        "Você está respondendo dentro da AntiVerso Lore Machine.",
        "",
        globalRules, // <--- AQUI ENTRAM AS REGRAS DO UNIVERSO
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO (RAG)",
        "Use estes dados para responder à pergunta atual:",
        loreContext,
        "",
        "Se algo não estiver nos trechos, deixe claro que é especulação ou criação nova (se estiver em modo Criativo).",
      ].join("\n"),
    };

    // 4. Chamada ao Modelo (Streaming)
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Recomendo o Turbo ou 4o para lidar melhor com instruções complexas
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      stream: true, // Habilita streaming
    });

    // Retorna o stream diretamente
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            controller.enqueue(new TextEncoder().encode(content));
          }
        }
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (err: any) {
    console.error("Erro em /api/chat:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar a requisição." },
      { status: 500 }
    );
  }
}
