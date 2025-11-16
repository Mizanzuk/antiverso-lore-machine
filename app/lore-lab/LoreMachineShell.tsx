"use client";

import React, { useMemo, useState } from "react";

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
  // no banco está como text, então aqui aceitamos string OU array, pra não quebrar
  tags: string | string[] | null;
};

type Code = {
  id: string;
  ficha_id: string;
  code: string;
  label: string | null;
  description: string | null;
};

type LoreMachineShellProps = {
  worlds: World[];
  fichas: Ficha[];
  codes: Code[];
};

type PanelMode = "chat" | "ficha";

export function LoreMachineShell({
  worlds,
  fichas,
  codes,
}: LoreMachineShellProps) {
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(
    worlds[0]?.id ?? null
  );
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("chat");

  // Fichas do mundo selecionado
  const fichasDoMundo = useMemo(() => {
    if (!selectedWorldId) return [];
    return fichas.filter((f) => f.world_id === selectedWorldId);
  }, [fichas, selectedWorldId]);

  // Ficha selecionada
  const selectedFicha = useMemo(() => {
    if (!selectedFichaId) return null;
    return fichas.find((f) => f.id === selectedFichaId) ?? null;
  }, [fichas, selectedFichaId]);

  // Códigos da ficha selecionada
  const fichaCodes = useMemo(() => {
    if (!selectedFicha) return [];
    return codes.filter((c) => c.ficha_id === selectedFicha.id);
  }, [codes, selectedFicha]);

  // Converte tags em array de forma segura (string, array ou null)
  const fichaTags: string[] = useMemo(() => {
    if (!selectedFicha || selectedFicha.tags == null) return [];

    const raw = selectedFicha.tags;

    if (Array.isArray(raw)) {
      return raw.map((t) => String(t).trim()).filter(Boolean);
    }

    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return [];
  }, [selectedFicha]);

  function handleSelectWorld(worldId: string) {
    setSelectedWorldId(worldId);
    setSelectedFichaId(null);
    setPanelMode("chat");
  }

  function handleSelectFicha(fichaId: string) {
    setSelectedFichaId(fichaId);
    setPanelMode("ficha");
  }

  return (
    <div className="h-screen flex bg-black text-neutral-100">
      {/* SIDEBAR */}
      <aside className="w-72 border-r border-neutral-800 flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            AntiVerso Lore Machine
          </div>
          <div className="text-[11px] text-neutral-600 mt-1">
            /lore-lab – sandbox segura
          </div>
        </div>

        {/* lista de mundos */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Mundos
          </div>
          <nav className="px-2 pb-3 space-y-1">
            {worlds.map((world) => {
              const isActive = world.id === selectedWorldId;
              return (
                <button
                  key={world.id}
                  onClick={() => handleSelectWorld(world.id)}
                  className={[
                    "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-neutral-800/80 text-neutral-50"
                      : "text-neutral-300 hover:bg-neutral-900/70",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium truncate">
                    {world.nome}
                  </div>
                  {world.descricao && (
                    <div className="text-[11px] text-neutral-500 truncate">
                      {world.descricao}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* catálogo do mundo */}
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500 border-t border-neutral-900">
            Catálogo do mundo
          </div>
          <div className="px-2 pb-4 space-y-1 overflow-y-auto max-h-[45vh]">
            {fichasDoMundo.length === 0 && (
              <div className="text-[12px] text-neutral-600 px-2 py-2">
                Nenhuma ficha cadastrada ainda para este mundo.
              </div>
            )}

            {fichasDoMundo.map((ficha) => {
              const isActive = ficha.id === selectedFichaId;
              return (
                <button
                  key={ficha.id}
                  onClick={() => handleSelectFicha(ficha.id)}
                  className={[
                    "w-full text-left px-2.5 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-emerald-900/40 border border-emerald-500/40 text-neutral-50"
                      : "text-neutral-300 hover:bg-neutral-900/70",
                  ].join(" ")}
                >
                  <div className="text-[13px] font-medium truncate">
                    {ficha.titulo}
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {ficha.tipo} · {ficha.slug}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* PAINEL PRINCIPAL */}
      <main className="flex-1 flex flex-col">
        {/* barra do painel */}
        <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
            Painel
          </div>
          <div className="flex gap-2 text-[11px]">
            <button
              onClick={() => setPanelMode("chat")}
              className={[
                "px-3 py-1 rounded-full border text-[11px] transition-colors",
                panelMode === "chat"
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500",
              ].join(" ")}
            >
              Chat
            </button>
            <button
              onClick={() => setPanelMode("ficha")}
              className={[
                "px-3 py-1 rounded-full border text-[11px] transition-colors",
                panelMode === "ficha"
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500",
              ].join(" ")}
            >
              Ficha
            </button>
          </div>
        <
