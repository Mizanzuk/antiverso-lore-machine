// app/api/lore/timeline/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * API da Timeline
 *
 * Retorna eventos (fichas de tipo "evento") com campos temporais
 * para construção da linha do tempo.
 *
 * Query params opcionais:
 * - worldId: filtra por mundo específico
 * - episodio: filtra por episódio dentro do mundo
 */
export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) {
      console.error("[Timeline API] supabaseAdmin não configurado.");
      return NextResponse.json(
        { error: "Supabase não configurado no servidor." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const worldId = searchParams.get("worldId");
    const episodio = searchParams.get("episodio");

    let query = supabaseAdmin
      .from("fichas")
      .select(
        `
        id,
        world_id,
        titulo,
        slug,
        tipo,
        resumo,
        episodio,
        ordem_cronologica,
        data_inicio,
        data_fim,
        granularidade_data,
        descricao_data,
        camada_temporal
      `
      )
      .eq("tipo", "evento");

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    if (episodio) {
      query = query.eq("episodio", episodio);
    }

    // Ordenação padrão da timeline:
    // - Primeiro pela data de início (quando existir)
    // - Depois pela ordem cronológica auxiliar (opcional)
    query = query
      .order("data_inicio", { ascending: true })
      .order("ordem_cronologica", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("[Timeline API] Erro ao buscar eventos:", error);
      return NextResponse.json(
        { error: "Erro ao buscar eventos da timeline." },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    console.error("[Timeline API] Erro inesperado:", error);
    return NextResponse.json(
      { error: "Erro inesperado na Timeline API." },
      { status: 500 }
    );
  }
}
