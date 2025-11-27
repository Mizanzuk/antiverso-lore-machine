import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import db from "@/data/AntiVerso_DB_v2.json";
import bibleChunks from "@/data/BibleChunks_v1.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    message: "Endpoint de seed (Modo Texto - Sem Embeddings).",
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase não configurado." },
        { status: 500 }
      );
    }

    const chunks: {
      source: string;
      source_type: string;
      title: string;
      content: string;
    }[] = [];

    const anyDb: any = db as any;

    // Extração simplificada apenas para manter compatibilidade
    if (Array.isArray(anyDb.starter_data?.entities)) {
      for (const e of anyDb.starter_data.entities) {
        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "entity",
          title: e.nome ?? e.id,
          content: e.descricao || "",
        });
      }
    }

    if (Array.isArray(bibleChunks)) {
      for (const b of bibleChunks as any[]) {
        const section = b.section || b.id || "Trecho";
        const content = (b.content || "").trim();
        if (content) {
           chunks.push({
            source: "BibleChunks_v1.json",
            source_type: "bible",
            title: section,
            content,
          });
        }
      }
    }

    // Apenas inserimos como texto puro, sem vetor (pois removemos pgvector do rag.ts)
    for (const chunk of chunks) {
      await supabaseAdmin.from("lore_chunks").insert({
        source: chunk.source,
        source_type: chunk.source_type,
        title: chunk.title,
        content: chunk.content
      });
    }

    return NextResponse.json({ ok: true, message: "Seed concluído (Texto Puro)" });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Erro inesperado ao executar seed: " + err.message },
      { status: 500 }
    );
  }
}
