import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

// --- VALIDAÇÃO DE UUID ---
function isValidUUID(uuid: any): boolean {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// --- BUSCA DE REGRAS GLOBAIS ---
async function fetchGlobalRules(universeId?: string): Promise<string> {
  if (!supabaseAdmin || !universeId || !isValidUUID(universeId)) {
    return "";
  }

  try {
    // Busca o mundo raiz (is_root) deste universo
    const { data: rootWorld, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .maybeSingle();

    if (worldError || !rootWorld) return "";

    // Busca regras vinculadas ao mundo raiz
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (rulesError || !rules || rules.length === 0) return "";

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
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    const messages = (body?.messages ?? []) as Message[];
    const universeId = body?.universeId as string | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Nenhuma mensagem válida." }, { status: 400 });
    }

    // Detecta o modo (Criativo vs Consulta) baseado na primeira mensagem de sistema enviada pelo frontend
    const systemMessageFromFrontend = messages.find(m => m.role === "system")?.content || "";
    const isCreativeMode = systemMessageFromFrontend.includes("MODO CRIATIVO");

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Contextual (Fichas)
    // Usa a nova função searchLore que foca em texto e fichas vivas
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      const loreResults = await searchLore(userQuestion, { limit: 10, universeId });
      
      if (loreResults && loreResults.length > 0) {
        loreContext = loreResults
          .map((chunk: any, idx: number) =>
              `[FATO ESTABELECIDO ${idx + 1}] — ${chunk.title} [tipo: ${chunk.source_type}]\n${chunk.content}`
          )
          .join("\n\n");
      }
    } catch (ragError) {
      console.error("Erro na busca RAG:", ragError);
    }

    // 2. Busca de Regras Globais do Universo
    const globalRules = await fetchGlobalRules(universeId);

    // 3. Definição do Comportamento (Protocolo de Coerência)
    let specificInstructions = "";
    if (isCreativeMode) {
      specificInstructions = `
VOCÊ ESTÁ EM MODO CRIATIVO, MAS COM O PROTOCOLO DE COERÊNCIA ATIVO.
Você é livre para expandir o universo, mas DEVE checar datas, status de vida/morte e regras nos [FATOS ESTABELECIDOS].
Se o usuário sugerir algo que contradiz um fato (ex: personagem morto agindo), AVISE sobre a inconsistência.
Se não houver contradição, seja criativo e expanda a narrativa.
      `;
    } else {
      specificInstructions = `
VOCÊ ESTÁ EM MODO CONSULTA ESTRITA.
Responda APENAS com base nos [FATOS ESTABELECIDOS] e nas [LEIS IMUTÁVEIS].
Não invente. Se a informação não estiver no contexto, diga que não sabe ou que ainda não foi definida.
      `;
    }

    // 4. Montagem do Prompt de Sistema Final
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules,
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO",
        loreContext,
        "",
        "### INSTRUÇÕES DE COMPORTAMENTO",
        specificInstructions,
      ].join("\n"),
    };

    // Filtra a mensagem de sistema antiga do frontend para não duplicar
    const conversationMessages = messages.filter(m => m.role !== "system");

    // 5. Geração e Streaming
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [contextMessage, ...conversationMessages],
      temperature: isCreativeMode ? 0.7 : 0.2,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) controller.enqueue(new TextEncoder().encode(content));
        }
        controller.close();
      },
    });

    return new NextResponse(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  } catch (err: any) {
    console.error("Erro CRÍTICO em /api/chat:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
