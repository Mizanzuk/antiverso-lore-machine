// ============================================
// ARQUIVO: app/api/worlds/route.ts
// ============================================
// CRUD completo para gerenciar mundos
// PROTEÇÃO: Mundo Raiz não pode ser deletado diretamente

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - Listar mundos (filtrado por universo se fornecido)
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

    let query = clientToUse
      .from("worlds")
      .select("*")
      .order("ordem", { ascending: true });

    if (universeId) {
      query = query.eq("universe_id", universeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ worlds: data ?? [] });
  } catch (err: any) {
    console.error("[WORLDS] Erro ao listar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// POST - Criar novo mundo
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
    const { nome, descricao, universe_id, has_episodes, tipo } = body;

    if (!nome || nome.trim() === "") {
      return NextResponse.json(
        { error: "Nome do mundo é obrigatório" },
        { status: 400 }
      );
    }

    if (!universe_id) {
      return NextResponse.json(
        { error: "universe_id é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o universo existe e pertence ao usuário
    const { data: universe } = await clientToUse
      .from("universes")
      .select("id")
      .eq("id", universe_id)
      .eq("user_id", userId)
      .single();

    if (!universe) {
      return NextResponse.json(
        { error: "Universo não encontrado ou sem permissão" },
        { status: 404 }
      );
    }

    // Buscar a maior ordem atual para este universo
    const { data: maxOrdemWorld } = await clientToUse
      .from("worlds")
      .select("ordem")
      .eq("universe_id", universe_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .single();

    const nextOrdem = (maxOrdemWorld?.ordem ?? 0) + 1;

    const { data, error } = await clientToUse
      .from("worlds")
      .insert({
        nome: nome.trim(),
        descricao: descricao?.trim() || null,
        universe_id,
        has_episodes: has_episodes ?? false,
        is_root: false, // Mundos criados manualmente nunca são raiz
        ordem: nextOrdem,
        tipo: tipo?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ world: data });
  } catch (err: any) {
    console.error("[WORLDS] Erro ao criar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// PUT - Atualizar mundo existente
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
    const { id, nome, descricao, has_episodes, tipo, ordem } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do mundo é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o mundo existe e pertence a um universo do usuário
    const { data: world } = await clientToUse
      .from("worlds")
      .select("universe_id, is_root")
      .eq("id", id)
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
        { error: "Sem permissão para editar este mundo" },
        { status: 403 }
      );
    }

    const updateData: any = {};
    if (nome !== undefined) updateData.nome = nome.trim();
    if (descricao !== undefined) updateData.descricao = descricao?.trim() || null;
    if (has_episodes !== undefined) updateData.has_episodes = has_episodes;
    if (tipo !== undefined) updateData.tipo = tipo?.trim() || null;
    if (ordem !== undefined) updateData.ordem = ordem;

    const { data, error } = await clientToUse
      .from("worlds")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ world: data });
  } catch (err: any) {
    console.error("[WORLDS] Erro ao atualizar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Deletar mundo (com proteção para Mundo Raiz)
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
        { error: "ID do mundo é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o mundo existe e pertence a um universo do usuário
    const { data: world } = await clientToUse
      .from("worlds")
      .select("universe_id, is_root")
      .eq("id", id)
      .single();

    if (!world) {
      return NextResponse.json(
        { error: "Mundo não encontrado" },
        { status: 404 }
      );
    }

    // PROTEÇÃO: Não permitir deletar Mundo Raiz diretamente
    if (world.is_root) {
      return NextResponse.json(
        { 
          error: "Mundo Raiz não pode ser deletado diretamente. Para deletá-lo, delete o universo inteiro." 
        },
        { status: 403 }
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
        { error: "Sem permissão para deletar este mundo" },
        { status: 403 }
      );
    }

    // Deletar todas as fichas deste mundo
    await clientToUse
      .from("fichas")
      .delete()
      .eq("world_id", id);

    // Deletar todos os episódios deste mundo
    await clientToUse
      .from("episodes")
      .delete()
      .eq("world_id", id);

    // Deletar o mundo
    const { error } = await clientToUse
      .from("worlds")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[WORLDS] Erro ao deletar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
