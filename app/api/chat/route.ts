import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// Função auxiliar para buscar regras globais do Universo selecionado
async function fetchGlobalRules(universeId?: string): Promise<string> {
  if (!supabaseAdmin || !universeId) return "";

  try {
    // 1. Descobrir qual é o "Mundo Raiz" (is_root) deste Universo
    // É nele que estão salvas as regras globais.
    const { data: rootWorld, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .single();

    if (worldError || !rootWorld) {
      // Se não achou mundo raiz, tenta buscar qualquer mundo desse universo para não quebrar
      // ou simplesmente retorna vazio se não houver regras.
      return "";
    }

    // 2. Buscar fichas de Regra de Mundo e Epistemologia desse Mundo Raiz
    const { data: rules } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (!rules || rules.length === 0) return "";

    // 3. Formatar como texto para o Prompt
    const rulesText = rules
      .map((f) => `- [${f.tipo.toUpperCase()}] ${f.titulo}: ${f.conteudo}`)
      .join("\n");

    return `
### LEIS IMUTÁVEIS DO UNIVERSO ATUAL
Estas regras se aplicam a TODOS os mundos e histórias deste universo, sem exceção:
${rulesText}
`;
  } catch (err) {
    console.error("Erro ao buscar regras globais:", err);
    return "";
  }
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
    const universeId = body?.universeId as string | undefined; // Recebe o ID do frontend

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma mensagem válida enviada para /api/chat." },
        { status: 400 }
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Vetorial (RAG)
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

    // 2. Busca de Regras Globais do Universo Selecionado
    const globalRules = await fetchGlobalRules(universeId);

    // 3. Montagem do System Prompt
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules, // <--- Regras dinâmicas do universo atual
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO (RAG)",
        "Use estes dados para responder à pergunta atual (se relevante):",
        loreContext,
        "",
        "Se a pergunta for sobre algo não listado aqui, use sua criatividade (se estiver em modo criativo) ou diga que não sabe (se estiver em modo consulta).",
      ].join("\n"),
    };

    // 4. Chamada ao Modelo (Streaming)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Usando modelo mais rápido e barato, troque para gpt-4-turbo se precisar de mais inteligência
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      stream: true,
    });

    // Retorna o stream
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
