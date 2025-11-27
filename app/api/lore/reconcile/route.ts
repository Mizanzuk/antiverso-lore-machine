import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET: Busca duplicatas
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  }

  try {
    // Chamada RPC
    // NOTA: A função RPC 'find_potential_duplicates' no banco PRECISA filtrar por user_id internamente
    // OU nós filtramos aqui. Assumindo que a RPC retorna tudo, vamos filtrar no código por segurança.
    const { data, error } = await supabase.rpc("find_potential_duplicates", {
      similarity_threshold: 0.3,
    });

    if (error) {
      console.error("Erro RPC:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtragem de Segurança no código:
    // Verifica se os IDs retornados pertencem ao usuário atual
    const rawPairs = (data || []) as any[];
    const idsToCheck = new Set<string>();
    rawPairs.forEach(p => { idsToCheck.add(p.id_a); idsToCheck.add(p.id_b); });

    if (idsToCheck.size > 0) {
        const { data: myFichas } = await supabase
            .from("fichas")
            .select("id") // RLS aplica filtro por user_id aqui
            .in("id", Array.from(idsToCheck));
        
        const myIds = new Set(myFichas?.map((f: any) => f.id));
        
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

// POST: Executa o MERGE
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { winnerId, loserId, mergedData } = body;

    if (!winnerId || !loserId || !mergedData) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    // A verificação de propriedade é feita implicitamente pelo RLS nas queries abaixo.
    // Se o usuário não for dono, o UPDATE/DELETE vai retornar '0 rows affected' ou erro.

    // 1. Atualizar a Ficha Vencedora
    const { error: updateError } = await supabase
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
    await supabase
      .from("codes")
      .update({ ficha_id: winnerId })
      .eq("ficha_id", loserId);

    // 3. Apagar a Ficha Perdedora
    const { error: deleteError } = await supabase
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
