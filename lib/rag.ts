
import { openai } from "./openai";
import { supabaseAdmin } from "./supabase";

const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedText(text: string): Promise<number[] | null> {
  if (!openai) return null;
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
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
  {
    limit = 6,
    minSimilarity = 0.25,
    onlyFichas = true,
  }: { limit?: number; minSimilarity?: number; onlyFichas?: boolean } = {},
): Promise<LoreChunk[]> {
  if (!openai || !supabaseAdmin) return [];

  const embedding = await embedText(query);
  if (!embedding) return [];

  const { data, error } = await supabaseAdmin.rpc("match_lore_chunks", {
    query_embedding: embedding,
    match_count: limit,
    similarity_threshold: minSimilarity,
  });

  if (error || !data) {
    console.error("Erro ao buscar lore:", error);
    return [];
  }

  let chunks = data as LoreChunk[];

  if (onlyFichas) {
    chunks = chunks.filter(
      (c: any) => typeof c.source === "string" && c.source.startsWith("ficha:")
    );
  }

  return chunks.slice(0, limit);
}
