"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ViewState = "loading" | "loggedOut" | "loggedIn";

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo?: string | null;
  has_episodes?: boolean | null;
};

type TimelineEvent = {
  id: string;
  world_id: string | null;
  titulo: string | null;
  resumo: string | null;
  tipo: string | null;
  episodio: string | null;
  aparece_em: string | null;
  ano_diegese: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  descricao_data: string | null;
  camada_temporal: string | null;
  ordem_cronologica: number | null;
  created_at: string | null;
};

type TimelineResponse = {
  ok: boolean;
  count: number;
  events: TimelineEvent[];
  error?: string;
  details?: string;
};

export default function TimelinePage() {
  const [view, setView] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [camadaFilter, setCamadaFilter] = useState<string>("");
  const [episodeFilter, setEpisodeFilter] = useState<string>("");

  // ----------------------------
  // Sessão / acesso
  // ----------------------------
  useEffect(() => {
    const checkSession = async () => {
      setView("loading");
      try {
        const {
          data: { session },
          error,
        } = await supabaseBrowser.auth.getSession();

        if (error) {
          console.error(error);
          setView("loggedOut");
          return;
        }

        if (session) {
          setView("loggedIn");
          await fetchAllData();
        } else {
          setView("loggedOut");
        }
      } catch (err) {
        console.error(err);
        setView("loggedOut");
      }
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------
  // Fetch helpers
  // ----------------------------

  async function fetchAllData() {
    setError(null);
    setIsLoading(true);
    try {
      await fetchWorlds();
      await fetchEvents(selectedWorldId, camadaFilter);
    } catch (err: any) {
      console.error(err);
      setError("Erro inesperado ao carregar dados da timeline.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWorlds() {
    const { data, error } = await supabaseBrowser
      .from("worlds")
      .select("*")
      .order("ordem", { ascending: true });

    if (error) {
      console.error(error);
      setError("Erro ao carregar lista de Mundos.");
      return;
    }

    setWorlds(data || []);

    // Se não houver mundo selecionado ainda, escolhe o primeiro
    if (!selectedWorldId && data && data.length > 0) {
      setSelectedWorldId(data[0].id as string);
    }
  }

  async function fetchEvents(
    worldId: string | null,
    camada: string | null | undefined,
  ) {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (worldId) params.set("worldId", worldId);
      if (camada && camada.trim().length > 0) {
        params.set("camada_temporal", camada.trim());
      }

      const url =
        "/api/lore/timeline" + (params.toString() ? `?${params}` : "");

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Erro na Timeline API:", res.status, text);
        setError("Erro ao buscar eventos da Timeline.");
        setEvents([]);
        return;
      }

      const json = (await res.json()) as TimelineResponse;

      if (!json.ok) {
        console.error("Erro lógico na Timeline API:", json);
        setError(json.error || "Erro ao montar timeline.");
        setEvents([]);
        return;
      }

      setEvents(json.events || []);
    } catch (err: any) {
      console.error(err);
      setError("Erro inesperado ao carregar eventos da Timeline.");
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Recarrega eventos quando mundo ou camada mudarem
  useEffect(() => {
    if (view !== "loggedIn") return;
    fetchEvents(selectedWorldId, camadaFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorldId, camadaFilter, view]);

  // ----------------------------
  // Derivados de filtro
  // ----------------------------

  const availableCamadas = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.camada_temporal && ev.camada_temporal.trim().length > 0) {
        set.add(ev.camada_temporal.trim());
      }
    });
    return Array.from(set).sort();
  }, [events]);

  const availableEpisodes = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.episodio && ev.episodio.trim().length > 0) {
        set.add(ev.episodio.trim());
      }
    });
    return Array.from(set).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (episodeFilter && ev.episodio !== episodeFilter) return false;
      return true;
    });
  }, [events, episodeFilter]);

  // ----------------------------
  // Render helpers
  // ----------------------------

  function formatDateRange(ev: TimelineEvent): string {
    const { data_inicio, data_fim, descricao_data, ano_diegese } = ev;

    if (descricao_data && descricao_data.trim().length > 0) {
      return descricao_data.trim();
    }

    if (data_inicio && data_fim && data_inicio !== data_fim) {
      return `${data_inicio} → ${data_fim}`;
    }

    if (data_inicio) {
      return data_inicio;
    }

    if (ano_diegese) {
      return String(ano_diegese);
    }

    return "Data desconhecida";
  }

  function formatCamada(ev: TimelineEvent): string {
    if (!ev.camada_temporal) return "—";
    return ev.camada_temporal;
  }

  // ----------------------------
  // UI
  // ----------------------------

  if (view === "loading") {
    return (
      <div className="h-screen bg-black text-neutral-100 flex items-center justify-center text-xs">
        Verificando sessão…
      </div>
    );
  }

  if (view === "loggedOut") {
    return (
      <div className="h-screen bg-black text-neutral-100 flex flex-col items-center justify-center">
        <div className="border border-neutral-800 rounded-lg p-6 max-w-md text-center">
          <h1 className="text-sm font-semibold mb-3">
            Timeline do AntiVerso – acesso restrito
          </h1>
          <p className="text-[11px] text-neutral-400 mb-4">
            Para visualizar a Linha do Tempo, faça login primeiro no painel
            principal do Lore-Admin.
          </p>
          <a
            href="/lore-admin"
            className="inline-flex items-center justify-center px-4 py-1.5 text-[11px] rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
          >
            Ir para Lore-Admin
          </a>
        </div>
      </div>
    );
  }

  // loggedIn
  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-[11px] text-neutral-300 hover:text-white"
          >
            ← Voltar à Home
          </a>
          <a
            href="/lore-admin"
            className="text-[11px] text-neutral-400 hover:text-white"
          >
            Ir para Lore-Admin
          </a>
          <a
            href="/lore-upload"
            className="text-[11px] text-neutral-400 hover:text-white"
          >
            Ir para Upload
          </a>
        </div>

        <div className="text-[11px] text-neutral-500">
          Timeline do AntiVerso
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-[11px] text-red-400 bg-red-950/40 border-b border-red-900">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="px-4 py-1 text-[11px] text-neutral-500 border-b border-neutral-900">
          Carregando eventos da Timeline…
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        {/* Mundos */}
        <section className="w-72 border-right border-neutral-800 p-4 flex flex-col min-h-0 border-r">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Mundos
            </h2>
          </div>

          <div className="text-[11px] text-neutral-500 mb-2">
            Escolha um Mundo para filtrar os eventos da Linha do Tempo.
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {worlds.length === 0 && (
              <div className="text-[11px] text-neutral-600">
                Nenhum Mundo cadastrado ainda.
              </div>
            )}

            {worlds.map((world) => (
              <div
                key={world.id}
                className={`group border rounded-md px-2 py-1 text-[11px] cursor-pointer mb-1 ${
                  selectedWorldId === world.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-neutral-800 hover:border-neutral-500"
                }`}
                onClick={() => {
                  setSelectedWorldId(world.id);
                  setEpisodeFilter("");
                }}
              >
                <div className="font-medium text-neutral-100">
                  {world.nome}
                </div>
                {world.descricao && (
                  <div className="text-[10px] text-neutral-500 line-clamp-2">
                    {world.descricao}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section className="flex-1 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Linha do Tempo
              </h2>
              <div className="text-[11px] text-neutral-500 mt-1">
                {selectedWorldId
                  ? "Eventos ordenados cronologicamente para o Mundo selecionado."
                  : "Eventos de todos os Mundos, ordenados cronologicamente."}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              {/* Filtro por camada */}
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500">Camada temporal</span>
                <select
                  className="bg-black/60 border border-neutral-800 rounded px-2 py-1 text-xs"
                  value={camadaFilter}
                  onChange={(e) => setCamadaFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {availableCamadas.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por episódio (client-side) */}
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500">Episódio</span>
                <select
                  className="bg-black/60 border border-neutral-800 rounded px-2 py-1 text-xs"
                  value={episodeFilter}
                  onChange={(e) => setEpisodeFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {availableEpisodes.map((ep) => (
                    <option key={ep} value={ep}>
                      {ep}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {filteredEvents.length === 0 && !isLoading && (
              <div className="text-[11px] text-neutral-500">
                Nenhum evento encontrado para os filtros atuais.
              </div>
            )}

            <ol className="relative border-l border-neutral-800 pl-4">
              {filteredEvents.map((ev) => (
                <li key={ev.id} className="mb-5 ml-1">
                  {/* ponto da linha */}
                  <div className="w-2 h-2 rounded-full bg-emerald-500 absolute -left-[5px] mt-1.5" />

                  <div className="text-[10px] text-neutral-500 mb-0.5">
                    {formatDateRange(ev)}
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <h3 className="text-xs font-semibold text-neutral-100">
                      {ev.titulo || "(Evento sem título)"}
                    </h3>
                    <div className="text-[10px] text-neutral-500 whitespace-nowrap">
                      {ev.episodio && (
                        <span className="mr-2">Ep. {ev.episodio}</span>
                      )}
                      <span>{formatCamada(ev)}</span>
                    </div>
                  </div>

                  {ev.resumo && (
                    <p className="text-[11px] text-neutral-300 mb-1">
                      {ev.resumo}
                    </p>
                  )}

                  {ev.aparece_em && (
                    <p className="text-[10px] text-neutral-500">
                      <span className="uppercase tracking-[0.16em] mr-1">
                        Aparece em:
                      </span>
                      {ev.aparece_em}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
