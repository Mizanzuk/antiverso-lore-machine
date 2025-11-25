import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
// ajuste o caminho do tipo Database se for diferente no seu projeto
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET  /api/lore/timeline?worldId=...
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const worldId = searchParams.get("worldId");

    const supabase = createRouteHandlerClient<Database>({ cookies });

    let query = supabase
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
        aparece_em
      `
      )
      .eq("tipo", "evento")
      .order("data_inicio", { ascending: true });

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Timeline][GET] Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, events: data ?? [] },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[Timeline][GET] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Erro inesperado ao carregar a timeline." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// PATCH  /api/lore/timeline  { id, updates }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, updates } = body as {
      id?: string;
      updates?: Record<string, any>;
    };

    if (!id || !updates || typeof updates !== "object") {
      return NextResponse.json(
        { ok: false, error: "Parâmetros inválidos." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    const { data, error } = await supabase
      .from("fichas")
      .update({
        titulo: updates.titulo,
        resumo: updates.resumo,
        episodio: updates.episodio,
        camada_temporal: updates.camada_temporal,
        descricao_data: updates.descricao_data,
        data_inicio: updates.data_inicio || null,
        data_fim: updates.data_fim || null,
        granularidade_data: updates.granularidade_data,
        aparece_em: updates.aparece_em,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[Timeline][PATCH] Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, event: data },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[Timeline][PATCH] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Erro inesperado ao salvar o evento." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
