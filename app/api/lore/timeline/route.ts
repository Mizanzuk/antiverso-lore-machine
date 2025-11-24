import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Timeline API – versão 1
 * ------------------------------------------------------
 * Devolve eventos em ordem cronológica,
 * usando as fichas de tipo "evento" na tabela `fichas`.
 *
 * Query params opcionais:
 *  - worldId: filtra por mundo
 *  - episode: filtra por número de episódio (quando o mundo tem episódios)
 *  - camada_temporal / camadaTemporal: filtra por camada temporal
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get("worldId");
    const episode = searchParams.get("episode");
    // aceitar tanto camada_temporal quanto camadaTemporal
    const camadaTemporal =
      searchParams.get("camada_temporal") ||
      searchParams.get("camadaTemporal");

    let query = supabaseAdmin
      .from("fichas")
      .select(
        [
          "id",
          "world_id",
          "titulo",
          "resumo",
          "tipo",
          "episodio",
          "aparece_em",
          "ano_diegese",
          "data_inicio",
          "data_fim",
          "granularidade_data",
          "descricao_data",
          "camada_temporal",
          "ordem_cronologica",
          "created_at",
        ].join(",")
      )
      .eq("tipo", "evento");

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    if (episode) {
      query = query.eq("episodio", episode);
    }

    if (camadaTemporal) {
      query = query.eq("camada_temporal", camadaTemporal);
    }

    // Ordenação básica:
    // 1) data_inicio (quando houver)
    // 2) ano_diegese (fallback para registros antigos)
    // 3) ordem_cronologica (se preenchido)
    // 4) created_at (garante ordem estável)
    query = query
      .order("data_inicio", { ascending: true, nullsFirst: true })
      .order("ano_diegese", { ascending: true, nullsFirst: true })
      .order("ordem_cronologica", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Erro ao buscar eventos para timeline:", error);
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao buscar eventos para timeline.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const events = (data || []).map((row: any) => ({
      id: row.id,
      world_id: row.world_id,
      titulo: row.titulo,
      resumo: row.resumo,
      tipo: row.tipo,
      episodio: row.episodio,
      aparece_em: row.aparece_em,
      ano_diegese: row.ano_diegese,
      data_inicio: row.data_inicio,
      data_fim: row.data_fim,
      granularidade_data: row.granularidade_data,
      descricao_data: row.descricao_data,
      camada_temporal: row.camada_temporal,
      ordem_cronologica: row.ordem_cronologica,
      created_at: row.created_at,
    }));

    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
    });
  } catch (err: any) {
    console.error("Erro inesperado na Timeline API:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Erro inesperado ao montar timeline.",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
