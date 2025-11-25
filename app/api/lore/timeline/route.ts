
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

if (!supabaseAdmin) {
  console.warn("[Timeline API] supabaseAdmin não está configurado.");
}

/**
 * GET /api/lore/timeline
 * Lista eventos (fichas do tipo "evento") para a Timeline.
 * Query params:
 *  - worldId?: string
 *  - camada_temporal?: string
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase não está configurado no servidor (supabaseAdmin é null).",
          events: [],
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const worldId = searchParams.get("worldId");
    const camadaTemporal = searchParams.get("camada_temporal");

    let query = supabaseAdmin
      .from("fichas")
      .select(
        `
        id,
        world_id,
        titulo,
        resumo,
        tipo,
        episodio,
        camada_temporal,
        descricao_data,
        data_inicio,
        data_fim,
        granularidade_data,
        aparece_em,
        created_at
      `
      )
      .eq("tipo", "evento");

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    if (camadaTemporal && camadaTemporal.trim().length > 0) {
      query = query.eq("camada_temporal", camadaTemporal.trim());
    }

    const { data, error } = await query
      .order("data_inicio", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Timeline API][GET] Erro Supabase:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao buscar eventos da timeline.",
          events: [],
        },
        { status: 400 }
      );
    }

    const events =
      data?.map((row) => ({
        ficha_id: row.id,
        world_id: row.world_id,
        titulo: row.titulo,
        resumo: row.resumo,
        tipo: row.tipo,
        episodio: row.episodio,
        camada_temporal: row.camada_temporal,
        descricao_data: row.descricao_data,
        data_inicio: row.data_inicio,
        data_fim: row.data_fim,
        granularidade_data: row.granularidade_data,
        aparece_em: row.aparece_em,
        created_at: row.created_at,
      })) ?? [];

    return NextResponse.json(
      {
        success: true,
        error: null,
        events,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Timeline API][GET] Erro inesperado:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Erro inesperado ao buscar eventos da timeline.",
        events: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lore/timeline
 * Atualiza um evento (ficha) da Timeline.
 * Body JSON:
 *  - ficha_id: string
 *  - titulo: string
 *  - resumo: string
 *  - episodio: string
 *  - camada_temporal: string
 *  - descricao_data: string
 *  - data_inicio: string (YYYY-MM-DD) | ""
 *  - data_fim: string (YYYY-MM-DD) | ""
 *  - granularidade_data: string
 */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase não está configurado no servidor (supabaseAdmin é null).",
        },
        { status: 500 }
      );
    }

    const body = await req.json();

    const {
      ficha_id,
      titulo,
      resumo,
      episodio,
      camada_temporal,
      descricao_data,
      data_inicio,
      data_fim,
      granularidade_data,
    } = body || {};

    if (!ficha_id) {
      return NextResponse.json(
        {
          success: false,
          error: "ficha_id é obrigatório para atualizar um evento.",
        },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = {
      titulo: titulo ?? null,
      resumo: resumo ?? null,
      episodio: episodio ?? null,
      camada_temporal: camada_temporal ?? null,
      descricao_data: descricao_data ?? null,
      granularidade_data: granularidade_data ?? null,
    };

    // Converter strings vazias para null em datas
    payload.data_inicio =
      data_inicio && String(data_inicio).trim().length > 0
        ? data_inicio
        : null;
    payload.data_fim =
      data_fim && String(data_fim).trim().length > 0 ? data_fim : null;

    const { error } = await supabaseAdmin
      .from("fichas")
      .update(payload)
      .eq("id", ficha_id);

    if (error) {
      console.error("[Timeline API][POST] Erro Supabase:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao atualizar evento da timeline.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        error: null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Timeline API][POST] Erro inesperado:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Erro inesperado ao atualizar evento da timeline.",
      },
      { status: 500 }
    );
  }
}
