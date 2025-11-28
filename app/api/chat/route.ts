import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importação crítica

export const dynamic = "force-dynamic";

type Message = { role: "user" | "assistant" | "system"; content: string };

const PERSONAS = {
  consulta: {
    nome: "Urizen",
    titulo: "A Lei (Consulta)",
    descricao: "Guardião da Lei e da Lógica, responsável por consultar fatos estabelecidos.",
    modo: "CONSULTA ESTRITA",
  },
  criativo: {
    nome: "Urthona",
    titulo: "O Fluxo (Criativo)",
    descricao: "Forjador da Visão e da Imaginação, livre para expandir o universo.",
    modo: "CRIATIVO COM PROTOCOLO DE COERÊNCIA",
  }
};

function isValidUUID(uuid: any): boolean {
  if (typeof uuid !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

// Agora recebe o cliente supabase autenticado
async function fetchGlobalRules(supabase: any, universeId?: string): Promise<string> {
  if (!universeId || !isValidUUID(universeId)) {
    return "";
  }

  try {
    const { data: rootWorld, error: worldError } = await supabase
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true)
      .maybeSingle();

    if (worldError || !rootWorld) return "";

    const { data: rules } = await supabase
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (!rules || rules.length === 0) return "";

    const rulesText = rules
      .map((f: any) => `- [${f.tipo.toUpperCase()}] ${f.titulo}: ${f.conteudo}`)
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

    // 1. Autenticação com Fallback
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId && supabaseAdmin) {
            clientToUse = supabaseAdmin;
            userId = headerUserId;
        }
    }

    if (!userId) {
      return NextResponse.json({ error: "Acesso negado (401)." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const messages = (body?.messages ?? []) as Message[];
    const universeId = body?.universeId as string | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Nenhuma mensagem válida." }, { status: 400 });
    }

    const systemMessageFromFrontend = messages.find(m => m.role === "system")?.content || "";
    const isCreativeMode = systemMessageFromFrontend.includes("MODO CRIATIVO");
    const currentPersona = isCreativeMode ? PERSONAS.criativo : PERSONAS.consulta;
    
    const conversationMessages = messages.filter(m => m.role !== "system");
    const lastUser = [...conversationMessages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";
    
    // 1. Busca Contextual (Passando o cliente seguro)
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      const loreResults = await searchLore(clientToUse, userQuestion, { 
        limit: 10, 
        universeId
      });
      
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

    // 2. Busca de Regras Globais
    const globalRules = await fetchGlobalRules(clientToUse, universeId);

    let specificInstructions = "";
    if (isCreativeMode) {
      specificInstructions = `
VOCÊ É ${currentPersona.nome}. VOCÊ ESTÁ EM MODO CRIATIVO, MAS COM O PROTOCOLO DE COERÊNCIA ATIVO.
Você é livre para expandir o universo, mas DEVE checar datas, status de vida/morte e regras nos [FATOS ESTABELECIDOS].
Se o usuário sugerir algo que contradiz um fato, AVISE sobre a inconsistência.
`;
    } else {
      specificInstructions = `
VOCÊ É ${currentPersona.nome}. VOCÊ ESTÁ EM MODO CONSULTA ESTRITA.
Responda APENAS com base nos [FATOS ESTABELECIDOS] e nas [LEIS IMUTÁVEIS].
Não invente. Se a informação não estiver no contexto, diga que não sabe.
`;
    }

    const contextMessage: Message = {
      role: "system",
      content: [
        `Você é ${currentPersona.nome}, o ${currentPersona.titulo} deste Universo.`, 
        `Sua função é atuar como ${currentPersona.descricao}.`,
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
