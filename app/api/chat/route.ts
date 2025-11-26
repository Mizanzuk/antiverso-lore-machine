import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// Validador rigoroso de UUID v4
function isValidUUID(uuid: any): boolean {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// Função auxiliar BLINDADA para buscar regras globais
async function fetchGlobalRules(universeId?: string): Promise<string> {
  // Se não tem ID ou o ID é inválido (ex: string vazia, "undefined"), ignora silenciosamente.
  if (!universeId || !isValidUUID(universeId)) {
    return "";
  }

  if (!supabaseAdmin) {
    console.warn("Supabase Admin não está configurado. Pulando regras globais.");
    return "";
  }

  try {
    // 1. Descobrir qual é o "Mundo Raiz" (is_root) deste Universo
    const { data: rootWorld, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .maybeSingle(); // Use maybeSingle para não estourar erro se não achar

    if (worldError) {
      console.error("Erro ao buscar mundo raiz:", worldError.message);
      return "";
    }

    if (!rootWorld) {
      // Universo existe mas não tem mundo raiz definido. Segue o jogo.
      return "";
    }

    // 2. Buscar fichas de Regra de Mundo e Epistemologia desse Mundo Raiz
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (rulesError) {
      console.error("Erro ao buscar fichas de regras:", rulesError.message);
      return "";
    }

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
    console.error("Erro inesperado ao buscar regras globais (ignorado para não travar o chat):", err);
    return ""; 
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const messages = (body?.messages ?? []) as Message[];
    const universeId = body?.universeId as string | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma mensagem válida enviada." },
        { status: 400 }
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // --- 1. BUSCA VETORIAL (RAG) BLINDADA ---
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      const loreResults = await searchLore(userQuestion, { limit: 8 });
      if (loreResults && loreResults.length > 0) {
        loreContext = loreResults
          .map(
            (chunk: any, idx: number) =>
              `### Trecho Relacionado ${idx + 1} — ${chunk.title} [fonte: ${chunk.source}]\n${chunk.content}`
          )
          .join("\n\n");
      }
    } catch (ragError) {
      console.error("Falha no RAG (ignorada):", ragError);
      // Chat continua sem contexto extra se o RAG falhar
    }

    // --- 2. REGRAS GLOBAIS BLINDADAS ---
    let globalRules = "";
    try {
      globalRules = await fetchGlobalRules(universeId);
    } catch (rulesError) {
      console.error("Falha nas Regras Globais (ignorada):", rulesError);
    }

    // --- 3. MONTAGEM DO PROMPT ---
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules, 
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO (RAG)",
        "Use estes dados para responder à pergunta atual (se relevante):",
        loreContext,
        "",
        "Se a pergunta for sobre algo não listado aqui, use sua criatividade (se estiver em modo criativo) ou diga que não sabe (se estiver em modo consulta).",
      ].join("\n"),
    };

    // --- 4. CHAMADA OPENAI ---
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
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
    console.error("ERRO CRÍTICO em /api/chat:", err);
    // Retorna JSON de erro claro para o frontend
    return NextResponse.json(
      { error: `Erro interno no chat: ${err.message}` },
      { status: 500 }
    );
  }
}
