import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const worldId = searchParams.get("worldId");
  const universeId = searchParams.get("universeId");
  const camada = searchParams.get("camada_temporal");
  
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 401 });
  }

  // RLS filtra automaticamente pelo user_id
  let query = supabase
    .from("fichas")
    .select(
      "id, world_id, titulo, resumo, conteudo, tipo, episodio, camada_temporal, descricao_data, data_inicio, data_fim, granularidade_data, aparece_em, created_at, user_id"
    )
    .eq("tipo", "evento")
    .order("data_inicio", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (worldId) {
    query = query.eq("world_id", worldId);
  } else if (universeId) {
    try {
      const { data: worldsData, error: worldsError } = await supabase
        .from("worlds")
        .select("id")
        .eq("universe_id", universeId);

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
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 401 });
  }

  const body = await req.json();
  const { ficha_id, ...fields } = body || {};

  function makeSlug(title: string | null | undefined): string {
    const base = (title ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "evento";
    return `${base}-${Date.now().toString(36)}`;
  }

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

    const { error } = await supabase
      .from("fichas")
      .update(updateData)
      .eq("id", ficha_id); // RLS garante ownership

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, error: null, mode: "update" });
  }

  // CREATE
  if (!fields.world_id) {
    return NextResponse.json({ success: false, error: "world_id obrigatório" }, { status: 400 });
  }

  const slug = makeSlug(fields.titulo ?? "");
  
  const insertData: any = {
    world_id: fields.world_id,
    // user_id injetado automaticamente pelo RLS/Default do banco ou explícito:
    // user_id: user.id,
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

  const { data, error } = await supabase
    .from("fichas")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    success: true,
    error: null,
    mode: "create",
    ficha_id: data?.id ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const fichaId = searchParams.get("ficha_id");

  if (!fichaId) return NextResponse.json({ success: false }, { status: 400 });

  const { error } = await supabase
    .from("fichas")
    .delete()
    .eq("id", fichaId); // RLS protege

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, error: null });
}
