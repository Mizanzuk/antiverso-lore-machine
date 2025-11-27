import { openai } from "./openai";
import { supabaseAdmin } from "./supabase";

const EMBEDDING_MODEL = "text-embedding-3-small";

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

/**
 * Realiza a busca híbrida:
 * 1. Busca textual nas FICHAS (se universeId estiver presente)
 * 2. Busca vetorial nos CHUNKS (legado/seed)
 * 3. Combina e desduplica os resultados
 */
export async function searchLore(
  query: string,
  options: { limit?: number; minSimilarity?: number; universeId?: string } = {}
): Promise<LoreChunk[]> {
  if (!openai || !supabaseAdmin) return [];

  const limit = options.limit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.25;
  const universeId = options.universeId;

  // Lista final combinada
  let results: LoreChunk[] = [];

  // --- 1. BUSCA NAS FICHAS (DADOS ESTRUTURADOS DO UNIVERSO) ---
  if (universeId) {
    try {
      // Pega os mundos deste universo
      const { data: worlds } = await supabaseAdmin
        .from("worlds")
        .select("id")
        .eq("universe_id", universeId);
        
      const worldIds = worlds?.map(w => w.id) || [];

      if (worldIds.length > 0) {
        // Limpa a query para busca textual (remove caracteres especiais)
        const cleanQuery = query.replace(/[^\w\s]/gi, '').trim().split(/\s+/).join(" | ");
        
        if (cleanQuery) {
          // Busca usando 'ilike' para título (mais garantido para nomes exatos)
          // E 'textSearch' ou 'ilike' para conteúdo
          const { data: fichaMatches, error } = await supabaseAdmin
            .from("fichas")
            .select("id, titulo, resumo, conteudo, tipo")
            .in("world_id", worldIds)
            .or(`titulo.ilike.%${query}%,resumo.ilike.%${query}%`) // Procura no Título OU Resumo
            .limit(limit);

          if (!error && fichaMatches) {
            const mappedFichas = fichaMatches.map(f => ({
              id: f.id,
              source: "Ficha do Catálogo",
              source_type: f.tipo,
              title: f.titulo,
              content: `[RESUMO]: ${f.resumo || ""}\n[CONTEÚDO]: ${f.conteudo || ""}`,
              similarity: 1.0 // Prioridade máxima para fichas encontradas por nome exato
            }));
            results.push(...mappedFichas);
          }
        }
      }
    } catch (err) {
      console.error("Erro na busca de fichas:", err);
    }
  }

  // --- 2. BUSCA VETORIAL (DADOS SEMENTE/ANTIGOS) ---
  // Sempre executamos isso para garantir que conhecimentos gerais (como "Quem é Or") sejam encontrados
  // mesmo que não estejam cadastrados como fichas no universo atual.
  try {
    const embedding = await embedText(query);
    if (embedding) {
      const { data: vectorMatches, error } = await supabaseAdmin.rpc("match_lore_chunks", {
        query_embedding: embedding,
        match_count: limit,
        similarity_threshold: minSimilarity,
      });

      if (!error && vectorMatches) {
        // Adiciona apenas se não for duplicata óbvia de título (opcional, aqui vamos apenas adicionar)
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

  // --- 3. ORDENAÇÃO E LIMPEZA ---
  // Remove duplicatas por ID e ordena por relevância (Fichas exatas primeiro, depois similaridade vetorial)
  const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
  
  // Ordena: prioridade 1 (>0.9) primeiro, depois decrescente
  uniqueResults.sort((a, b) => b.similarity - a.similarity);

  return uniqueResults.slice(0, limit + 2); // Retorna um pouco mais para garantir contexto
}
