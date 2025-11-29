// ============================================
// ARQUIVO: app/api/lore/categories/generate-description/route.ts
// ============================================
// Gera descrição detalhada de categoria usando IA
// VERSÃO MELHORADA com formato "CORRETO vs INCORRETO"

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

    const prompt = `Você é um especialista em design de sistemas de catalogação e extração de informações narrativas.

Sua tarefa é criar uma descrição ULTRA-AGRESSIVA e INSTRUTIVA para uma categoria de fichas chamada "${categoryName}" (slug: ${categorySlug}).

Esta descrição será usada por uma IA de extração de texto para identificar elementos desta categoria em narrativas. A IA precisa de instruções CLARAS, DIRETAS e com EXEMPLOS PRÁTICOS do que fazer e o que NÃO fazer.

A descrição DEVE seguir este formato EXATO:

${categoryName.toUpperCase()}: Extraia TODOS os [descrição ampla da categoria]. Seja EXTREMAMENTE GENEROSO - se algo parece ser [tipo de elemento], EXTRAIA como ficha de ${categoryName}.

EXEMPLO DE EXTRAÇÃO:
Texto: "[Trecho realista de 1-2 frases que menciona 2-3 elementos desta categoria]"

✅ CORRETO - Extrair [N] fichas de ${categoryName.toUpperCase()}:
1. "[Nome do Elemento 1]" ([descrição curta])
2. "[Nome do Elemento 2]" ([descrição curta])
3. "[Nome do Elemento 3]" ([descrição curta])

❌ ERRADO - [Descrever o erro comum que a IA comete]:
- "[Exemplo de raciocínio incorreto 1]"
- "[Exemplo de raciocínio incorreto 2]"

REGRA DE OURO: [Regra simples e direta de 1 frase que resume quando extrair]. É melhor extrair demais do que deixar passar.

INSTRUÇÕES PARA VOCÊ:
1. Seja ESPECÍFICO sobre o que pertence a esta categoria
2. Use exemplos REALISTAS e VARIADOS no "Texto:"
3. Mostre CLARAMENTE o que é CORRETO (✅) e o que é ERRADO (❌)
4. A "REGRA DE OURO" deve ser SIMPLES e MEMORÁVEL
5. Foque em COMO a IA deve identificar, não apenas O QUE é a categoria
6. Seja AGRESSIVO - instrua a IA a extrair mesmo menções casuais ou indiretas

EXEMPLOS DE CATEGORIAS BEM DESCRITAS:

LOCAL: Extraia TODOS os locais, lugares, espaços físicos, endereços, estabelecimentos, ou ambientes mencionados no texto.

EXEMPLO DE EXTRAÇÃO:
Texto: "João foi ao corredor, entrou na sala de aula, e depois esperou Maria no ponto de ônibus."

✅ CORRETO - Extrair 3 fichas de LOCAL:
1. "Corredor" (espaço interno)
2. "Sala de Aula" (espaço interno)
3. "Ponto de Ônibus" (espaço externo)

❌ ERRADO - Ignorar locais casuais:
- "Corredor é só contexto, não precisa de ficha"
- "Ponto de ônibus não é importante"

REGRA DE OURO: Se você consegue responder "ONDE isso aconteceu?", EXTRAIA como local.

---

PERSONAGEM: Extraia TODAS as pessoas, personagens, indivíduos, seres conscientes, ou entidades com agência mencionadas no texto.

EXEMPLO DE EXTRAÇÃO:
Texto: "João comprou pão do dono da padaria e depois encontrou a professora de ciências."

✅ CORRETO - Extrair 3 fichas de PERSONAGEM:
1. "João" (personagem principal)
2. "Dono da Padaria" (personagem secundário)
3. "Professora de Ciências" (personagem secundário)

❌ ERRADO - Extrair apenas personagens principais:
- "Dono da padaria não tem nome, não precisa de ficha"
- "Professora é só mencionada, não é importante"

REGRA DE OURO: Se é uma pessoa ou ser consciente, EXTRAIA. Não importa se tem nome próprio ou não.

---

Agora, crie uma descrição no MESMO FORMATO para a categoria "${categoryName}":`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Você é um especialista em design de sistemas de catalogação. Seja preciso, direto e use o formato EXATO com ✅ CORRETO e ❌ ERRADO. Foque em ser AGRESSIVO na extração.",
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
