import { supabaseAdmin } from "./supabase";

const STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "e", "ou", "mas", "que", "se", "por", "para", "com", "sem",
  "quem", "qual", "quais", "onde", "como", "quando", "porquê", "porque",
  "é", "são", "foi", "foram", "era", "eram", "está", "estão",
  "me", "fale", "sobre", "diga", "explique", "mostre", "vida", "historia", "história",
  "existe", "existem", "sabe", "conhece"
]);

function extractMainKeyword(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sÀ-ÿ]/g, "") 
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w)); 
  
  return words.length > 0 ? words[0] : text.trim();
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
  options: { limit?: number; minSimilarity?: number; universeId?: string; userId?: string } = {}
): Promise<LoreChunk[]> {
  if (!supabaseAdmin) return [];

  const limit = options.limit ?? 8;
  const universeId = options.universeId;
  const userId = options.userId; // NOVO PARÂMETRO

  let results: LoreChunk[] = [];

  try {
      let worldIds: string[] = [];

      // 1. Se tiver Universo, busca mundos (COM FILTRO DE USUÁRIO SE DISPONÍVEL)
      if (universeId) {
        let wQuery = supabaseAdmin
            .from("worlds")
            .select("id")
            .eq("universe_id", universeId);
        
        if (userId) {
            wQuery = wQuery.eq("user_id", userId); // SEGURANÇA
        }

        const { data: worlds } = await wQuery;
        worldIds = worlds?.map(w => w.id) || [];
      }

      const term = extractMainKeyword(query);
      if (!term) return [];

      // 2. Construir Query nas Fichas
      let dbQuery = supabaseAdmin
        .from("fichas")
        .select("id, titulo, resumo, conteudo, tipo, tags, world_id");

      // FILTRO DE USUÁRIO (CRÍTICO)
      if (userId) {
        dbQuery = dbQuery.eq("user_id", userId);
      }

      if (worldIds.length > 0) {
        dbQuery = dbQuery.in("world_id", worldIds);
      }

      // Busca Textual
      dbQuery = dbQuery.or(`titulo.ilike.%${term}%,resumo.ilike.%${term}%,tags.ilike.%${term}%,conteudo.ilike.%${term}%`);
      dbQuery = dbQuery.limit(limit);

      const { data: matches, error } = await dbQuery;

      if (error) {
        console.error("Erro na busca de fichas:", error);
        return [];
      }

      if (matches && matches.length > 0) {
        results = matches.map((f: any) => ({
          id: f.id,
          source: "Ficha Viva",
          source_type: f.tipo,
          title: f.titulo,
          content: `[TIPO]: ${f.tipo}\n[RESUMO]: ${f.resumo || "N/A"}\n[TAGS]: ${f.tags}\n[CONTEÚDO]:\n${f.conteudo || ""}`,
          similarity: 1.0
        }));
      }

  } catch (err) {
    console.error("Erro fatal na busca:", err);
    return [];
  }

  return results;
}
