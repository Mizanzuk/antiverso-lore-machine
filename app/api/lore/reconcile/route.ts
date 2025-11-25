import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET: Busca lista de possíveis duplicatas
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }

  try {
    // Chama a função RPC que criamos no SQL
    // O valor 0.3 significa 30% de similaridade mínima para considerar duplicata
    const { data, error } = await supabaseAdmin.rpc("find_potential_duplicates", {
      similarity_threshold: 0.3,
    });

    if (error) {
      console.error("Erro ao buscar duplicatas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ duplicates: data || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

// POST: Executa o MERGE (Fusão)
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { winnerId, loserId, mergedData } = body;

    if (!winnerId || !loserId || !mergedData) {
      return NextResponse.json({ error: "Dados incompletos para merge." }, { status: 400 });
    }

    // 1. Atualizar a Ficha Vencedora com os dados combinados escolhidos na tela
    const { error: updateError } = await supabaseAdmin
      .from("fichas")
      .update({
        titulo: mergedData.titulo,
        resumo: mergedData.resumo,
        conteudo: mergedData.conteudo,
        tags: mergedData.tags, 
        tipo: mergedData.tipo,
        aparece_em: mergedData.aparece_em,
        // campos temporais
        ano_diegese: mergedData.ano_diegese,
        data_inicio: mergedData.data_inicio,
        data_fim: mergedData.data_fim,
        granularidade_data: mergedData.granularidade_data,
        camada_temporal: mergedData.camada_temporal,
        descricao_data: mergedData.descricao_data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", winnerId);

    if (updateError) {
      throw new Error(`Erro ao atualizar vencedora: ${updateError.message}`);
    }

    // 2. Mover Códigos da Perdedora para a Vencedora
    // (Isso garante que se a ficha excluída tinha o código "AV1-PS2", ele não se perde)
    const { error: codesError } = await supabaseAdmin
      .from("codes")
      .update({ ficha_id: winnerId })
      .eq("ficha_id", loserId);

    if (codesError) {
      console.warn("Aviso: Erro ao mover códigos (talvez não existissem):", codesError);
    }

    // 3. Apagar a Ficha Perdedora
    const { error: deleteError } = await supabaseAdmin
      .from("fichas")
      .delete()
      .eq("id", loserId);

    if (deleteError) {
      throw new Error(`Erro ao deletar perdedora: ${deleteError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Erro no merge:", err);
    return NextResponse.json({ error: err.message || "Erro desconhecido." }, { status: 500 });
  }
}
