import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; 

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId && supabaseAdmin) {
            clientToUse = supabaseAdmin;
            userId = headerUserId;
        }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const universeId = searchParams.get("universeId");

    // 1. Busca Mundos
    let worldsQuery = clientToUse
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id")
      .order("ordem", { ascending: true });

    if (universeId) {
        worldsQuery = worldsQuery.eq("universe_id", universeId);
    }

    const { data: worlds, error: worldsError } = await worldsQuery;

    if (worldsError) console.error("Erro ao buscar worlds:", worldsError.message);

    // 2. Busca Fichas
    let entitiesQuery = clientToUse
      .from("fichas")
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo"
      )
      .order("titulo", { ascending: true })
      .limit(2000);

    if (worlds && worlds.length > 0) {
        const worldIds = worlds.map(w => w.id);
        entitiesQuery = entitiesQuery.in("world_id", worldIds);
    } else if (universeId) {
        entitiesQuery = entitiesQuery.in("world_id", []);
    }

    const { data: entities, error: entitiesError } = await entitiesQuery;

    if (entitiesError) console.error("Erro ao buscar fichas:", entitiesError.message);

    // 3. Busca Categorias (DINÂMICO)
    const { data: categories, error: catError } = await clientToUse
      .from("lore_categories")
      .select("slug, label")
      .order("label", { ascending: true });

    if (catError) console.error("Erro ao buscar categorias:", catError.message);

    // Mapeia para o formato esperado pelo front { id, label }
    const types = categories?.map((c: any) => ({
        id: c.slug,
        label: c.label
    })) || [];

    return NextResponse.json({
      worlds: worlds ?? [],
      entities: entities ?? [],
      types,
    });
  } catch (err: any) {
    console.error("Erro inesperado em /api/catalog:", err);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo." },
      { status: 500 }
    );
  }
}
