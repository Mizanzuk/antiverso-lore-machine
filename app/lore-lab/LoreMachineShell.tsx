"use client";

import { useMemo, useState } from "react";

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

type LoreMachineShellProps = {
  worlds: World[];
  fichas: Ficha[];
  codes: Code[];
};

type ViewMode = "chat" | "ficha";

export function LoreMachineShell({
  worlds,
  fichas,
  codes,
}: LoreMachineShellProps) {
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(
    worlds[0]?.id ?? null
  );
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);

  const fichasDoMundo = useMemo(
    () => fichas.filter((f) => f.world_id === selectedWorldId),
    [fichas, selectedWorldId]
  );

  const fichaSelecionada = useMemo(
    () => fichas.find((f) => f.id === selectedFichaId) ?? null,
    [fichas, selectedFichaId]
  );

  const codesDaFicha = useMemo(
    () =>
      fichaSelecionada
        ? codes.filter((c) => c.ficha_id === fichaSelecionada.id)
        : [],
    [codes, fichaSelecionada]
  );

  return (
    <div className="flex h-full">
      {/* SIDEBAR */}
      <aside className="w-72 border-r border-neutral-800 bg-black/80 flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="text-xs font-mono uppercase tracking-widest text-neutral-500">
            AntiVerso Lore Machine
          </div>
          <div className="text-[10px] text-neutral-600">
            /lore-lab – sandbox segura
          </div>
        </div>

        {/* Mundos */}
        <div className="px-3 py-3 border-b border-neutral-800">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
            Mundos
          </div>
          <div className="flex flex-col gap-1">
            {worlds.map((world) => (
              <button
                key={world.id}
                onClick={() => {
                  setSelectedWorldId(world.id);
                  setViewMode("chat");
                  setSelectedFichaId(null);
                }}
                className={`text-left text-sm px-2 py-1 rounded-md border border-transparent hover:border-neutral-700 hover:bg-neutral-900 ${
                  selectedWorldId === world.id
                    ? "bg-neutral-900 border-neutral-700"
                    : ""
                }`}
              >
                <div className="text-neutral-100">{world.nome}</div>
                {world.descricao && (
                  <div className="text-[11px] text-neutral-500 truncate">
                    {world.descricao}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Catálogo rápido de fichas */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
            Catálogo do Mundo
          </div>
          {fichasDoMundo.length === 0 && (
            <div className="text-xs text-neutral-600">
              Nenhuma ficha cadastrada ainda para este mundo.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {fichasDoMundo.map((ficha) => (
              <button
                key={ficha.id}
                onClick={() => {
                  setSelectedFichaId(ficha.id);
                  setViewMode("ficha");
                }}
                className="text-left text-sm px-2 py-1 rounded-md hover:bg-neutral-900 border border-transparent hover:border-neutral-700"
              >
                <div className="text-neutral-100">{ficha.titulo}</div>
                <div className="text-[11px] text-neutral-500">
                  {ficha.tipo} · {ficha.slug}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* PAINEL PRINCIPAL */}
      <main className="flex-1 flex flex-col bg-gradient-to-br from-black via-neutral-950 to-black">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
              Painel
            </span>
            <span className="text-sm text-neutral-300">
              {viewMode === "chat" ? "Chat da Lore Machine" : "Ficha detalhada"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              className={`px-2 py-1 rounded border ${
                viewMode === "chat"
                  ? "border-emerald-500 text-emerald-300"
                  : "border-neutral-700 text-neutral-400"
              }`}
              onClick={() => setViewMode("chat")}
            >
              Chat
            </button>
            <button
              className={`px-2 py-1 rounded border ${
                viewMode === "ficha"
                  ? "border-emerald-500 text-emerald-300"
                  : "border-neutral-700 text-neutral-400"
              }`}
              onClick={() => {
                if (selectedFichaId) setViewMode("ficha");
              }}
            >
              Ficha
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <section className="flex-1 overflow-y-auto">
          {viewMode === "chat" && (
            <div className="h-full flex items-center justify-center text-neutral-600 text-sm">
              <div className="text-center max-w-md px-4">
                <p>
                  Aqui entraria o <span className="font-mono">chat</span> da
                  AntiVerso Lore Machine, usando o mesmo componente que você já
                  tem hoje.
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Nesta rota /lore-lab estamos só testando o fluxo de
                  <br />
                  <strong>Sidebar → Fichas → Tela de Ficha.</strong>
                </p>
              </div>
            </div>
          )}

          {viewMode === "ficha" && (
            <FichaView
              ficha={fichaSelecionada}
              codes={codesDaFicha}
              onBackToChat={() => setViewMode("chat")}
            />
          )}
        </section>
      </main>
    </div>
  );
}

type FichaViewProps = {
  ficha: Ficha | null;
  codes: Code[];
  onBackToChat: () => void;
};

function FichaView({ ficha, codes, onBackToChat }: FichaViewProps) {
  if (!ficha) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        Nenhuma ficha selecionada.
        <button
          className="ml-3 underline text-neutral-300"
          onClick={onBackToChat}
        >
          Voltar ao chat
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Barra superior da ficha */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-black/60">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="uppercase tracking-wide">{ficha.tipo}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-700">
              {ficha.slug}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-neutral-50">
            {ficha.titulo}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {codes.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-300">
              <span className="uppercase tracking-wide text-neutral-500">
                Códigos:
              </span>
              {codes.map((c) => (
                <span
                  key={c.id}
                  className="px-2 py-0.5 rounded-full border border-emerald-500"
                >
                  {c.code}
                </span>
              ))}
            </div>
          )}

          <button
            className="text-xs px-3 py-1 rounded border border-neutral-700 hover:bg-neutral-900"
            onClick={onBackToChat}
          >
            Voltar ao chat
          </button>
        </div>
      </div>

      {/* Corpo da ficha */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {ficha.resumo && (
          <p className="text-sm text-neutral-300 italic">{ficha.resumo}</p>
        )}

        {ficha.tags && ficha.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
            {ficha.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-black/60 border border-neutral-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <article className="prose prose-invert max-w-none text-sm">
          <div style={{ whiteSpace: "pre-wrap" }}>{ficha.conteudo}</div>
        </article>
      </div>
    </div>
  );
}
