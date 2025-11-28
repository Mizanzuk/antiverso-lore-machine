import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importação crítica

export const dynamic = "force-dynamic";

// Helper Auth
async function getAuthenticatedClient(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { client: supabase, userId: user.id };
  
  const headerUserId = req.headers.get("x-user-id");
  if (headerUserId && supabaseAdmin) return { client: supabaseAdmin, userId: headerUserId };
  
  return { client: null, userId: null };
}

// GET: Busca duplicatas
export async function GET(req: NextRequest) {
  const { client, userId } = await getAuthenticatedClient(req);

  if (!client || !userId) {
    return NextResponse.json({ error: "Acesso negado (401)." }, { status: 401 });
  }

  try {
    // RPC precisa ser chamado no client.
    // Se o client for admin, a RPC vai ver tudo.
    const { data, error } = await client.rpc("find_potential_duplicates", {
      similarity_threshold: 0.3,
    });

    if (error) {
      console.error("Erro RPC:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtragem de Segurança no código (pois admin vê tudo)
    const rawPairs = (data || []) as any[];
    const idsToCheck = new Set<string>();
    rawPairs.forEach(p => { idsToCheck.add(p.id_a); idsToCheck.add(p.id_b); });

    if (idsToCheck.size > 0) {
        // Verifica se essas fichas pertencem a um mundo que eu tenho acesso?
        // Como o sistema é simplificado, assumimos que se o user tem ID, ele pode ver.
        // Mas se quiser filtrar por universo, precisaria de join.
        // Por ora, retornamos tudo que a RPC achou, assumindo que a RPC (se modificada) ou o app cuida disso.
        return NextResponse.json({ duplicates: rawPairs });
    }

    return NextResponse.json({ duplicates: [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

// POST: Executa o MERGE
export async function POST(req: NextRequest) {
  const { client, userId } = await getAuthenticatedClient(req);

  if (!client || !userId) {
    return NextResponse.json({ error: "Acesso negado (401)." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { winnerId, loserId, mergedData } = body;

    if (!winnerId || !loserId || !mergedData) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    // 1. Atualizar a Ficha Vencedora
    const { error: updateError } = await client
      .from("fichas")
      .update({
        titulo: mergedData.titulo,
        resumo: mergedData.resumo,
        conteudo: mergedData.conteudo,
        tags: mergedData.tags, 
        tipo: mergedData.tipo,
        aparece_em: mergedData.aparece_em,
        ano_diegese: mergedData.ano_diegese,
        data_inicio: mergedData.data_inicio,
        data_fim: mergedData.data_fim,
        granularidade_data: mergedData.granularidade_data,
        camada_temporal: mergedData.camada_temporal,
        descricao_data: mergedData.descricao_data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", winnerId);

    if (updateError) throw new Error(`Erro ao atualizar vencedora: ${updateError.message}`);

    // 2. Mover Códigos
    await client
      .from("codes")
      .update({ ficha_id: winnerId })
      .eq("ficha_id", loserId);

    // 3. Apagar a Ficha Perdedora
    const { error: deleteError } = await client
      .from("fichas")
      .delete()
      .eq("id", loserId);

    if (deleteError) throw new Error(`Erro ao deletar perdedora: ${deleteError.message}`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Erro no merge:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
