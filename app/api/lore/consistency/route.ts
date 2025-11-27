// app/api/lore/consistency/route.ts

import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { searchLore } from "@/lib/rag";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!openai || !supabaseAdmin) {
      return NextResponse.json({ error: "Serviços não configurados." }, { status: 500 });
    }

    const { input, universeId } = await req.json();

    if (!input) {
      return NextResponse.json({ error: "Input necessário." }, { status: 400 });
    }

    // 1. RAG FOCADO: Busca fatos existentes que se assemelham ao input
    // Aumentamos o limite para pegar mais contexto temporal e regras
    const relatedFacts = await searchLore(input, { 
      limit: 10, 
      universeId,
      minSimilarity: 0.3 
    });

    // 2. BUSCA DE ENTIDADES ESPECÍFICAS (Reforço)
    // Se o texto menciona nomes que já existem, buscamos seus dados vitais (nascimento/morte)
    // Isso é uma busca "burra" de texto para garantir que pegamos fichas exatas
    const keywords = input.match(/[A-Z][a-zÀ-ÿ]+(?:\s[A-Z][a-zÀ-ÿ]+)*/g) || [];
    let hardFacts = "";
    
    if (keywords.length > 0 && universeId) {
        // Remove duplicatas e limita
        const uniqueNames = Array.from(new Set(keywords)).slice(0, 5);
        
        const { data: entities } = await supabaseAdmin
            .from("fichas")
            .select("titulo, tipo, ano_diegese, data_inicio, data_fim, conteudo")
            .in("titulo", uniqueNames) // Busca exata por nome
            .limit(5);

        if (entities && entities.length > 0) {
            hardFacts = entities.map((e: any) => 
                `[DADO RÍGIDO] ${e.titulo} (${e.tipo}): Ano Base ${e.ano_diegese || "?"}, Início ${e.data_inicio || "?"}, Fim/Morte ${e.data_fim || "?"}.`
            ).join("\n");
        }
    }

    // 3. O JUIZ (Prompt de Verificação)
    const systemPrompt = `
Você é o Módulo de Coerência Lógica do AntiVerso.
Sua única função é detectar INCONSISTÊNCIAS, ANACRONISMOS e FUROS DE ROTEIRO.

CONTEXTO ESTABELECIDO (Verdade Absoluta):
${relatedFacts.map((f) => `- ${f.title}: ${f.content.slice(0, 300)}...`).join("\n")}
${hardFacts}

INPUT PROPOSTO (O que o usuário quer criar):
"""${input}"""

ANÁLISE:
Analise se o Input Proposto contradiz o Contexto Estabelecido.
Procure por:
1. Personagens agindo após sua morte ou antes de nascer.
2. Personagens em dois lugares ao mesmo tempo.
3. Contradição de regras de mundo ou personalidade estabelecida.
4. Erros de continuidade (ex: um prédio destruído aparecendo intacto no futuro).

RESPOSTA:
Se não houver erros, responda apenas: "COERENTE".
Se houver riscos, comece com "ALERTA DE INCONSISTÊNCIA:" e liste os problemas de forma direta e curta.
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Rápido e capaz de lógica simples
      temperature: 0.1, // Baixa criatividade, alta precisão
      messages: [{ role: "system", content: systemPrompt }],
    });

    const analysis = completion.choices[0]?.message?.content || "Sem análise.";

    return NextResponse.json({ 
      isConsistent: !analysis.includes("ALERTA"),
      analysis 
    });

  } catch (err: any) {
    console.error("Erro na verificação de coerência:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
