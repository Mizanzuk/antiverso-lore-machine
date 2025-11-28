// ============================================
// ARQUIVO: app/api/lore/categories/route.ts
// ============================================
// CRUD completo para gerenciar categorias

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - Listar todas as categorias
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("lore_categories")
      .select("*")
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

// POST - Criar nova categoria
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, label, description, prefix } = body;

    // Validações
    if (!slug || !label) {
      return NextResponse.json(
        { error: "slug e label são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar se já existe
    const { data: existing } = await supabaseAdmin
      .from("lore_categories")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Categoria com este slug já existe" },
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

// PATCH - Atualizar categoria existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, label, description, prefix } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "slug é obrigatório" },
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

// DELETE - Deletar categoria (e todas as fichas dela)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { error: "slug é obrigatório" },
        { status: 400 }
      );
    }

    // Primeiro, deletar todas as fichas desta categoria
    const { error: deleteFichasError } = await supabaseAdmin
      .from("fichas")
      .delete()
      .eq("tipo", slug);

    if (deleteFichasError) throw deleteFichasError;

    // Depois, deletar a categoria
    const { error: deleteCategoryError } = await supabaseAdmin
      .from("lore_categories")
      .delete()
      .eq("slug", slug);

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
