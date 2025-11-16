import { createClient } from "@supabase/supabase-js";
import { LoreMachineShell } from "./LoreMachineShell";

type World = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  ordem: number | null;
};

type Ficha = {
  id: string;
  world_id: string;
  titulo: string;
  slug: string;
  tipo: string;
  resumo: string | null;
  conteudo: string;
  tags: string[] | null;
};

type Code = {
  id: string;
  ficha_id: string;
  code: string;
  label: string | null;
  description: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server Component
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function LoreLabPage() {
  // Buscar mundos
  const { data: worlds } = await supabase
    .from("worlds")
    .select("*")
    .order("ordem", { ascending: true });

  // Buscar fichas
  const { data: fichas } = await supabase
    .from("fichas")
    .select("*");

  // Buscar códigos
  const { data: codes } = await supabase
    .from("codes")
    .select("*");

  return (
    <div className="h-screen bg-black text-neutral-100">
      <LoreMachineShell
        worlds={(worlds ?? []) as World[]}
        fichas={(fichas ?? []) as Ficha[]}
        codes={(codes ?? []) as Code[]}
      />
    </div>
  );
}
