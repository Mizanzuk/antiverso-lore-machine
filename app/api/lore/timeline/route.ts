import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Helper type for a timeline event coming from `fichas`
type TimelineEvent = {
  id: string;
  world_id: string;
  titulo: string;
  slug: string | null;
  resumo: string | null;
  conteudo: string | null;
  episodio: string | null;
  tags: string | null;
  aparece_em: string | null;
  codigo: string | null;
  // campos temporais
  ano_diegese: number | null;
  ordem_cronologica: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  descricao_data: string | null;
  camada_temporal: string | null;
};

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    console.error("Supabase admin client not initialized");
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);

  const worldId = searchParams.get("worldId");
  const worldSlug = searchParams.get("worldSlug");
  const camadaTemporal = searchParams.get("camadaTemporal") ?? undefined;

  if (!worldId && !worldSlug) {
    return NextResponse.json(
      { error: "You must provide either worldId or worldSlug" },
      { status: 400 }
    );
  }

  let resolvedWorldId = worldId;

  // If we didn't receive an explicit worldId, try resolving by world name (slug)
  if (!resolvedWorldId && worldSlug) {
    const { data: world, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id, nome")
      .eq("nome", worldSlug)
      .maybeSingle();

    if (worldError) {
      console.error("Error fetching world by slug:", worldError.message);
      return NextResponse.json(
        { error: "Error fetching world", details: worldError.message },
        { status: 500 }
      );
    }

    if (!world) {
      return NextResponse.json(
        { error: "World not found for provided slug" },
        { status: 404 }
      );
    }

    resolvedWorldId = world.id as string;
  }

  // Safety check – should never happen at this point
  if (!resolvedWorldId) {
    return NextResponse.json(
      { error: "Could not resolve worldId" },
      { status: 500 }
    );
  }

  // Build base query for events of this world
  let query = supabaseAdmin
    .from("fichas")
    .select(
      [
        "id",
        "world_id",
        "titulo",
        "slug",
        "resumo",
        "conteudo",
        "episodio",
        "tags",
        "aparece_em",
        "codigo",
        "ano_diegese",
        "ordem_cronologica",
        "data_inicio",
        "data_fim",
        "granularidade_data",
        "descricao_data",
        "camada_temporal",
      ].join(",")
    )
    .eq("world_id", resolvedWorldId)
    .eq("tipo", "evento");

  if (camadaTemporal) {
    query = query.eq("camada_temporal", camadaTemporal);
  }

  // Prefer ordering by data_inicio when available; as fallback use ano_diegese / ordem_cronologica
  const { data, error } = await query
    .order("data_inicio", { ascending: true })
    .order("ano_diegese", { ascending: true, nullsFirst: true })
    .order("ordem_cronologica", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("Error fetching timeline events:", error.message);
    return NextResponse.json(
      { error: "Error fetching timeline events", details: error.message },
      { status: 500 }
    );
  }

  const events = (data ?? []) as TimelineEvent[];

  return NextResponse.json({ events });
}
