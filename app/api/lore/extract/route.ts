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
Você é um extrator AGRESSIVO de fichas de lore para um sistema de gerenciamento narrativo.

**CATEGORIAS DISPONÍVEIS:**
${categoriesSection}

**INSTRUÇÕES OBRIGATÓRIAS:**

1. VOCÊ DEVE EXTRAIR TODAS AS ENTIDADES MENCIONADAS NO TEXTO, MESMO QUE BREVEMENTE
2. EXTRAIA FICHAS PARA:
   - TODOS os personagens mencionados (nomes próprios, apelidos, referências a pessoas)
   - TODOS os locais citados (cidades, países, endereços, estabelecimentos, espaços físicos)
   - TODOS os eventos descritos (encontros, acontecimentos, situações importantes)
   - TODOS os conceitos abstratos mencionados (ideias, teorias, sentimentos importantes)
   - TODAS as regras ou leis do universo narrativo
   - TODOS os roteiros ou narrativas estruturadas

3. Para cada entidade identificada, crie uma ficha JSON com os campos:
   - tipo: uma das categorias acima (use o slug em minúsculas: "personagem", "local", "evento", "conceito", "regra", "roteiro")
   - titulo: nome/título da entidade (OBRIGATÓRIO)
   - resumo: resumo em 1-2 frases do que é essa entidade
   - conteudo: descrição detalhada extraída do texto
   - tags: array de palavras-chave relevantes
   - aparece_em: contexto onde aparece no texto
   - ano_diegese: ano diegético se mencionado (número ou null)
   - descricao_data: descrição temporal original do texto (string ou null)
   - data_inicio: data ISO 8601 se identificável (string ou null)
   - data_fim: data ISO 8601 se aplicável (string ou null)
   - granularidade_data: "dia", "mes", "ano", "decada", "seculo" ou "indefinido"
   - camada_temporal: "linha_principal", "flashback", "flashforward", "sonho_visao", "mundo_alternativo", "historico_antigo", "outro", "relato" ou "publicacao"

4. FORMATO DE RESPOSTA OBRIGATÓRIO:
{
  "fichas": [
    { "tipo": "personagem", "titulo": "Nome", "resumo": "...", "conteudo": "...", "tags": [...], ... },
    { "tipo": "local", "titulo": "Nome do Local", "resumo": "...", "conteudo": "...", "tags": [...], ... }
  ]
}

5. NUNCA retorne um array vazio. Se houver QUALQUER menção a pessoas, lugares ou eventos, EXTRAIA FICHAS.
6. Use APENAS os slugs de categoria listados acima.
7. Seja GENEROSO na extração - prefira extrair demais do que de menos.

**TEXTO A PROCESSAR (Chunk ${chunkIndex + 1}/${totalChunks}):**

${text}

**LEMBRE-SE: Extraia TODAS as entidades mencionadas. Não seja conservador.**
`.trim();

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.3,
            messages: [{ role: "system", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const rawContent = completion.choices[0]?.message?.content || "{}";
        console.log(`[EXTRACT] Resposta da IA (chunk ${chunkIndex + 1}):`, rawContent.substring(0, 500));
        
        let parsed: any;

        try {
            parsed = JSON.parse(rawContent);
        } catch (e) {
            console.error(`[EXTRACT] Chunk ${chunkIndex + 1}: JSON inválido`, e);
            console.log(`[EXTRACT] Conteúdo que falhou:`, rawContent);
            return [];
        }

        console.log(`[EXTRACT] Objeto parseado:`, JSON.stringify(parsed).substring(0, 300));
        
        const fichas = parsed.fichas || parsed.entities || [];
        console.log(`[EXTRACT] Fichas encontradas no objeto:`, fichas.length);
        
        if (!Array.isArray(fichas)) {
            console.warn(`[EXTRACT] Fichas não é um array:`, typeof fichas);
            return [];
        }

        const filtered = fichas.filter((f: any) => {
            const hasType = !!f.tipo;
            const hasTitle = !!f.titulo;
            const typeAllowed = f.tipo && allowedTypes.includes(f.tipo.toLowerCase());
            
            if (!hasType || !hasTitle || !typeAllowed) {
                console.log(`[EXTRACT] Ficha filtrada:`, { 
                    titulo: f.titulo, 
                    tipo: f.tipo, 
                    hasType, 
                    hasTitle, 
                    typeAllowed,
                    allowedTypes 
                });
            }
            
            return hasType && hasTitle && typeAllowed;
        });
        
        console.log(`[EXTRACT] Fichas após filtro:`, filtered.length);
        return filtered;

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

        console.log(`[EXTRACT] ✅ Total de ${allFichas.length} fichas extraídas pela IA`);

        // 3.5) SEMPRE criar uma ficha de "Roteiro" com o texto original
        // Isso garante que todo texto enviado seja registrado no banco de dados
        const roteiroFicha: ExtractedFicha = {
          tipo: "roteiro",
          titulo: `Texto Original - ${new Date().toLocaleDateString('pt-BR')}`,
          resumo: "Texto original enviado para extração de fichas.",
          conteudo: text,
          tags: ["original", "roteiro", "texto-base"],
          aparece_em: "Upload de texto",
          ano_diegese: null,
          descricao_data: new Date().toISOString(),
          data_inicio: new Date().toISOString(),
          data_fim: null,
          granularidade_data: "dia",
          camada_temporal: "publicacao",
          meta: {
            source: "upload",
            extraction_date: new Date().toISOString(),
            chunks_processed: chunks.length
          }
        };
        
        // Adicionar a ficha de roteiro no início do array
        allFichas.unshift(roteiroFicha);
        console.log(`[EXTRACT] 📝 Ficha de Roteiro adicionada automaticamente`);
        console.log(`[EXTRACT] ✅ Total final: ${allFichas.length} fichas (incluindo Roteiro)`);

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
