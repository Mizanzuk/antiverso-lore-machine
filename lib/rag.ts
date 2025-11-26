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
  options: { limit?: number; minSimilarity?: number; universeId?: string } = {}
): Promise<LoreChunk[]> {
  if (!openai || !supabaseAdmin) return [];

  const limit = options.limit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.25;
  const universeId = options.universeId;

  const embedding = await embedText(query);
  if (!embedding) return [];

  // Chama a função RPC. Se universeId for fornecido, filtramos.
  // Precisamos atualizar a função RPC no banco para aceitar esse filtro,
  // ou filtrar no código (menos eficiente, mas funciona para MVP).
  // A melhor abordagem agora, sem mudar SQL complexo, é filtrar no client side 
  // se a tabela lore_chunks tiver metadados de universo, mas ela NÃO TEM ainda.
  
  // CORREÇÃO CRÍTICA: A busca atual usa 'lore_chunks' (tabela legada do seed) ou 'fichas'?
  // O sistema novo usa a tabela 'fichas'. A função 'match_lore_chunks' busca na tabela antiga.
  // Vamos assumir que você quer buscar nas FICHAS reais do sistema novo.

  // Se a busca for vetorial nas fichas, precisamos garantir que as fichas tenham embeddings.
  // Como seu sistema de "Extração" não gera embeddings nas fichas (apenas salva texto),
  // o RAG atual provavelmente está olhando para a tabela 'lore_chunks' que foi populada via Seed antigo.
  
  // SE você quer isolamento real agora, o ideal é buscar texto direto nas FICHAS do universo.
  // Busca textual simples (ilike) nas fichas do universo selecionado:
  
  if (universeId) {
    // 1. Pegar mundos do universo
    const { data: worlds } = await supabaseAdmin.from("worlds").select("id").eq("universe_id", universeId);
    const worldIds = worlds?.map(w => w.id) || [];

    if (worldIds.length === 0) return [];

    // 2. Buscar fichas nesses mundos que contenham termos da query (Busca Textual Simples por enquanto)
    // Isso substitui o RAG vetorial antigo que não tem conhecimento de universo.
    const { data: textMatches } = await supabaseAdmin
      .from("fichas")
      .select("id, titulo, conteudo, tipo")
      .in("world_id", worldIds)
      .textSearch("conteudo", query.split(" ").join(" | "), { type: "websearch", config: "portuguese" })
      .limit(limit);

    if (textMatches && textMatches.length > 0) {
      return textMatches.map(m => ({
        id: m.id,
        source: "Ficha",
        source_type: m.tipo,
        title: m.titulo,
        content: m.conteudo || "",
        similarity: 1 // Fake similarity
      }));
    }
    return [];
  }

  // Fallback para o sistema antigo se não tiver universo definido (comportamento legado)
  const { data, error } = await supabaseAdmin.rpc("match_lore_chunks", {
    query_embedding: embedding,
    match_count: limit,
    similarity_threshold: minSimilarity,
  });

  if (error || !data) {
    console.error("Erro ao buscar lore:", error);
    return [];
  }

  return data as LoreChunk[];
}
