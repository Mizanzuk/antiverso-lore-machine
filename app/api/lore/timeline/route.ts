import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function makeSlug(title: string | null | undefined): string {
  const base =
    (title ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "evento";

  const stamp = Date.now().toString(36);
  return `${base}-${stamp}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const worldId = searchParams.get("worldId");
  const universeId = searchParams.get("universeId");
  const camada = searchParams.get("camada_temporal");
  
  // 1. SEGURANÇA
  const userId = req.headers.get("x-user-id");

  if (!supabaseAdmin || !userId) {
    return NextResponse.json(
      { success: false, error: "Acesso negado ou Supabase off." },
      { status: 401 }
    );
  }

  let query = supabaseAdmin
    .from("fichas")
    .select(
      "id, world_id, titulo, resumo, conteudo, tipo, episodio, camada_temporal, descricao_data, data_inicio, data_fim, granularidade_data, aparece_em, created_at, user_id"
    )
    .eq("tipo", "evento")
    .eq("user_id", userId) // FILTRO OBRIGATÓRIO
    .order("data_inicio", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (worldId) {
    query = query.eq("world_id", worldId);
  } else if (universeId) {
    try {
      // Busca mundos do universo QUE PERTENCEM AO USUÁRIO
      let worldsQuery = supabaseAdmin
        .from("worlds")
        .select("id")
        .eq("universe_id", universeId)
        .eq("user_id", userId); // SEGURANÇA

      const { data: worldsData, error: worldsError } = await worldsQuery;

      if (worldsError) throw worldsError;

      const worldIds = worldsData?.map((w) => w.id) || [];
      
      if (worldIds.length > 0) {
        query = query.in("world_id", worldIds);
      } else {
        return NextResponse.json({ success: true, error: null, events: [] });
      }
    } catch (err) {
      console.error("Erro ao buscar mundos:", err);
      return NextResponse.json(
        { success: false, error: "Erro ao filtrar mundos." },
        { status: 500 }
      );
    }
  }

  if (camada && camada.trim().length > 0) {
    query = query.eq("camada_temporal", camada.trim());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message, events: [] },
      { status: 400 }
    );
  }

  const events =
    data?.map((row) => ({
      ficha_id: row.id as string,
      world_id: (row as any).world_id ?? null,
      titulo: (row as any).titulo ?? null,
      resumo: (row as any).resumo ?? null,
      conteudo: (row as any).conteudo ?? null,
      tipo: (row as any).tipo ?? null,
      episodio: (row as any).episodio ?? null,
      camada_temporal: (row as any).camada_temporal ?? null,
      descricao_data: (row as any).descricao_data ?? null,
      data_inicio: (row as any).data_inicio ?? null,
      data_fim: (row as any).data_fim ?? null,
      granularidade_data: (row as any).granularidade_data ?? null,
      aparece_em: (row as any).aparece_em ?? null,
      created_at: (row as any).created_at ?? null,
    })) ?? [];

  return NextResponse.json({ success: true, error: null, events });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!supabaseAdmin || !userId) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 401 });
  }

  const body = await req.json();
  const { ficha_id, ...fields } = body || {};

  if (ficha_id) {
    // UPDATE
    const updateData: any = {
      titulo: fields.titulo ?? "",
      resumo: fields.resumo ?? "",
      conteudo: fields.conteudo ?? "",
      episodio: fields.episodio ?? "",
      camada_temporal: fields.camada_temporal ?? "",
      descricao_data: fields.descricao_data ?? "",
      granularidade_data: fields.granularidade_data ?? "",
      data_inicio: fields.data_inicio || null,
      data_fim: fields.data_fim || null,
    };

    const { error } = await supabaseAdmin
      .from("fichas")
      .update(updateData)
      .eq("id", ficha_id)
      .eq("user_id", userId); // GARANTE PROPRIEDADE

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, error: null, mode: "update" });
  }

  // CREATE
  if (!fields.world_id) {
    return NextResponse.json({ success: false, error: "world_id obrigatório" }, { status: 400 });
  }

  const slug = makeSlug(fields.titulo ?? "");
  
  const insertData: any = {
    world_id: fields.world_id,
    user_id: userId, // VINCULA AO DONO
    tipo: "evento",
    titulo: fields.titulo ?? "",
    slug,
    resumo: fields.resumo ?? "",
    conteudo: fields.conteudo ?? fields.resumo ?? "",
    episodio: fields.episodio ?? "",
    camada_temporal: fields.camada_temporal ?? "",
    descricao_data: fields.descricao_data ?? "",
    granularidade_data: fields.granularidade_data ?? "",
    data_inicio: fields.data_inicio || null,
    data_fim: fields.data_fim || null,
  };

  const { data, error } = await supabaseAdmin
    .from("fichas")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    error: null,
    mode: "create",
    ficha_id: data?.id ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!supabaseAdmin || !userId) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const fichaId = searchParams.get("ficha_id");

  if (!fichaId) return NextResponse.json({ success: false }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("fichas")
    .delete()
    .eq("id", fichaId)
    .eq("user_id", userId); // GARANTE PROPRIEDADE

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, error: null });
}
