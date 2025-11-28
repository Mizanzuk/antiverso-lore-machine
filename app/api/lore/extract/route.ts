// ============================================
// ARQUIVO: app/api/lore/extract/route.ts
// ============================================
// Versão FINAL com suporte a descrições do banco

import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; 

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// TIPOS
type FichaMeta = {
  periodo_diegese?: string | null;
  status?: "ativo" | "obsoleto" | "mesclado";
  relacoes?: {
    tipo: string;
    alvo_titulo?: string;
    alvo_id?: string;
  }[];
  [key: string]: any;
};

type ExtractedFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  ano_diegese: number | null;
  aparece_em: string;
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: FichaMeta;
};

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

function splitTextIntoChunks(text: string, maxChars = 12000): string[] {
  if (!text || text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = text.split("\n");
  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > maxChars) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += p + "\n";
  }
  if (currentChunk.trim()) chunks.push(currentChunk);
  return chunks;
}

async function processChunk(
  text: string, 
  chunkIndex: number, 
  totalChunks: number, 
  allowedTypes: string[],
  categoryDescriptions: Map<string, string>
): Promise<ExtractedFicha[]> {
    
    // Montar seção de categorias com descrições
    let categoriesSection = "";
    
    for (const slug of allowedTypes) {
        const description = categoryDescriptions.get(slug);
        
        if (description) {
            // Categoria tem descrição detalhada
            categoriesSection += `\n### ${slug.toUpperCase()}\n${description}\n`;
        } else {
            // Categoria sem descrição - dedução genérica
            categoriesSection += `\n### ${slug.toUpperCase()}\n(Deduza o significado pelo nome da categoria)\n`;
        }
    }
    
    const systemPrompt = `
Você é o Motor de Extração de Lore do AntiVerso.
Sua missão é DECOMPOR o texto em uma lista de objetos JSON (fichas), identificando TODAS as entidades mencionadas e categorizando-as corretamente.

⚠️ PRINCÍPIOS FUNDAMENTAIS:
1. **COMPLETUDE**: Identifique TODAS as entidades mencionadas no texto, sem exceção.
2. **RIGOR UNIVERSAL**: Trate TODAS as categorias com o mesmo nível de atenção e rigor.
3. **DESCRIÇÕES SÃO INSTRUÇÕES**: Quando uma categoria tiver descrição detalhada, siga-a à risca.
4. **RELAÇÕES OBRIGATÓRIAS**: Sempre que entidades interagem, crie relações entre elas no campo meta.relacoes.
5. **DETALHAMENTO**: Preencha TODOS os campos possíveis para cada ficha.

📋 CATEGORIAS E INSTRUÇÕES DE IDENTIFICAÇÃO:
${categoriesSection}

🔗 SISTEMA DE LINKS E RELAÇÕES:
- Use @ para criar links: "@NomeDaFicha" vira link clicável
- SEMPRE crie relações bidirecionais quando apropriado
- Exemplo de relações:
  * "filho_de", "mae_de", "pai_de"
  * "amigo_de", "inimigo_de"
  * "trabalha_em", "emprega"
  * "localizado_em", "contem"

📝 ESTRUTURA DOS CAMPOS:
- **resumo**: 1-2 frases curtas para visualização rápida
- **conteudo**: Texto COMPLETO e DETALHADO com todos os detalhes. Use @ para criar links.
- **tags**: 4-7 tags relevantes (contexto narrativo, características, temas)
- **meta.relacoes**: Array de relações com outras fichas

### PROCESSO EM 4 PASSOS:
PASSO 1: LEITURA COMPLETA → Identifique TODAS as entidades mencionadas no texto
PASSO 2: CATEGORIZAÇÃO → Determine a categoria de cada entidade usando as instruções acima
PASSO 3: CRIAÇÃO DE FICHAS → Crie uma ficha completa para CADA entidade identificada
PASSO 4: RELAÇÕES → Estabeleça conexões entre as fichas no campo meta.relacoes

### EXEMPLO DE COMPORTAMENTO ESPERADO:
Texto: "Em 1999, João (filho de Maria e inimigo de Pedro) trabalhou na Empresa XYZ no Centro da Cidade. Ele usava um Notebook Dell."

Saída JSON:
{
  "fichas": [
    { 
      "tipo": "personagem", 
      "titulo": "João", 
      "resumo": "Filho de Maria que trabalhou na Empresa XYZ em 1999.", 
      "conteudo": "João é filho de @Maria e inimigo declarado de @Pedro. Em 1999, ele trabalhou na @Empresa_XYZ, localizada no @Centro_da_Cidade. Durante seu trabalho, João utilizava um @Notebook_Dell para suas atividades.",
      "tags": ["protagonista", "trabalho", "tecnologia", "família", "conflito"],
      "meta": { 
         "relacoes": [
            { "tipo": "filho_de", "alvo_titulo": "Maria" },
            { "tipo": "inimigo_de", "alvo_titulo": "Pedro" },
            { "tipo": "trabalha_em", "alvo_titulo": "Empresa XYZ" }
         ] 
      }
    },
    { 
      "tipo": "personagem", 
      "titulo": "Maria", 
      "resumo": "Mãe de João.",
      "conteudo": "Maria é a mãe de @João. Ela é mencionada como parte importante da família dele.",
      "tags": ["família", "mãe", "personagem_secundário"],
      "meta": { 
         "relacoes": [
            { "tipo": "mae_de", "alvo_titulo": "João" }
         ] 
      }
    },
    { 
      "tipo": "personagem", 
      "titulo": "Pedro", 
      "resumo": "Inimigo de João.",
      "conteudo": "@Pedro é descrito como inimigo declarado de @João. A natureza exata de sua inimizade não é detalhada no texto.",
      "tags": ["antagonista", "conflito", "personagem_secundário"],
      "meta": { 
         "relacoes": [
            { "tipo": "inimigo_de", "alvo_titulo": "João" }
         ] 
      }
    },
    { 
      "tipo": "empresa", 
      "titulo": "Empresa XYZ", 
      "resumo": "Empresa onde João trabalhou em 1999.",
      "conteudo": "A Empresa XYZ é uma organização localizada no @Centro_da_Cidade. @João trabalhou nesta empresa em 1999.",
      "tags": ["trabalho", "organização", "empregador"],
      "meta": { 
         "relacoes": [
            { "tipo": "emprega", "alvo_titulo": "João" },
            { "tipo": "localizado_em", "alvo_titulo": "Centro da Cidade" }
         ] 
      }
    },
    { 
      "tipo": "local", 
      "titulo": "Centro da Cidade", 
      "resumo": "Localização da Empresa XYZ.",
      "conteudo": "O Centro da Cidade é a região onde a @Empresa_XYZ está localizada. @João trabalhava neste local em 1999.",
      "tags": ["localização", "urbano", "centro", "trabalho"],
      "meta": { 
         "relacoes": [
            { "tipo": "contem", "alvo_titulo": "Empresa XYZ" }
         ] 
      }
    },
    { 
      "tipo": "objeto", 
      "titulo": "Notebook Dell", 
      "resumo": "Equipamento usado por João no trabalho.",
      "conteudo": "O Notebook Dell é um computador portátil utilizado por @João durante seu trabalho na @Empresa_XYZ em 1999.",
      "tags": ["tecnologia", "ferramenta_de_trabalho", "computador", "Dell"],
      "meta": { 
         "relacoes": [
            { "tipo": "usado_por", "alvo_titulo": "João" }
         ] 
      }
    }
  ]
}

⚠️ IMPORTANTE:
- Crie fichas para TODAS as entidades, mesmo as mencionadas brevemente
- Use as descrições das categorias como INSTRUÇÕES OBRIGATÓRIAS
- SEMPRE preencha meta.relacoes quando houver interação entre entidades
- Use @ no conteúdo para criar links entre fichas

Agora extraia as fichas do texto abaixo:
`;

    const userPrompt = `Texto para extração (parte ${chunkIndex + 1} de ${totalChunks}):\n\n${text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4096,
    });

    const rawContent = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(rawContent);
    return parsed.fichas || [];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, mundo_id, episodio } = body;

    if (!text || !mundo_id || !episodio) {
      return NextResponse.json(
        { error: "text, mundo_id e episodio são obrigatórios" },
        { status: 400 }
      );
    }

    // 1) Buscar categorias do banco
    console.log("[EXTRACT] Buscando categorias do banco...");
    const { data: categories, error: catError } = await supabaseAdmin
      .from("lore_categories")
      .select("slug, label, description");

    let allowedTypes: string[] = [];
    const categoryDescriptions = new Map<string, string>();

    if (!catError && categories && categories.length > 0) {
      console.log(`[EXTRACT] ✅ ${categories.length} categorias carregadas do banco`);
      allowedTypes = categories.map((c: any) => c.slug);
      
      // Armazenar descrições
      categories.forEach((c: any) => {
        if (c.description) {
          categoryDescriptions.set(c.slug, c.description);
        }
      });
      
      console.log(`[EXTRACT] ${categoryDescriptions.size} categorias com descrições detalhadas`);
    } else {
      console.warn("[EXTRACT] ⚠️ Usando categorias fallback");
      allowedTypes = [
        "personagem",
        "local",
        "evento",
        "objeto",
        "conceito",
        "empresa",
        "roteiro",
      ];
    }

    // 2) Dividir texto em chunks
    const chunks = splitTextIntoChunks(text, 12000);
    console.log(`[EXTRACT] Texto dividido em ${chunks.length} chunk(s)`);

    // 3) Processar cada chunk
    let allFichas: ExtractedFicha[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[EXTRACT] Processando chunk ${i + 1}/${chunks.length}...`);
      const fichas = await processChunk(chunks[i], i, chunks.length, allowedTypes, categoryDescriptions);
      allFichas = allFichas.concat(fichas);
    }

    console.log(`[EXTRACT] ✅ Total de ${allFichas.length} fichas extraídas`);

    // 4) Normalizar e retornar
    const normalized = allFichas.map((f) => ({
      ...f,
      aparece_em: normalizeEpisode(episodio),
    }));

    return NextResponse.json({ fichas: normalized });
  } catch (err: any) {
    console.error("[EXTRACT] Erro:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
