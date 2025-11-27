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

    // Detecta o modo baseado no prompt do sistema que o frontend enviou
    // O frontend envia uma mensagem system inicial contendo "MODO CRIATIVO" ou "MODO CONSULTA"
    const systemMessageFromFrontend = messages.find(m => m.role === "system")?.content || "";
    const isCreativeMode = systemMessageFromFrontend.includes("MODO CRIATIVO");

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userQuestion = lastUser?.content ?? "Resuma a conversa.";

    // 1. Busca Vetorial (RAG)
    // Envolvemos em try/catch para que falhas na busca não derrubem o chat inteiro
    let loreContext = "Nenhum trecho específico encontrado.";
    try {
      // Aumentamos o limite para 10 para ter mais contexto para checagem de consistência
      // 'as any' é usado aqui para evitar erro de TypeScript caso o arquivo lib/rag.ts
      // ainda não tenha sido atualizado com a tipagem do universeId, mas funciona em runtime.
      const searchOptions: any = { limit: 10, universeId, minSimilarity: 0.35 }; 
      
      const loreResults = await searchLore(userQuestion, searchOptions);
      
      if (loreResults && loreResults.length > 0) {
        loreContext = loreResults
          .map(
            (chunk: any, idx: number) =>
              `[FATO ESTABELECIDO ${idx + 1}] — ${chunk.title} [fonte: ${chunk.source} / tipo: ${chunk.source_type}]\n${chunk.content}`
          )
          .join("\n\n");
      }
    } catch (ragError) {
      console.error("Erro no RAG (ignorado):", ragError);
    }

    // 2. Busca de Regras Globais do Universo Selecionado
    const globalRules = await fetchGlobalRules(universeId);

    // 3. Definição das Instruções de Comportamento (Protocolo de Coerência - Opção C)
    let specificInstructions = "";

    if (isCreativeMode) {
      specificInstructions = `
VOCÊ ESTÁ EM MODO CRIATIVO, MAS COM O PROTOCOLO DE COERÊNCIA ATIVO.
Você é livre para expandir o universo, sugerir ideias e criar novos elementos, PORÉM:
1. Você deve checar RIGOROSAMENTE as datas, status de vida/morte e regras nos [FATOS ESTABELECIDOS] acima.
2. Se o usuário sugerir algo que contradiz um fato existente (ex: usar um personagem que já morreu naquela data, contradizer uma regra mágica), você deve AVISAR o usuário sobre a inconsistência antes de prosseguir.
3. Exemplo de alerta ideal: "Essa é uma ideia interessante, mas note que [Personagem X] morreu em 2010, e sua cena se passa em 2015. Podemos situar isso antes, ou talvez seja um flashback?"
4. Se não houver contradição, flua livremente com a criatividade.
      `;
    } else {
      specificInstructions = `
VOCÊ ESTÁ EM MODO CONSULTA ESTRITA.
Responda APENAS com base nos [FATOS ESTABELECIDOS] e nas [LEIS IMUTÁVEIS].
Não invente informações que não estão no texto.
Se a informação não estiver disponível, diga explicitamente que "isso ainda não está definido nos arquivos".
      `;
    }

    // 4. Montagem do System Prompt Final
    const contextMessage: Message = {
      role: "system",
      content: [
        "Você é Or, o guardião criativo deste Universo.",
        "Você está respondendo dentro da Lore Machine.",
        "",
        globalRules, // Injeção das regras do universo
        "",
        "### CONTEXTO ESPECÍFICO ENCONTRADO (RAG)",
        "Use estes dados como verdade absoluta para responder à pergunta atual:",
        loreContext,
        "",
        "### INSTRUÇÕES DE COMPORTAMENTO",
        specificInstructions,
        "",
        "Se a pergunta for sobre algo não listado aqui, siga a instrução do seu MODO (Criativo ou Consulta)."
      ].join("\n"),
    };

    // Removemos a mensagem de sistema antiga vinda do frontend para evitar duplicação/conflito
    const conversationMessages = messages.filter(m => m.role !== "system");

    // 5. Chamada ao Modelo (Streaming)
    // IMPORTANTE: Usar gpt-4o-mini ou gpt-3.5-turbo. "gpt-4.1-mini" não existe.
    // Ajustamos a temperatura: 0.7 para criativo (mas controlado pelo prompt), 0.2 para consulta (precisão).
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [contextMessage, ...conversationMessages],
      temperature: isCreativeMode ? 0.7 : 0.2,
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
