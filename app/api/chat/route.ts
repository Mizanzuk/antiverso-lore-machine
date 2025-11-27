import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

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

async function fetchGlobalRules(universeId?: string, userId?: string): Promise<string> {
  if (!supabaseAdmin || !universeId || !isValidUUID(universeId)) {
    return "";
  }

  try {
    // Busca o mundo raiz com segurança
    let query = supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId)
      .eq("is_root", true);
    
    if (userId) query = query.eq("user_id", userId);

    const { data: rootWorld, error: worldError } = await query.maybeSingle();

    if (worldError || !rootWorld) return "";

    // Busca regras
    const { data: rules } = await supabaseAdmin
      .from("fichas")
      .select("titulo, conteudo, tipo")
      .eq("world_id", rootWorld.id)
      .in("tipo", ["regra_de_mundo", "epistemologia", "conceito"]);

    if (!rules || rules.length === 0) return "";

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

    // Captura o User ID do header (enviado pelo frontend seguro)
    const userId = req.headers.get("x-user-id") || undefined;

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
    
    // 1. Busca Contextual (COM USER_ID)
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      const loreResults = await searchLore(userQuestion, { 
        limit: 10, 
        universeId,
        userId // Passando a credencial
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

    // 2. Busca de Regras Globais (COM USER_ID)
    const globalRules = await fetchGlobalRules(universeId, userId);

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
