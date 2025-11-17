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
        </header>

        
        {/* conteúdo do painel */}
        <section className="flex-1 overflow-y-auto">
          {panelMode === "chat" && (
            <div className="h-full flex flex-col px-8 py-6 gap-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-medium text-neutral-50">
                    Janela de chat
                  </h2>
                  <p className="text-xs text-neutral-400 max-w-xl">
                    Aqui vão aparecer as conversas que você tiver com a AntiVerso Lore Machine.
                    Nesta versão de laboratório estamos apenas desenhando o fluxo geral.
                  </p>
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                  Modo laboratório
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-6 flex-1">
                {/* coluna esquerda: histórico + busca (conceito) */}
                <div className="flex flex-col border border-neutral-800/80 rounded-2xl bg-neutral-950/70 p-4 gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-100">
                        Histórico de conversas
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Lista de sessões e buscas salvas da Lore Machine.
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-400/80">
                      Em breve: busca
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      className="w-full rounded-xl bg-neutral-900/80 border border-dashed border-neutral-800/80 px-3 py-2 text-xs text-neutral-400 placeholder:text-neutral-600 focus:outline-none focus:ring-0"
                      placeholder="Busca por palavras, fichas ou mundos (conceito de histórico)"
                    />
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">
                      ⌘K
                    </div>
                  </div>

                  <div className="flex-1 rounded-xl border border-dashed border-neutral-800/80 px-3 py-2 text-[11px] text-neutral-500 leading-relaxed">
                    <p>
                      A ideia aqui é ter um painel lateral com todas as conversas já feitas,
                      permitindo filtrar por mundo, ficha citada ou palavras-chave.
                    </p>
                    <p className="mt-2">
                      Quando o sistema de chat estiver ligado, cada nova sessão será salva
                      como um "registro" consultável — e esta caixa vai virar o lugar onde
                      você navega por esse histórico.
                    </p>
                  </div>
                </div>

                {/* coluna direita: mock do chat em si */}
                <div className="flex flex-col border border-neutral-800/80 rounded-2xl bg-neutral-950/70 p-4 gap-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-xs font-semibold text-neutral-100">
                      Conversa ativa
                    </h3>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                      Mock de interface
                    </span>
                  </div>
                  <div className="flex-1 rounded-xl border border-dashed border-neutral-800/80 bg-neutral-950/60 px-4 py-3 text-sm text-neutral-400 leading-relaxed">
                    <p>
                      Aqui entra exatamente o componente de chat que você já tem hoje
                      na aplicação principal da Lore Machine.
                    </p>
                    <p className="mt-2">
                      A diferença é que, no futuro, toda mensagem enviada ou recebida vai
                      gerar registros que alimentam o painel de histórico ao lado, permitindo
                      a tal "busca de conversas" — por exemplo:{" "}
                      <span className="text-neutral-200">
                        &quot;me mostre todas as vezes em que falamos sobre a Torre&quot;
                      </span>
                      .
                    </p>
                    <p className="mt-2 text-[11px] text-neutral-500">
                      Por enquanto, mantemos este espaço apenas como referência visual para
                      o desenho da experiência.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {panelMode === "ficha" && !selectedFicha && (
            <div className="h-full flex items-center justify-center text-center text-sm text-neutral-500 px-8">
              Selecione uma ficha no catálogo à esquerda para ver os detalhes aqui.
            </div>
          )}

          {panelMode === "ficha" && selectedFicha && (
            <div className="h-full flex flex-col px-8 py-6 gap-4">
              {/* header da ficha */}
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    {worlds.find((w) => w.id === selectedFicha.world_id)?.nome ??
                      "Mundo não identificado"}
                    {" · "}
                    {selectedFicha.tipo}
                  </div>
                  <h1 className="text-xl font-semibold text-neutral-50">
                    {selectedFicha.titulo}
                  </h1>
                  {selectedFicha.resumo && (
                    <p className="text-sm text-neutral-300 max-w-2xl">
                      {selectedFicha.resumo}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3">
                  {fichaCodes.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {fichaCodes.map((code) => (
                        <div
                          key={code.id}
                          className="px-2.5 py-1 rounded-full border border-emerald-500/60 bg-emerald-900/40 text-[11px] font-mono text-emerald-100"
                        >
                          {code.code}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setPanelMode("chat")}
                    className="mt-1 px-3 py-1 rounded-full border border-neutral-700 text-[11px] text-neutral-300 hover:border-neutral-500 transition-colors"
                  >
                    Voltar ao chat
                  </button>
                </div>
              </div>

              {/* corpo da ficha: texto + metadados */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 flex-1">
                {/* texto principal */}
                <div className="border border-neutral-800 rounded-2xl bg-neutral-950/70 p-4 overflow-y-auto">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mb-3">
                    Texto base da ficha
                  </div>
                  <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed max-w-3xl">
                    {selectedFicha.conteudo}
                  </div>
                </div>

                {/* metadados */}
                <div className="flex flex-col gap-4 text-xs">
                  <div className="border border-neutral-800 rounded-2xl bg-neutral-950/70 p-4 space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                      Metadados
                    </div>
                    <dl className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Mundo</dt>
                        <dd className="text-neutral-200 text-right">
                          {worlds.find((w) => w.id === selectedFicha.world_id)?.nome ??
                            "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Tipo</dt>
                        <dd className="text-neutral-200 text-right">
                          {selectedFicha.tipo || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Slug</dt>
                        <dd className="font-mono text-[11px] text-neutral-300 text-right">
                          {selectedFicha.slug}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">ID</dt>
                        <dd className="font-mono text-[11px] text-neutral-500 text-right">
                          {selectedFicha.id}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {fichaTags.length > 0 && (
                    <div className="border border-neutral-800 rounded-2xl bg-neutral-950/70 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mb-2">
                        Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fichaTags.map((tag, idx) => (
                          <span
                            key={`${tag}-${idx}`}
                            className="px-2 py-[3px] rounded-full bg-neutral-900 text-[11px] text-neutral-300 border border-neutral-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {fichaCodes.length > 0 && (
                    <div className="border border-neutral-800 rounded-2xl bg-neutral-950/70 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mb-2">
                        Códigos no catálogo
                      </div>
                      <ul className="space-y-1.5">
                        {fichaCodes.map((code) => (
                          <li
                            key={`meta-${code.id}`}
                            className="flex items-start justify-between gap-2"
                          >
                            <span className="font-mono text-[11px] text-emerald-300">
                              {code.code}
                            </span>
                            {code.label && (
                              <span className="text-[11px] text-neutral-400 text-right">
                                {code.label}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
