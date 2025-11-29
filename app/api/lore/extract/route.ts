import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ExtractedFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags?: string[];
  aparece_em?: string;
  ano_diegese?: number | null;
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: any;
};

function splitIntoChunks(text: string, maxChunkSize: number = 8000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.length > 0 ? chunks : [text];
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
            // Categoria sem descrição (fallback)
            categoriesSection += `\n### ${slug.toUpperCase()}\n(Sem descrição disponível)\n`;
        }
    }

    const systemPrompt = `
Você é um extrator de fichas de lore para um sistema de gerenciamento narrativo.

**CATEGORIAS DISPONÍVEIS:**
${categoriesSection}

**INSTRUÇÕES:**
1. Leia o texto fornecido e identifique TODAS as entidades narrativas relevantes
2. Para cada entidade, crie uma ficha JSON com os campos:
   - tipo: uma das categorias acima (use o slug em minúsculas)
   - titulo: nome/título da entidade
   - resumo: resumo em 1-2 frases
   - conteudo: descrição detalhada
   - tags: array de palavras-chave relevantes
   - aparece_em: onde/quando aparece no texto (opcional)
   - ano_diegese: ano diegético se mencionado (número ou null)
   - descricao_data: descrição temporal original do texto (string ou null)
   - data_inicio: data ISO 8601 se identificável (string ou null)
   - data_fim: data ISO 8601 se aplicável (string ou null)
   - granularidade_data: "dia", "mes", "ano", "decada", "seculo" ou "indefinido"
   - camada_temporal: "linha_principal", "flashback", "flashforward", "sonho_visao", "mundo_alternativo", "historico_antigo", "outro", "relato" ou "publicacao"

3. Retorne APENAS um array JSON válido de fichas
4. Se não houver entidades, retorne []
5. Use APENAS os tipos de categoria listados acima

**TEXTO (Chunk ${chunkIndex + 1}/${totalChunks}):**
${text}
`.trim();

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.3,
            messages: [{ role: "system", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const rawContent = completion.choices[0]?.message?.content || "{}";
        let parsed: any;

        try {
            parsed = JSON.parse(rawContent);
        } catch {
            console.warn(`[EXTRACT] Chunk ${chunkIndex + 1}: JSON inválido`);
            return [];
        }

        const fichas = parsed.fichas || parsed.entities || [];
        if (!Array.isArray(fichas)) return [];

        return fichas.filter((f: any) => 
            f.tipo && 
            f.titulo && 
            allowedTypes.includes(f.tipo.toLowerCase())
        );

    } catch (err) {
        console.error(`[EXTRACT] Erro no chunk ${chunkIndex + 1}:`, err);
        return [];
    }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        let userId = user?.id;
        if (!userId) {
          const headerUserId = req.headers.get("x-user-id");
          if (headerUserId) userId = headerUserId;
        }

        if (!userId) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Não autenticado" })}\n\n`));
          controller.close();
          return;
        }

        const body = await req.json();
        const { text, universeId } = body;

        if (!text || typeof text !== "string") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Texto inválido" })}\n\n`));
          controller.close();
          return;
        }

        if (!universeId) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "universeId é obrigatório" })}\n\n`));
          controller.close();
          return;
        }

        // 1) Buscar categorias do banco FILTRADAS POR UNIVERSO
        console.log(`[EXTRACT] Buscando categorias do universo ${universeId}...`);
        const { data: categories, error: catError } = await supabaseAdmin
          .from("lore_categories")
          .select("slug, label, description")
          .eq("universe_id", universeId);

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
          console.warn("[EXTRACT] ⚠️ Nenhuma categoria encontrada para este universo");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Nenhuma categoria encontrada para este universo" })}\n\n`));
          controller.close();
          return;
        }

        // 2) Dividir texto em chunks
        const chunks = splitIntoChunks(text, 8000);
        console.log(`[EXTRACT] Texto dividido em ${chunks.length} chunks`);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          status: "started", 
          totalChunks: chunks.length 
        })}\n\n`));

        // 3) Processar cada chunk
        let allFichas: ExtractedFicha[] = [];
        for (let i = 0; i < chunks.length; i++) {
          console.log(`[EXTRACT] Processando chunk ${i + 1}/${chunks.length}...`);
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: "processing", 
            currentChunk: i + 1, 
            totalChunks: chunks.length 
          })}\n\n`));

          const fichas = await processChunk(chunks[i], i, chunks.length, allowedTypes, categoryDescriptions);
          allFichas = allFichas.concat(fichas);
        }

        console.log(`[EXTRACT] ✅ Total de ${allFichas.length} fichas extraídas`);

        // 4) Enviar resultado final
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          status: "completed", 
          fichas: allFichas 
        })}\n\n`));

        controller.close();

      } catch (err: any) {
        console.error("[EXTRACT] Erro crítico:", err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          error: err.message || "Erro desconhecido" 
        })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
