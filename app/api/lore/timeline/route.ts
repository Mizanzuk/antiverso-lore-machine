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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const worldId = searchParams.get("worldId");
  const worldSlug = searchParams.get("worldSlug");

  if (!worldId && !worldSlug) {
    return NextResponse.json(
      { error: "Informe worldId ou worldSlug na query string." },
      { status: 400 }
    );
  }

  try {
    // 1) Resolver worldId a partir do slug, se for o caso
    let resolvedWorldId = worldId;

    if (!resolvedWorldId && worldSlug) {
      const { data: world, error: worldError } = await supabaseAdmin
        .from("worlds")
        .select("id")
        .eq("nome", worldSlug)
        .maybeSingle();

      if (worldError) {
        console.error("[timeline] Erro ao buscar mundo por slug:", worldError);
        return NextResponse.json(
          { error: "Erro ao buscar mundo." },
          { status: 500 }
        );
      }

      if (!world) {
        return NextResponse.json(
          { error: "Mundo não encontrado para o slug informado." },
          { status: 404 }
        );
      }

      resolvedWorldId = world.id;
    }

    if (!resolvedWorldId) {
      return NextResponse.json(
        { error: "Não foi possível resolver o mundo alvo." },
        { status: 400 }
      );
    }

    // 2) Buscar apenas fichas do tipo 'evento' com dados temporais
    const { data, error } = await supabaseAdmin
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
        camada_temporal
      `
      )
      .eq("world_id", resolvedWorldId)
      .eq("tipo", "evento")
      .order("data_inicio", { ascending: true });

    if (error) {
      console.error("[timeline] Erro ao buscar fichas:", error);
      return NextResponse.json(
        { error: "Erro ao buscar eventos para a linha do tempo." },
        { status: 500 }
      );
    }

    const items: TimelineItem[] =
      data?.map((row: any) => ({
        id: row.id,
        world_id: row.world_id,
        titulo: row.titulo,
        slug: row.slug,
        resumo: row.resumo,
        conteudo: row.conteudo,
        tags: row.tags ?? [],
        codigo: row.codigo,
        episodio: row.episodio,
        aparece_em: row.aparece_em,
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
