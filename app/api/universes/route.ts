// ============================================
// ARQUIVO: app/api/universes/route.ts
// ============================================
// CRUD completo para gerenciar universos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - Listar todos os universos do usuário
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

    const { data, error } = await clientToUse
      .from("universes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ universes: data ?? [] });
  } catch (err: any) {
    console.error("[UNIVERSES] Erro ao listar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// POST - Criar novo universo (com Mundo Raiz automático)
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
    const { nome, descricao } = body;

    if (!nome || nome.trim() === "") {
      return NextResponse.json(
        { error: "Nome do universo é obrigatório" },
        { status: 400 }
      );
    }

    // 1. Criar o universo
    const { data: universe, error: universeError } = await clientToUse
      .from("universes")
      .insert({
        nome: nome.trim(),
        descricao: descricao?.trim() || null,
        user_id: userId,
      })
      .select()
      .single();

    if (universeError) throw universeError;

    // 2. Criar Mundo Raiz automaticamente
    const { data: rootWorld, error: worldError } = await clientToUse
      .from("worlds")
      .insert({
        nome: `${nome} (Raiz)`,
        descricao: "Mundo raiz do universo. Contém regras e conceitos globais.",
        universe_id: universe.id,
        is_root: true,
        has_episodes: false,
        ordem: 0,
      })
      .select()
      .single();

    if (worldError) {
      // Se falhar ao criar mundo raiz, deletar o universo criado
      await clientToUse.from("universes").delete().eq("id", universe.id);
      throw worldError;
    }

    return NextResponse.json({ 
      universe,
      rootWorld 
    });
  } catch (err: any) {
    console.error("[UNIVERSES] Erro ao criar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// PUT - Atualizar universo existente
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
    const { id, nome, descricao } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID do universo é obrigatório" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (nome !== undefined) updateData.nome = nome.trim();
    if (descricao !== undefined) updateData.descricao = descricao?.trim() || null;

    const { data, error } = await clientToUse
      .from("universes")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ universe: data });
  } catch (err: any) {
    console.error("[UNIVERSES] Erro ao atualizar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Deletar universo (e todos os mundos, fichas, etc)
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
        { error: "ID do universo é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se o universo pertence ao usuário
    const { data: universe } = await clientToUse
      .from("universes")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!universe) {
      return NextResponse.json(
        { error: "Universo não encontrado ou sem permissão" },
        { status: 404 }
      );
    }

    // Buscar todos os mundos deste universo
    const { data: worlds } = await clientToUse
      .from("worlds")
      .select("id")
      .eq("universe_id", id);

    if (worlds && worlds.length > 0) {
      const worldIds = worlds.map(w => w.id);

      // Deletar todas as fichas desses mundos
      await clientToUse
        .from("fichas")
        .delete()
        .in("world_id", worldIds);

      // Deletar todos os episódios desses mundos
      await clientToUse
        .from("episodes")
        .delete()
        .in("world_id", worldIds);

      // Deletar todos os mundos
      await clientToUse
        .from("worlds")
        .delete()
        .eq("universe_id", id);
    }

    // Deletar categorias do universo
    await clientToUse
      .from("lore_categories")
      .delete()
      .eq("universe_id", id);

    // Deletar o universo
    const { error } = await clientToUse
      .from("universes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[UNIVERSES] Erro ao deletar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
