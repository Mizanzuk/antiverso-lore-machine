import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ExtractedRelation = {
  source_titulo: string;  // Título da ficha de origem
  target_titulo: string;  // Título da ficha de destino
  tipo_relacao: string;   // Tipo de relação (ex: "amigo_de", "menciona")
  descricao?: string;     // Descrição opcional da relação
};

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
  relations?: ExtractedRelation[];  // Relações desta ficha com outras
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
Você é um extrator ULTRA-AGRESSIVO de fichas de lore para um sistema de gerenciamento narrativo.

**CATEGORIAS DISPONÍVEIS:**
${categoriesSection}

**INSTRUÇÕES OBRIGATÓRIAS - LEIA COM ATENÇÃO:**

1. VOCÊ DEVE EXTRAIR TODAS AS ENTIDADES MENCIONADAS NO TEXTO, MESMO QUE BREVEMENTE

2. SIGA RIGOROSAMENTE AS DESCRIÇÕES DAS CATEGORIAS LISTADAS ACIMA
   - Cada categoria tem uma descrição detalhada que explica O QUE extrair e COMO extrair
   - Leia com atenção a descrição de cada categoria antes de começar a extração
   - As descrições contêm exemplos, regras e instruções específicas que você DEVE seguir
   - Se a descrição diz "crie um evento para CADA data", faça exatamente isso
   - Se a descrição diz "NUNCA agrupe", não agrupe
   - Se a descrição diz "seja AGRESSIVO", seja AGRESSIVO

**REGRA DE OURO:**
As descrições das categorias são suas instruções principais. Siga-as ao pé da letra.

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
   - relations: array de relações desta ficha com outras (OBRIGATÓRIO - extraia TODAS as relações mencionadas)

3.5. **ATENÇÃO CRÍTICA - RELAÇÕES SÃO OBRIGATÓRIAS:**

Para CADA ficha, você DEVE incluir o campo "relations" (array). Este campo é OBRIGATÓRIO em TODAS as fichas.

**COMO IDENTIFICAR RELAÇÕES:**
- Se o texto diz "João é amigo de Pedro" → crie relação "amigo_de" de João para Pedro
- Se o texto diz "Maria conheceu João" → crie relação "conhecido_de" de Maria para João
- Se o texto diz "Pedro foi à padaria" → crie relação "visitou" de Pedro para Padaria
- Se o texto diz "João participou da suspensão" → crie relação "participou_de" de João para Suspensão
- Se o texto diz "O evento aconteceu na praça" → crie relação "localizado_em" do Evento para Praça

**FORMATO DO CAMPO RELATIONS:**
```json
"relations": [
  {
    "source_titulo": "[Nome da ficha atual]",
    "target_titulo": "[Nome de outra ficha mencionada]",
    "tipo_relacao": "[escolha um tipo abaixo]",
    "descricao": "[descrição breve - opcional]"
  }
]
```

**TIPOS DE RELAÇÃO DISPONÍVEIS:**
- Familiares: "pai_de", "mae_de", "filho_de", "filha_de", "irmao_de", "irma_de", "conjuge_de", "casado_com"
- Sociais: "amigo_de", "inimigo_de", "rival_de", "mentor_de", "aprendiz_de", "colega_de", "conhecido_de"
- Profissionais: "chefe_de", "subordinado_de", "funcionario_de", "colega_trabalho_de", "socio_de"
- Narrativas: "protagonizado_por", "participou_de", "testemunhou", "menciona", "criador_de"
- Espaciais: "localizado_em", "mora_em", "nasceu_em", "trabalha_em", "estudou_em", "visitou"
- Pertencimento: "parte_de", "membro_de", "pertence_a", "associado_a"

**REGRAS ABSOLUTAS:**
1. TODA ficha DEVE ter o campo "relations" (mesmo que seja um array vazio [])
2. Se uma ficha menciona outra entidade, CRIE uma relação
3. Se um personagem interage com outro, CRIE relações entre eles
4. Se um evento acontece em um local, CRIE relação "localizado_em"
5. Se um personagem participa de um evento, CRIE relação "participou_de"

4. FORMATO DE RESPOSTA OBRIGATÓRIO:
{
  "fichas": [
    { 
      "tipo": "personagem", 
      "titulo": "João", 
      "resumo": "...", 
      "conteudo": "...", 
      "tags": [...],
      "relations": [
        {"source_titulo": "João", "target_titulo": "Pedro", "tipo_relacao": "amigo_de", "descricao": "Amigos próximos"},
        {"source_titulo": "João", "target_titulo": "Padaria da Esquina", "tipo_relacao": "visitou", "descricao": "Frequenta regularmente"}
      ],
      ...
    },
    { 
      "tipo": "local", 
      "titulo": "Padaria da Esquina", 
      "resumo": "...", 
      "conteudo": "...", 
      "tags": [...],
      "relations": [
        {"source_titulo": "Padaria da Esquina", "target_titulo": "Pedro", "tipo_relacao": "visitou", "descricao": "Pedro frequenta este local"}
      ],
      ...
    }
  ]
}

5. NUNCA retorne um array vazio de fichas. Se houver QUALQUER menção a pessoas, lugares ou eventos, EXTRAIA FICHAS.
6. Use APENAS os slugs de categoria listados acima.
7. Seja ULTRA-GENEROSO na extração - prefira extrair demais do que de menos.
8. Siga as instruções específicas de cada categoria descritas acima.

**⚠️ ATENÇÃO FINAL SOBRE RELAÇÕES ⚠️**

Este é o ponto MAIS IMPORTANTE:
- TODA ficha DEVE incluir o campo "relations" no JSON
- Se a ficha menciona outra entidade, adicione uma relação
- Se não houver relações, use "relations": []
- NUNCA esqueça o campo "relations"

**TEXTO A PROCESSAR (Chunk ${chunkIndex + 1}/${totalChunks}):**

${text}

**🔴 CHECKLIST ANTES DE RESPONDER:**
1. ✅ Todas as fichas têm o campo "relations"?
2. ✅ Criei relações entre personagens que interagem?
3. ✅ Criei relações entre eventos e locais?
4. ✅ Criei relações entre personagens e eventos que participaram?
5. ✅ Segui RIGOROSAMENTE as descrições de cada categoria?
`.trim();

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.5,  // Aumentado de 0.3 para 0.5 para extração mais agressiva
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
