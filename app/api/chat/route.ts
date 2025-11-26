import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// --- VALIDAÇÃO DE UUID ---
// Evita que IDs vazios ou inválidos quebrem a query do banco
function isValidUUID(uuid: any): boolean {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// Função auxiliar BLINDADA para buscar regras globais
async function fetchGlobalRules(universeId?: string): Promise<string> {
  // Se não tem ID ou o ID é inválido, retorna vazio sem consultar o banco
  if (!universeId || !isValidUUID(universeId)) {
    return "";
  }

  if (!supabaseAdmin) return "";

  try {
    // 1. Descobrir qual é o "Mundo Raiz" (is_root) deste Universo
    const { data: rootWorld, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .maybeSingle(); // 'maybeSingle' não estoura erro se não encontrar

    if (worldError || !rootWorld) return "";

    // 2. Buscar fichas de Regras desse Mundo Raiz
    const { data: rules } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (!rules || rules.length === 0) return "";

    // 3. Formatar texto
    const rulesText = rules
      .map((f) => `- [${f.tipo.toUpperCase()}] ${f.titulo}: ${f.conteudo}`)
      .join("\n");

    return `
### LEIS IMUTÁVEIS DO UNIVERSO ATUAL
Estas regras se aplicam a TODOS os mundos e histórias deste universo, sem exceção:
${rulesText}
`;
  } catch (err) {
    console.error("Erro ao buscar regras (ignorado):", err);
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
      return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Vetorial (RAG) - Com try/catch para não quebrar tudo se falhar
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      const loreResults = await searchLore(userQuestion, { limit: 8 });
      if (loreResults && loreResults.length > 0) {
        loreContext = loreResults
          .map((chunk: any, idx: number) => `### Trecho ${idx + 1} — ${chunk.title}\n${chunk.content}`)
          .join("\n\n");
      }
    } catch (ragErr) {
      console.error("Erro no RAG:", ragErr);
    }

    // 2. Busca Regras Globais (Blindada)
    const globalRules = await fetchGlobalRules(universeId);

    // 3. System Prompt
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules, 
        "",
        "### CONTEXTO ESPECÍFICO (RAG)",
        loreContext,
        "",
        "Se a pergunta for sobre algo não listado aqui, use sua criatividade (se estiver em modo criativo) ou diga que não sabe (se estiver em modo consulta).",
      ].join("\n"),
    };

    // 4. Chamada OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      stream: true,
    });

    // Retorna Stream
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) controller.enqueue(new TextEncoder().encode(content));
        }
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (err: any) {
    console.error("ERRO CRÍTICO /api/chat:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
