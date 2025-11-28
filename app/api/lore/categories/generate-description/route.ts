// ============================================
// ARQUIVO: app/api/lore/categories/generate-description/route.ts
// ============================================
// Gera descrição detalhada de categoria usando IA

import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { categoryName, categorySlug } = await req.json();

    if (!categoryName) {
      return NextResponse.json(
        { error: "categoryName é obrigatório" },
        { status: 400 }
      );
    }

    const prompt = `Você é um especialista em design de sistemas de catalogação e extração de informações.

Sua tarefa é criar uma descrição DETALHADA e INSTRUTIVA para uma categoria de fichas chamada "${categoryName}" (slug: ${categorySlug}).

Esta descrição será usada por uma IA de extração de texto para identificar elementos desta categoria em narrativas.

A descrição DEVE seguir este formato EXATO:

**Definição:** [Explique o que é esta categoria em 1-2 frases]

**Quando identificar:**
- [Critério 1: quando criar uma ficha desta categoria]
- [Critério 2: situações específicas que indicam esta categoria]
- [Critério 3: exemplos de menções que devem gerar fichas]

**Exemplos no texto:**
- "[Exemplo 1 de texto]" → criar ficha "[Nome da Ficha]" (tipo: ${categorySlug})
- "[Exemplo 2 de texto]" → criar ficha "[Nome da Ficha]" (tipo: ${categorySlug})

**Exemplo de extração:**
Texto: "[Trecho de exemplo realista]"
Saída JSON:
{
  "tipo": "${categorySlug}",
  "titulo": "[Título da Ficha]",
  "resumo": "[Resumo curto em 1 frase]",
  "conteudo": "[Conteúdo detalhado usando @ para links]",
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}

IMPORTANTE:
- Seja ESPECÍFICO e DETALHADO
- Use exemplos REALISTAS e VARIADOS
- A descrição deve ser AGRESSIVA na identificação (não deixar passar nada)
- Foque em COMO a IA deve identificar, não apenas O QUE é a categoria

Gere a descrição agora:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Você é um especialista em design de sistemas de catalogação. Seja preciso, detalhado e instrutivo.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const description = completion.choices[0].message.content;

    return NextResponse.json({ description });
  } catch (err: any) {
    console.error("[GENERATE-DESCRIPTION] Erro:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
