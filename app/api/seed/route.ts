
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { embedText } from "@/lib/rag";
import db from "@/data/AntiVerso_DB_v2.json";

export const dynamic = "force-dynamic";

// Rota administrativa simples para popular a tabela lore_chunks no Supabase
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const chunks: {
      source: string;
      source_type: string;
      title: string;
      content: string;
    }[] = [];

    // Entities
    if (Array.isArray((db as any).starter_data?.entities)) {
      for (const e of (db as any).starter_data.entities) {
        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "entity",
          title: e.nome ?? e.id,
          content: `${e.descricao ?? ""}\n\nManifestações: ${(e.manifestações || []).join(", ")}\nConceitos relacionados: ${(e.conceitos_relacionados || []).join(", ")}`,
        });
      }
    }

    // Concepts
    if (Array.isArray((db as any).starter_data?.concepts)) {
      for (const c of (db as any).starter_data.concepts) {
        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "concept",
          title: c.nome ?? c.id,
          content: `${c.descricao ?? ""}\n\nAplicações: ${(c.aplicacoes || []).join("; ")}`,
        });
      }
    }

    // Projects
    if (Array.isArray((db as any).starter_data?.projects)) {
      for (const p of (db as any).starter_data.projects) {
        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "project",
          title: p.titulo ?? p.id,
          content: `${p.descricao ?? ""}\n\nPeríodo diegético: ${p.periodo_diegético ?? ""}`,
        });
      }
    }

    // Locations
    if (Array.isArray((db as any).starter_data?.locations)) {
      for (const l of (db as any).starter_data.locations) {
        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "location",
          title: l.nome ?? l.id,
          content: `${l.descricao ?? ""}\n\nEventos relacionados: ${(l.eventos_relacionados || []).join("; ")}`,
        });
      }
    }

    let inserted = 0;

    for (const chunk of chunks) {
      const embedding = await embedText(chunk.content);
      if (!embedding) continue;

      const { error } = await supabaseAdmin
        .from("lore_chunks")
        .insert({
          source: chunk.source,
          source_type: chunk.source_type,
          title: chunk.title,
          content: chunk.content,
          embedding,
        });

      if (error) {
        console.error("Erro ao inserir chunk:", error);
        continue;
      }
      inserted++;
    }

    return NextResponse.json({
      ok: true,
      inserted,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erro inesperado ao executar seed." },
      { status: 500 }
    );
  }
}
