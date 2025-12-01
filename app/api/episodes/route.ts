// ============================================
// ARQUIVO: app/api/episodes/route.ts
// ============================================
// CRUD completo para gerenciar episódios

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - Listar episódios (filtrado por mundo se fornecido)
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
    const worldId = searchParams.get("worldId");

    let query = clientToUse
      .from("episodes")
      .select("*")
      .order("numero", { ascending: true });

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ episodes: data ?? [] });
  } catch (err: any) {
    console.error("[EPISODES] Erro ao listar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// POST - Criar novo episódio
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { titulo, numero, world_id } = body;

    if (!titulo || titulo.trim() === "") {
      return NextResponse.json(
        { error: "Título do episódio é obrigatório" },
        { status: 400 }
      );
    }

    if (!world_id) {
      return NextResponse.json(
        { error: "world_id é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o mundo existe e pertence a um universo do usuário
    const { data: world } = await clientToUse
      .from("worlds")
      .select("universe_id, has_episodes")
      .eq("id", world_id)
      .single();

    if (!world) {
      return NextResponse.json(
        { error: "Mundo não encontrado" },
        { status: 404 }
      );
    }

    if (!world.has_episodes) {
      return NextResponse.json(
        { error: "Este mundo não suporta episódios" },
        { status: 400 }
      );
    }

    const { data: universe } = await clientToUse
      .from("universes")
      .select("id")
      .eq("id", world.universe_id)
      .eq("user_id", userId)
      .single();

    if (!universe) {
      return NextResponse.json(
        { error: "Sem permissão para criar episódio neste mundo" },
        { status: 403 }
      );
    }

    // Se número não fornecido, buscar o próximo disponível
    let episodeNumero = numero;
    if (!episodeNumero) {
      const { data: maxEpisode } = await clientToUse
        .from("episodes")
        .select("numero")
        .eq("world_id", world_id)
        .order("numero", { ascending: false })
        .limit(1)
        .single();

      episodeNumero = (maxEpisode?.numero ?? 0) + 1;
    }

    const { data, error } = await clientToUse
      .from("episodes")
      .insert({
        titulo: titulo.trim(),
        numero: episodeNumero,
        world_id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ episode: data });
  } catch (err: any) {
    console.error("[EPISODES] Erro ao criar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// PUT - Atualizar episódio existente
export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const { id, titulo, numero } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do episódio é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o episódio existe e pertence a um mundo do usuário
    const { data: episode } = await clientToUse
      .from("episodes")
      .select("world_id")
      .eq("id", id)
      .single();

    if (!episode) {
      return NextResponse.json(
        { error: "Episódio não encontrado" },
        { status: 404 }
      );
    }

    const { data: world } = await clientToUse
      .from("worlds")
      .select("universe_id")
      .eq("id", episode.world_id)
      .single();

    if (!world) {
      return NextResponse.json(
        { error: "Mundo não encontrado" },
        { status: 404 }
      );
    }

    const { data: universe } = await clientToUse
      .from("universes")
      .select("id")
      .eq("id", world.universe_id)
      .eq("user_id", userId)
      .single();

    if (!universe) {
      return NextResponse.json(
        { error: "Sem permissão para editar este episódio" },
        { status: 403 }
      );
    }

    const updateData: any = {};
    if (titulo !== undefined) updateData.titulo = titulo.trim();
    if (numero !== undefined) updateData.numero = numero;

    const { data, error } = await clientToUse
      .from("episodes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ episode: data });
  } catch (err: any) {
    console.error("[EPISODES] Erro ao atualizar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Deletar episódio
export async function DELETE(req: NextRequest) {
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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do episódio é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o episódio existe e pertence a um mundo do usuário
    const { data: episode } = await clientToUse
      .from("episodes")
      .select("world_id")
      .eq("id", id)
      .single();

    if (!episode) {
      return NextResponse.json(
        { error: "Episódio não encontrado" },
        { status: 404 }
      );
    }

    const { data: world } = await clientToUse
      .from("worlds")
      .select("universe_id")
      .eq("id", episode.world_id)
      .single();

    if (!world) {
      return NextResponse.json(
        { error: "Mundo não encontrado" },
        { status: 404 }
      );
    }

    const { data: universe } = await clientToUse
      .from("universes")
      .select("id")
      .eq("id", world.universe_id)
      .eq("user_id", userId)
      .single();

    if (!universe) {
      return NextResponse.json(
        { error: "Sem permissão para deletar este episódio" },
        { status: 403 }
      );
    }

    // Deletar o episódio
    const { error } = await clientToUse
      .from("episodes")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[EPISODES] Erro ao deletar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
