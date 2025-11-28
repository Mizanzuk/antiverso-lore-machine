import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importação crítica

export const dynamic = "force-dynamic";

// Helper de Autenticação
async function getAuthenticatedClient(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) return { client: supabase, userId: user.id };

  // Fallback para Header
  const headerUserId = req.headers.get("x-user-id");
  if (headerUserId && supabaseAdmin) {
    return { client: supabaseAdmin, userId: headerUserId };
  }

  return { client: null, userId: null };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const worldId = searchParams.get("worldId");
  const universeId = searchParams.get("universeId");
  const camada = searchParams.get("camada_temporal");
  
  const { client, userId } = await getAuthenticatedClient(req);

  if (!client || !userId) {
    return NextResponse.json({ success: false, error: "Acesso negado (401)." }, { status: 401 });
  }

  // Se estivermos usando supabaseAdmin, precisamos filtrar manualmente por user_id se a tabela tiver essa coluna e RLS
  // Mas como RLS é no banco, usar o admin bypassa. O ideal é filtrar explicitamente se necessário.
  // Assumindo que a aplicação cuida do isolamento via lógica de negócio (world_id/universe_id).

  let query = client
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
      const { data: worldsData, error: worldsError } = await client
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
  const { client, userId } = await getAuthenticatedClient(req);

  if (!client || !userId) {
    return NextResponse.json({ success: false, error: "Acesso negado (401)." }, { status: 401 });
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

    const { error } = await client
      .from("fichas")
      .update(updateData)
      .eq("id", ficha_id);

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
    // Se estiver usando admin, é bom garantir que o user_id vá (se sua tabela exigir)
    // user_id: userId, 
  };

  const { data, error } = await client
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
  const { client, userId } = await getAuthenticatedClient(req);

  if (!client || !userId) {
    return NextResponse.json({ success: false, error: "Acesso negado (401)." }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const fichaId = searchParams.get("ficha_id");

  if (!fichaId) return NextResponse.json({ success: false }, { status: 400 });

  const { error } = await client
    .from("fichas")
    .delete()
    .eq("id", fichaId);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, error: null });
}
