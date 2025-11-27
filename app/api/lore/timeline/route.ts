import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Gera um slug seguro a partir de um título.
 */
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
  const universeId = searchParams.get("universeId"); // NOVO: Captura o universeId
  const camada = searchParams.get("camada_temporal");

  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, error: "Supabase não configurado." },
      { status: 500 }
    );
  }

  let query = supabaseAdmin
    .from("fichas")
    .select(
      "id, world_id, titulo, resumo, conteudo, tipo, episodio, camada_temporal, descricao_data, data_inicio, data_fim, granularidade_data, aparece_em, created_at"
    )
    .eq("tipo", "evento")
    .order("data_inicio", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (worldId) {
    // Se worldId é fornecido, filtra por ele.
    query = query.eq("world_id", worldId);
  } else if (universeId) {
    // Se universeId é fornecido (e não há worldId), buscamos todos os world_ids desse universo.
    try {
      // Busca todos os mundos do universo (incluindo o Mundo Teste se ele estiver no mesmo universo ou não tiver universoId)
      let worldsQuery = supabaseAdmin
        .from("worlds")
        .select("id");
        
      // Filtra pelo universeId para carregar os mundos filhos
      worldsQuery = worldsQuery.eq("universe_id", universeId);

      const { data: worldsData, error: worldsError } = await worldsQuery;

      if (worldsError) throw worldsError;

      const worldIds = worldsData?.map((w) => w.id) || [];
      
      // Adiciona o Mundo "Teste" manualmente se ele for o caso (assumindo o ID 'teste'
      // ou um padrão específico para mundos que foram criados fora da estrutura de universos)
      // *NOTA: Este é um patch de segurança. O ideal seria ter todos os mundos com universe_id correto.*
      if (!worldIds.includes("teste")) {
          worldIds.push("teste");
      }
      
      if (worldIds.length > 0) {
        // Filtra os eventos de todas as fichas que pertencem a algum mundo desse conjunto.
        query = query.in("world_id", worldIds);
      } else {
        // Não há mundos no universo, retorna vazio.
        return NextResponse.json({ success: true, error: null, events: [] });
      }
    } catch (err) {
      console.error("Erro ao buscar mundos por universo:", err);
      return NextResponse.json(
        { success: false, error: "Erro ao buscar mundos para filtragem." },
        { status: 500 }
      );
    }
  }

  if (camada && camada.trim().length > 0) {
    query = query.eq("camada_temporal", camada.trim());
  }

  const { data, error } = await query;

  if (error) {
    console.error("Erro ao buscar eventos da timeline:", error);
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
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, error: "Supabase não configurado." },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { ficha_id, ...fields } = body || {};

  // Se vier ficha_id, é update (edição)
  if (ficha_id) {
    const updateData: any = {
      titulo: fields.titulo ?? "",
      resumo: fields.resumo ?? "",
      conteudo: fields.conteudo ?? "",
      episodio: fields.episodio ?? "",
      camada_temporal: fields.camada_temporal ?? "",
      descricao_data: fields.descricao_data ?? "",
      granularidade_data: fields.granularidade_data ?? "",
    };

    updateData.data_inicio =
      fields.data_inicio && fields.data_inicio !== ""
        ? fields.data_inicio
        : null;
    updateData.data_fim =
      fields.data_fim && fields.data_fim !== "" ? fields.data_fim : null;

    const { error } = await supabaseAdmin
      .from("fichas")
      .update(updateData)
      .eq("id", ficha_id);

    if (error) {
      console.error("Erro ao atualizar evento:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, error: null, mode: "update" });
  }

  // Sem ficha_id → criação
  if (!fields.world_id) {
    return NextResponse.json(
      { success: false, error: "world_id é obrigatório para criar evento" },
      { status: 400 }
    );
  }

  const titulo: string = fields.titulo ?? "";
  // Aqui estava o erro: makeSlug() vazio. Agora passamos 'titulo'.
  const slug = makeSlug(titulo);
  
  const conteudo: string =
    (fields.conteudo as string | undefined) ??
    (fields.resumo as string | undefined) ??
    "";

  const insertData: any = {
    world_id: fields.world_id,
    tipo: "evento",
    titulo,
    slug,
    resumo: fields.resumo ?? "",
    conteudo,
    episodio: fields.episodio ?? "",
    camada_temporal: fields.camada_temporal ?? "",
    descricao_data: fields.descricao_data ?? "",
    granularidade_data: fields.granularidade_data ?? "",
  };

  insertData.data_inicio =
    fields.data_inicio && fields.data_inicio !== ""
      ? fields.data_inicio
      : null;
  insertData.data_fim =
    fields.data_fim && fields.data_fim !== "" ? fields.data_fim : null;

  const { data, error } = await supabaseAdmin
    .from("fichas")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    console.error("Erro ao criar evento:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    error: null,
    mode: "create",
    ficha_id: data?.id ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, error: "Supabase não configurado." },
      { status: 500 }
    );
  }
  
  const { searchParams } = new URL(req.url);
  const fichaId = searchParams.get("ficha_id");

  if (!fichaId) {
    return NextResponse.json(
      { success: false, error: "ficha_id é obrigatório" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("fichas").delete().eq("id", fichaId);

  if (error) {
    console.error("Erro ao deletar evento:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, error: null });
}
