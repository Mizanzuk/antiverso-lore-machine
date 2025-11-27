import { supabaseAdmin } from "./supabase";

// Lista de palavras comuns para ignorar na busca textual (Stopwords)
// Isso ajuda a limpar a query do usuário antes de bater no banco
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
    .replace(/[^\w\sÀ-ÿ]/g, "") // Remove pontuação
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w)); // Filtra stopwords
  
  // Retorna a primeira palavra-chave relevante ou o texto original se falhar
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

/**
 * Realiza a busca EXCLUSIVA nas Fichas (Single Source of Truth).
 * Não utiliza mais vetores/embeddings antigos.
 */
export async function searchLore(
  query: string,
  options: { limit?: number; minSimilarity?: number; universeId?: string } = {}
): Promise<LoreChunk[]> {
  if (!supabaseAdmin) return [];

  const limit = options.limit ?? 8;
  const universeId = options.universeId;

  let results: LoreChunk[] = [];

  try {
      let worldIds: string[] = [];

      // 1. Se tiver Universo definido, pegamos os mundos dele (incluindo o Raiz)
      if (universeId) {
        const { data: worlds } = await supabaseAdmin
            .from("worlds")
            .select("id")
            .eq("universe_id", universeId);
        worldIds = worlds?.map(w => w.id) || [];
      }

      // 2. Extrair termo principal de busca
      // Ex: "Quem é o Pedro?" -> "Pedro"
      const term = extractMainKeyword(query);

      if (!term) return [];

      // 3. Construir a Query no Supabase (Fichas)
      let dbQuery = supabaseAdmin
        .from("fichas")
        .select("id, titulo, resumo, conteudo, tipo, tags, world_id");

      // Filtro de Mundo (Se houver universeId, restringe ao escopo do universo)
      if (worldIds.length > 0) {
        dbQuery = dbQuery.in("world_id", worldIds);
      }

      // 4. Busca Textual "Inteligente"
      // Procura o termo no Título, Resumo, Tags ou Conteúdo
      // O 'ilike' garante que ache 'Pedro' mesmo se buscar 'pedro'
      dbQuery = dbQuery.or(`titulo.ilike.%${term}%,resumo.ilike.%${term}%,tags.ilike.%${term}%,conteudo.ilike.%${term}%`);
      
      // Ordenação opcional: poderia priorizar título, mas o banco geralmente retorna na ordem de inserção ou índice
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
          // Formatamos o conteúdo para o LLM entender a estrutura completa da ficha
          content: `[TIPO]: ${f.tipo}\n[RESUMO]: ${f.resumo || "N/A"}\n[TAGS]: ${f.tags}\n[CONTEÚDO]:\n${f.conteudo || ""}`,
          similarity: 1.0 // Relevância máxima, pois é dado oficial
        }));
      }

  } catch (err) {
    console.error("Erro fatal na busca:", err);
    return [];
  }

  return results;
}
