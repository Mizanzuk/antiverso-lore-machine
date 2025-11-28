// ============================================
// ARQUIVO: app/api/lore/categories/route.ts
// ============================================
// CRUD completo para gerenciar categorias POR UNIVERSO

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - Listar todas as categorias de um universo específico
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const universeId = searchParams.get("universeId");

    if (!universeId) {
      return NextResponse.json(
        { error: "universeId é obrigatório" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("lore_categories")
      .select("*")
      .eq("universe_id", universeId)
      .order("label");

    if (error) throw error;

    return NextResponse.json({ categories: data });
  } catch (err: any) {
    console.error("[CATEGORIES] Erro ao listar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// POST - Criar nova categoria vinculada a um universo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, label, description, prefix, universe_id } = body;

    // Validações
    if (!slug || !label) {
      return NextResponse.json(
        { error: "slug e label são obrigatórios" },
        { status: 400 }
      );
    }

    if (!universe_id) {
      return NextResponse.json(
        { error: "universe_id é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se já existe categoria com este slug neste universo
    const { data: existing } = await supabaseAdmin
      .from("lore_categories")
      .select("slug")
      .eq("slug", slug)
      .eq("universe_id", universe_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Categoria com este slug já existe neste universo" },
        { status: 409 }
      );
    }

    // Inserir
    const { data, error } = await supabaseAdmin
      .from("lore_categories")
      .insert({
        slug,
        label,
        description: description || null,
        prefix: prefix || null,
        universe_id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ category: data });
  } catch (err: any) {
    console.error("[CATEGORIES] Erro ao criar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// PUT - Atualizar categoria existente
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, label, description, prefix, universe_id } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "slug é obrigatório" },
        { status: 400 }
      );
    }

    if (!universe_id) {
      return NextResponse.json(
        { error: "universe_id é obrigatório" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (description !== undefined) updateData.description = description;
    if (prefix !== undefined) updateData.prefix = prefix;

    const { data, error } = await supabaseAdmin
      .from("lore_categories")
      .update(updateData)
      .eq("slug", slug)
      .eq("universe_id", universe_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ category: data });
  } catch (err: any) {
    console.error("[CATEGORIES] Erro ao atualizar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Deletar categoria (e todas as fichas dela neste universo)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const universeId = searchParams.get("universeId");

    if (!slug) {
      return NextResponse.json(
        { error: "slug é obrigatório" },
        { status: 400 }
      );
    }

    if (!universeId) {
      return NextResponse.json(
        { error: "universeId é obrigatório" },
        { status: 400 }
      );
    }

    // Primeiro, buscar todos os worlds deste universo
    const { data: worlds } = await supabaseAdmin
      .from("worlds")
      .select("id")
      .eq("universe_id", universeId);

    if (worlds && worlds.length > 0) {
      const worldIds = worlds.map(w => w.id);

      // Deletar todas as fichas desta categoria nestes worlds
      const { error: deleteFichasError } = await supabaseAdmin
        .from("fichas")
        .delete()
        .eq("tipo", slug)
        .in("world_id", worldIds);

      if (deleteFichasError) throw deleteFichasError;
    }

    // Depois, deletar a categoria
    const { error: deleteCategoryError } = await supabaseAdmin
      .from("lore_categories")
      .delete()
      .eq("slug", slug)
      .eq("universe_id", universeId);

    if (deleteCategoryError) throw deleteCategoryError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[CATEGORIES] Erro ao deletar:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
