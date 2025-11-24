import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

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

function normalizeTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const worldId = searchParams.get("worldId");
    const camada = searchParams.get("camada");

    if (!worldId) {
      return NextResponse.json(
        { error: "Parâmetro worldId é obrigatório." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    let query = supabase
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
      .eq("world_id", worldId)
      .eq("tipo", "evento")
      .order("data_inicio", { ascending: true })
      .order("created_at", { ascending: true });

    if (camada && camada !== "todas") {
      query = query.eq("camada_temporal", camada);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[timeline] Erro Supabase:", error);
      return NextResponse.json(
        { error: "Erro ao carregar eventos para a linha do tempo." },
        { status: 500 }
      );
    }

    const items: TimelineItem[] =
      (data || []).map((row: any) => ({
        id: row.id,
        world_id: row.world_id ?? null,
        titulo: row.titulo ?? null,
        slug: row.slug ?? null,
        resumo: row.resumo ?? null,
        conteudo: row.conteudo ?? null,
        tags: normalizeTags(row.tags ?? null),
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
