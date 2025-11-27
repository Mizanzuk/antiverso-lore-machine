import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET: Busca lista de possíveis duplicatas
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Usuário não identificado." }, { status: 401 });
  }

  try {
    // ATENÇÃO: A função RPC 'find_potential_duplicates' no banco deve suportar filtro por usuário.
    // Se ela não suportar, ela pode retornar falso-positivos globais.
    // Por segurança, vamos filtrar os resultados aqui ou confiar que o SQL foi atualizado.
    
    // Chamada RPC (assumindo que foi atualizada ou que vamos filtrar depois)
    const { data, error } = await supabaseAdmin.rpc("find_potential_duplicates", {
      similarity_threshold: 0.3,
    });

    if (error) {
      console.error("Erro ao buscar duplicatas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // FILTRAGEM DE SEGURANÇA NO CÓDIGO (Caso o SQL traga tudo)
    // Verifica se os IDs retornados pertencem ao usuário atual
    const rawPairs = (data || []) as any[];
    const idsToCheck = new Set<string>();
    rawPairs.forEach(p => { idsToCheck.add(p.id_a); idsToCheck.add(p.id_b); });

    if (idsToCheck.size > 0) {
        const { data: myFichas } = await supabaseAdmin
            .from("fichas")
            .select("id")
            .eq("user_id", userId) // Só minhas fichas
            .in("id", Array.from(idsToCheck));
        
        const myIds = new Set(myFichas?.map(f => f.id));
        
        // Só retorna pares onde AMBAS as fichas são minhas
        const safePairs = rawPairs.filter(p => myIds.has(p.id_a) && myIds.has(p.id_b));
        return NextResponse.json({ duplicates: safePairs });
    }

    return NextResponse.json({ duplicates: [] });
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

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Usuário não identificado." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { winnerId, loserId, mergedData } = body;

    if (!winnerId || !loserId || !mergedData) {
      return NextResponse.json({ error: "Dados incompletos para merge." }, { status: 400 });
    }

    // VERIFICAÇÃO DE PROPRIEDADE (CRÍTICO)
    const { data: checkOwner } = await supabaseAdmin
        .from("fichas")
        .select("id")
        .in("id", [winnerId, loserId])
        .eq("user_id", userId);
    
    if (!checkOwner || checkOwner.length !== 2) {
        return NextResponse.json({ error: "Você não tem permissão para fundir estas fichas." }, { status: 403 });
    }

    // 1. Atualizar a Ficha Vencedora
    const { error: updateError } = await supabaseAdmin
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
      .eq("id", winnerId); // Já checado acima

    if (updateError) {
      throw new Error(`Erro ao atualizar vencedora: ${updateError.message}`);
    }

    // 2. Mover Códigos
    const { error: codesError } = await supabaseAdmin
      .from("codes")
      .update({ ficha_id: winnerId })
      .eq("ficha_id", loserId);

    if (codesError) console.warn("Aviso: Erro ao mover códigos:", codesError);

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
