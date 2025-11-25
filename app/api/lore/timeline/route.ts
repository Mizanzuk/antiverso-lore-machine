// app/api/lore/timeline/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Em build, isso ajuda a diagnosticar rapidamente se faltar env
  console.warn(
    "[Timeline API] Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_ANON_KEY nas variáveis de ambiente."
  );
}

const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const worldId = searchParams.get("worldId");
    const camada = searchParams.get("camada");
    const episodio = searchParams.get("episodio");

    let query = supabase
      .from("fichas")
      .select(
        `
          id,
          world_id,
          titulo,
          resumo,
          episodio,
          camada_temporal,
          descricao_data,
          data_inicio,
          data_fim,
          granularidade_data,
          aparece_em
        `
      )
      .eq("tipo", "evento");

    // Filtros opcionais
    if (worldId && worldId !== "all") {
      query = query.eq("world_id", worldId);
    }

    if (camada && camada.trim() !== "") {
      query = query.eq("camada_temporal", camada);
    }

    if (episodio && episodio.trim() !== "") {
      query = query.eq("episodio", episodio);
    }

    // Ordenação cronológica
    query = query
      .order("data_inicio", { ascending: true, nullsFirst: true })
      .order("data_fim", { ascending: true, nullsFirst: true })
      .order("ordem_cronologica", { ascending: true, nullsFirst: true });

    const { data, error } = await query;

    if (error) {
      console.error("[Timeline API] Erro Supabase:", error);
      return NextResponse.json(
        { error: "Erro ao carregar eventos da Timeline." },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      { events: data ?? [] },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("[Timeline API] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao carregar Timeline." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
