import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { embedText } from "@/lib/rag";
import db from "@/data/AntiVerso_DB_v2.json";
import bibleChunks from "@/data/BibleChunks_v1.json";

export const dynamic = "force-dynamic";

/**
 * GET /api/seed
 * Apenas mostra instruções de uso.
 */
export async function GET() {
  return NextResponse.json({
    message:
      "Esta rota popula o banco de dados com os dados do AntiVerso. Para executar, faça uma requisição POST para este endpoint.",
    usage: {
      method: "POST",
      endpoint: "/api/seed",
      example:
        "curl -X POST https://antiverso-lore-machine.vercel.app/api/seed",
    },
  });
}

/**
 * POST /api/seed
 * Executa a seed: lê o AntiVerso_DB_v2.json + BibleChunks_v1.json
 * e popula a tabela lore_chunks no Supabase.
 */
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

    const anyDb: any = db as any;

    // --------- ENTITIES ---------
    if (Array.isArray(anyDb.starter_data?.entities)) {
      for (const e of anyDb.starter_data.entities) {
        const descricao = e.descricao ?? "";
        const manif = Array.isArray(e.manifestações)
          ? e.manifestações.join(", ")
          : "";
        const conceitos = Array.isArray(e.conceitos_relacionados)
          ? e.conceitos_relacionados.join(", ")
          : "";
        const sinais = Array.isArray(e.sinais_associados)
          ? e.sinais_associados.join(", ")
          : "";

        const contentParts = [
          descricao,
          manif && `Manifestações conhecidas: ${manif}.`,
          conceitos && `Conceitos relacionados: ${conceitos}.`,
          sinais && `Sinais associados: ${sinais}.`,
        ].filter(Boolean);

        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "entity",
          title: e.nome ?? e.id,
          content: contentParts.join("\n\n"),
        });
      }
    }

    // --------- CONCEPTS ---------
    if (Array.isArray(anyDb.starter_data?.concepts)) {
      for (const c of anyDb.starter_data.concepts) {
        const descricao = c.descricao ?? "";
        const aplicacoes = Array.isArray(c.aplicacoes)
          ? c.aplicacoes.join("; ")
          : "";

        const contentParts = [
          descricao,
          aplicacoes &&
            `Possíveis aplicações ou desdobramentos: ${aplicacoes}.`,
        ].filter(Boolean);

        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "concept",
          title: c.nome ?? c.id,
          content: contentParts.join("\n\n"),
        });
      }
    }

    // --------- PROJECTS ---------
    if (Array.isArray(anyDb.starter_data?.projects)) {
      for (const p of anyDb.starter_data.projects) {
        const descricao = p.descricao ?? "";
        const periodo = p.periodo_diegético ?? p.periodo ?? "";
        const ligacoes = Array.isArray(p.ligacoes)
          ? p.ligacoes.join(", ")
          : "";

        const contentParts = [
          descricao,
          periodo && `Período diegético: ${periodo}.`,
          ligacoes &&
            `Ligações com outros elementos do AntiVerso: ${ligacoes}.`,
        ].filter(Boolean);

        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "project",
          title: p.titulo ?? p.nome ?? p.id,
          content: contentParts.join("\n\n"),
        });
      }
    }

    // --------- LOCATIONS ---------
    if (Array.isArray(anyDb.starter_data?.locations)) {
      for (const l of anyDb.starter_data.locations) {
        const descricao = l.descricao ?? "";
        const endereco = l.endereco ?? "";
        const eventos = Array.isArray(l.eventos_relacionados)
          ? l.eventos_relacionados.join("; ")
          : "";

        const contentParts = [
          descricao,
          endereco && `Endereço / localização aproximada: ${endereco}.`,
          eventos && `Eventos relacionados: ${eventos}.`,
        ].filter(Boolean);

        chunks.push({
          source: "AntiVerso_DB_v2.json",
          source_type: "location",
          title: l.nome ?? l.id,
          content: contentParts.join("\n\n"),
        });
      }
    }

    // --------- BÍBLIA DO ANTIVERSO (CHUNKS TEXTUAIS) ---------
    if (Array.isArray(bibleChunks)) {
      for (const b of bibleChunks as any[]) {
        const section = b.section || b.id || "Trecho da Bíblia do AntiVerso";
        const content = (b.content || "").trim();
        if (!content) continue;

        chunks.push({
          source: "BibleChunks_v1.json",
          source_type: "bible",
          title: section,
          content,
        });
      }
    }

    // --------- INSERÇÃO NO SUPABASE ---------
    let inserted = 0;

    for (const chunk of chunks) {
      if (!chunk.content || !chunk.content.trim()) continue;

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
