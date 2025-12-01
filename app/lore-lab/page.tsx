"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { LoreMachineShell } from "./LoreMachineShell";

type Universe = {
  id: string;
  nome: string;
  descricao: string | null;
};

type World = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string | null;
  ordem: number | null;
  universe_id: string;
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

export default function LoreLabPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>("");
  const [worlds, setWorlds] = useState<World[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar universos ao montar
  useEffect(() => {
    loadUniverses();
  }, []);

  // Carregar dados quando universo mudar
  useEffect(() => {
    if (selectedUniverseId) {
      loadData();
    }
  }, [selectedUniverseId]);

  async function loadUniverses() {
    try {
      const { data, error } = await supabaseBrowser
        .from("universes")
        .select("id, nome, descricao")
        .order("nome");
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setUniverses(data);
        setSelectedUniverseId(data[0].id);
      } else {
        setError("Nenhum universo encontrado. Crie um universo primeiro.");
      }
    } catch (err: any) {
      setError("Erro ao carregar universos: " + err.message);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // Buscar mundos do universo
      const { data: worldsData, error: worldsError } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .eq("universe_id", selectedUniverseId)
        .order("ordem", { ascending: true });

      if (worldsError) throw worldsError;

      const worldIds = (worldsData ?? []).map(w => w.id);

      // Buscar fichas dos mundos
      const { data: fichasData, error: fichasError } = await supabaseBrowser
        .from("fichas")
        .select("*")
        .in("world_id", worldIds);

      if (fichasError) throw fichasError;

      const fichaIds = (fichasData ?? []).map(f => f.id);

      // Buscar códigos das fichas
      const { data: codesData, error: codesError } = await supabaseBrowser
        .from("codes")
        .select("*")
        .in("ficha_id", fichaIds);

      if (codesError) throw codesError;

      setWorlds((worldsData ?? []) as World[]);
      setFichas((fichasData ?? []) as Ficha[]);
      setCodes((codesData ?? []) as Code[]);
    } catch (err: any) {
      setError("Erro ao carregar dados: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="h-screen bg-black text-neutral-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.href = "/"}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition"
          >
            Voltar para página principal
          </button>
        </div>
      </div>
    );
  }

  if (loading || !selectedUniverseId) {
    return (
      <div className="h-screen bg-black text-neutral-100 flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col">
      {/* Header com seletor de universo */}
      <div className="border-b border-white/10 p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Lore Lab</h1>
        <div className="flex items-center gap-4">
          <select
            value={selectedUniverseId}
            onChange={(e) => setSelectedUniverseId(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-white/15 rounded-md text-sm text-gray-300 focus:outline-none focus:border-white/30 transition"
          >
            {universes.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
          <button
            onClick={() => window.location.href = "/"}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition"
          >
            Voltar
          </button>
        </div>
      </div>

      {/* Shell */}
      <div className="flex-1 overflow-hidden">
        <LoreMachineShell
          worlds={worlds}
          fichas={fichas}
          codes={codes}
        />
      </div>
    </div>
  );
}
