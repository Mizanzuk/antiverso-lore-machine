// app/api/lore/timeline/route.ts
import { NextResponse } from "next/server";

// Timeline API – stub version
// ------------------------------------------------------
// Esta rota é apenas um *placeholder* para não quebrar o build.
// Ainda não lê nada do Supabase.
// Quando formos implementar a Timeline de verdade, vamos substituir
// este conteúdo por uma query real usando os campos temporais das
// fichas de tipo "evento".

export async function GET() {
  // Por enquanto, devolve uma lista vazia de eventos.
  return NextResponse.json({
    ok: true,
    events: [],
    message:
      "Timeline API ainda não foi implementada. Esta é apenas uma rota stub para manter o build funcionando.",
  });
}
