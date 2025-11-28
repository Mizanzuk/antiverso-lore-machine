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

    // Fallback de segurança para modo Admin
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
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id, has_episodes")
      .order("ordem", { ascending: true });

    if (universeId) {
        worldsQuery = worldsQuery.eq("universe_id", universeId);
    }

    const { data: worlds, error: worldsError } = await worldsQuery;

    if (worldsError) {
        console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // 2. Busca Fichas (QUERY COMPLETA SEM RESUMOS)
    let entitiesQuery = clientToUse
      .from("fichas")
      .select(`
        id, 
        slug, 
        tipo, 
        titulo, 
        resumo, 
        conteudo, 
        world_id, 
        ano_diegese, 
        tags, 
        codigo, 
        imagem_url, 
        aparece_em, 
        data_inicio, 
        data_fim, 
        granularidade_data, 
        camada_temporal, 
        descricao_data, 
        episodio
      `)
      .order("titulo", { ascending: true })
      .limit(3000);

    if (worlds && worlds.length > 0) {
        const worldIds = worlds.map(w => w.id);
        entitiesQuery = entitiesQuery.in("world_id", worldIds);
    } else if (universeId) {
        entitiesQuery = entitiesQuery.in("world_id", []);
    }

    const { data: entities, error: entitiesError } = await entitiesQuery;

    if (entitiesError) {
        console.error("Erro ao buscar fichas:", entitiesError.message);
    }

    // 3. Busca Categorias (Dinâmico do Banco)
    let types: {id: string, label: string}[] = [];
    try {
        const { data: categories, error: catError } = await clientToUse
          .from("lore_categories")
          .select("slug, label")
          .order("label", { ascending: true });
        
        if (!catError && categories) {
            types = categories.map((c: any) => ({ id: c.slug, label: c.label }));
        }
    } catch (e) {
        console.warn("Tabela lore_categories não encontrada ou erro de acesso.");
    }

    return NextResponse.json({
      worlds: worlds ?? [],
      entities: entities ?? [],
      types,
    });

  } catch (err: any) {
    console.error("Erro CRÍTICO em /api/catalog:", err);
    return NextResponse.json(
      { error: "Erro interno no servidor: " + err.message },
      { status: 500 }
    );
  }
}
