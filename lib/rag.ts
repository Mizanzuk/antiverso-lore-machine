import { openai } from "./openai";
import { supabaseAdmin } from "./supabase";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Lista de palavras comuns para ignorar na busca textual (Stopwords)
const STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "e", "ou", "mas", "que", "se", "por", "para", "com", "sem",
  "quem", "qual", "quais", "onde", "como", "quando", "porquê", "porque",
  "é", "são", "foi", "foram", "era", "eram", "está", "estão",
  "me", "fale", "sobre", "diga", "explique", "mostre", "vida", "historia", "história"
]);

function extractKeywords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\sÀ-ÿ]/g, "") // Remove pontuação
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w)) // Ignora palavras curtas e stopwords
    .join(" | "); // Formato para busca do Postgres (palavra1 | palavra2)
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!openai) return null;
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return res.data[0].embedding;
  } catch (e) {
    console.error("Erro ao gerar embedding:", e);
    return null;
  }
}

export type LoreChunk = {
  id: string;
  source: string;
  source_type: string;
  title: string;
  content: string;
  similarity: number;
};

export async function searchLore(
  query: string,
  options: { limit?: number; minSimilarity?: number; universeId?: string } = {}
): Promise<LoreChunk[]> {
  if (!openai || !supabaseAdmin) return [];

  const limit = options.limit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.25;
  const universeId = options.universeId;

  let results: LoreChunk[] = [];

  // --- 1. BUSCA INTELIGENTE NAS FICHAS (DADOS DO UNIVERSO) ---
  if (universeId) {
    try {
      // Identifica quais mundos pertencem a este universo
      const { data: worlds } = await supabaseAdmin
        .from("worlds")
        .select("id")
        .eq("universe_id", universeId);
        
      const worldIds = worlds?.map(w => w.id) || [];

      if (worldIds.length > 0) {
        // Extrai apenas as palavras-chave (ex: "Quem é Pedro?" vira "Pedro")
        const searchTerms = extractKeywords(query);
        
        if (searchTerms) {
          // Tenta busca textual (Full Text Search) no Título e Resumo
          // Isso é muito mais flexível que o 'ilike' exato
          const { data: textMatches, error } = await supabaseAdmin
            .from("fichas")
            .select("id, titulo, resumo, conteudo, tipo")
            .in("world_id", worldIds)
            .textSearch('titulo', searchTerms, { config: 'portuguese', type: 'websearch' })
            .limit(limit);

          // Se a busca textual não retornar nada, tentamos um 'ilike' mais solto para cada palavra
          // Isso ajuda caso o Postgres FTS não esteja configurado perfeitamente
          let fallbackMatches: any[] = [];
          if (!textMatches || textMatches.length === 0) {
             const firstKeyword = searchTerms.split(" | ")[0]; // Pega a primeira palavra relevante
             if (firstKeyword) {
                 const { data: ilikeData } = await supabaseAdmin
                  .from("fichas")
                  .select("id, titulo, resumo, conteudo, tipo")
                  .in("world_id", worldIds)
                  .ilike('titulo', `%${firstKeyword}%`)
                  .limit(limit);
                 fallbackMatches = ilikeData || [];
             }
          }

          const bestMatches = (textMatches && textMatches.length > 0) ? textMatches : fallbackMatches;

          if (bestMatches && bestMatches.length > 0) {
            const mappedFichas = bestMatches.map(f => ({
              id: f.id,
              source: "Catálogo",
              source_type: f.tipo,
              title: f.titulo,
              content: `[RESUMO]: ${f.resumo || "Sem resumo"}\n[CONTEÚDO]: ${f.conteudo || ""}`,
              similarity: 1.0 // Forçamos prioridade máxima para fichas encontradas pelo nome
            }));
            results.push(...mappedFichas);
          }
        }
      }
    } catch (err) {
      console.error("Erro na busca de fichas:", err);
    }
  }

  // --- 2. BUSCA VETORIAL (MEMÓRIA ANTIGA / BÍBLIA) ---
  // Continua útil para perguntas conceituais ("O que é o AntiVerso?")
  try {
    const embedding = await embedText(query);
    if (embedding) {
      const { data: vectorMatches, error } = await supabaseAdmin.rpc("match_lore_chunks", {
        query_embedding: embedding,
        match_count: limit,
        similarity_threshold: minSimilarity,
      });

      if (!error && vectorMatches) {
        const mappedVector = vectorMatches.map((m: any) => ({
            id: m.id,
            source: m.source,
            source_type: m.source_type,
            title: m.title,
            content: m.content,
            similarity: m.similarity
        }));
        results.push(...mappedVector);
      }
    }
  } catch (err) {
    console.error("Erro na busca vetorial:", err);
  }

  // --- 3. LIMPEZA E RETORNO ---
  // Remove duplicatas (priorizando a Ficha se houver conflito com Chunk antigo)
  const uniqueMap = new Map();
  results.forEach(item => {
     if (!uniqueMap.has(item.title)) {
         uniqueMap.set(item.title, item);
     } else {
         // Se já tem, mantém o que tem maior score (geralmente a Ficha com 1.0)
         const existing = uniqueMap.get(item.title);
         if (item.similarity > existing.similarity) {
             uniqueMap.set(item.title, item);
         }
     }
  });
  
  const uniqueResults = Array.from(uniqueMap.values());
  
  // Ordena por relevância
  uniqueResults.sort((a, b) => b.similarity - a.similarity);

  return uniqueResults.slice(0, limit + 3);
}
