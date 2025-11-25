// app/api/lore/timeline/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "[Timeline API] Faltando NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY nas variáveis de ambiente."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const worldId = searchParams.get("worldId");
    const episodio = searchParams.get("episodio");

    let query = supabase
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

    // Ordenação padrão da timeline
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
