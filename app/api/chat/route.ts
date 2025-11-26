import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// --- VALIDAÇÃO DE UUID ---
// Garante que só enviamos para o banco IDs que são UUIDs válidos, evitando crash do Postgres
function isValidUUID(uuid: any): boolean {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// --- BUSCA DE REGRAS GLOBAIS ---
// Busca as regras do "Mundo Raiz" do Universo selecionado
async function fetchGlobalRules(universeId?: string): Promise<string> {
  // Se não tem Supabase ou o ID é inválido, retorna vazio sem erro
  if (!supabaseAdmin || !universeId || !isValidUUID(universeId)) {
    return "";
  }

  try {
    // 1. Descobrir qual é o "Mundo Raiz" (is_root) deste Universo
    const { data: rootWorld, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .maybeSingle(); // 'maybeSingle' evita erro 500 se não encontrar

    if (worldError || !rootWorld) {
      return "";
    }

    // 2. Buscar fichas de Regra de Mundo, Epistemologia e Conceitos desse Mundo Raiz
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (rulesError || !rules || rules.length === 0) {
      return "";
    }

    // 3. Formatar texto para o Prompt do Or
    const rulesText = rules
      .map((f) => `- [${f.tipo.toUpperCase()}] ${f.titulo}: ${f.conteudo}`)
      .join("\n");

    return `
### LEIS IMUTÁVEIS DO UNIVERSO ATUAL
Estas regras se aplicam a TODOS os mundos e histórias deste universo, sem exceção:
${rulesText}
`;
  } catch (err) {
    console.error("Erro ao buscar regras globais (ignorado para não travar):", err);
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
        { error: "Nenhuma mensagem válida enviada para /api/chat." },
        { status: 400 }
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Vetorial (RAG)
    // Envolvemos em try/catch para que falhas na busca não derrubem o chat inteiro
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      // 'as any' é usado aqui para evitar erro de TypeScript caso o arquivo lib/rag.ts
      // ainda não tenha sido atualizado com a tipagem do universeId, mas funciona em runtime.
      const searchOptions: any = { limit: 8, universeId }; 
      
      const loreResults = await searchLore(userQuestion, searchOptions);
      
      if (loreResults && loreResults.length > 0) {
        loreContext = loreResults
          .map(
            (chunk: any, idx: number) =>
              `### Trecho Relacionado ${idx + 1} — ${chunk.title} [fonte: ${chunk.source}]\n${chunk.content}`
          )
          .join("\n\n");
      }
    } catch (ragError) {
      console.error("Erro no RAG (ignorado):", ragError);
    }

    // 2. Busca de Regras Globais do Universo Selecionado
    const globalRules = await fetchGlobalRules(universeId);

    // 3. Montagem do System Prompt
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules, // Injeção das regras do universo
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO (RAG)",
        "Use estes dados para responder à pergunta atual (se relevante):",
        loreContext,
        "",
        "Se a pergunta for sobre algo não listado aqui, use sua criatividade (se estiver em modo criativo) ou diga que não sabe (se estiver em modo consulta).",
      ].join("\n"),
    };

    // 4. Chamada ao Modelo (Streaming)
    // IMPORTANTE: Usar gpt-4o-mini ou gpt-3.5-turbo. "gpt-4.1-mini" não existe.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [contextMessage, ...messages],
      temperature: 0.7,
      stream: true, // Habilita streaming
    });

    // Retorna o stream diretamente para o frontend
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
    console.error("Erro CRÍTICO em /api/chat:", err);
    // Retorna um erro JSON claro para o frontend tratar
    return NextResponse.json(
      { error: `Erro interno ao processar chat: ${err.message}` },
      { status: 500 }
    );
  }
}
