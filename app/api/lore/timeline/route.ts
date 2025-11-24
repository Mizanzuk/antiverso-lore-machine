import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type TimelineItem = {
  id: string;
  world_id: string | null;
  titulo: string | null;
  slug: string | null;
  resumo: string | null;
  conteudo: string | null;
  tags: string[];
  codigo: string | null;
  episodio: string | null;
  aparece_em: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  descricao_data: string | null;
  camada_temporal: string | null;
};

function safeToStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

/**
 * GET /api/lore/timeline?worldId=...&worldSlug=...
 *
 * Retorna a linha do tempo de um Mundo, considerando apenas fichas do tipo "evento"
 * com campos temporais preenchidos.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const worldId = url.searchParams.get("worldId");
  const worldSlug = url.searchParams.get("worldSlug");

  try:
    const supabase = supabaseAdmin;
    if (!supabase) {
      console.error("[timeline] supabaseAdmin está nulo/indisponível.");
      return NextResponse.json(
        { error: "Erro interno ao inicializar o Supabase." },
        { status: 500 }
      );
    }

    let resolvedWorldId = worldId;

    if (!resolvedWorldId && worldSlug) {
      const { data: world, error: worldError } = await supabase
        .from("worlds")
        .select("id")
        .eq("nome", worldSlug)
        .maybeSingle();

      if (worldError) {
        console.error("[timeline] Erro ao buscar world por slug:", worldError);
        return NextResponse.json(
          { error: "Erro ao buscar mundo." },
          { status: 500 }
        );
      }

      if (!world) {
        return NextResponse.json(
          { error: "Mundo não encontrado." },
          { status: 404 }
        );
      }

      resolvedWorldId = world.id;
    }

    if (!resolvedWorldId) {
      return NextResponse.json(
        { error: "worldId ou worldSlug são obrigatórios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("fichas")
      .select(
        `
          id,
          world_id,
          titulo,
          slug,
          resumo,
          conteudo,
          tags,
          codigo,
          episodio,
          aparece_em,
          data_inicio,
          data_fim,
          granularidade_data,
          descricao_data,
          camada_temporal,
          tipo
        `
      )
      .eq("world_id", resolvedWorldId)
      .eq("tipo", "evento")
      .order("data_inicio", { ascending: true });

    if (error) {
      console.error("[timeline] Erro ao buscar fichas:", error);
      return NextResponse.json(
        { error: "Erro ao carregar eventos para linha do tempo." },
        { status: 500 }
      );
    }

    const items: TimelineItem[] =
      data?.map((row: any) => ({
        id: row.id,
        world_id: row.world_id ?? null,
        titulo: row.titulo ?? null,
        slug: row.slug ?? null,
        resumo: row.resumo ?? null,
        conteudo: row.conteudo ?? null,
        tags: safeToStringArray(row.tags),
        codigo: row.codigo ?? null,
        episodio: row.episodio ?? null,
        aparece_em: row.aparece_em ?? null,
        data_inicio: row.data_inicio ?? null,
        data_fim: row.data_fim ?? null,
        granularidade_data: row.granularidade_data ?? null,
        descricao_data: row.descricao_data ?? null,
        camada_temporal: row.camada_temporal ?? null,
      })) || [];

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[timeline] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao montar linha do tempo." },
      { status: 500 }
    );
  }
}
