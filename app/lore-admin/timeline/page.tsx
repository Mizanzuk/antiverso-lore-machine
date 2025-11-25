"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  GRANULARIDADES,
  normalizeGranularidade,
  labelGranularidade,
} from "@/lib/dates/granularidade";


type ViewState = "loading" | "loggedOut" | "loggedIn";

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo?: string | null;
  ordem?: number | null;
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

type EditForm = {
  titulo: string;
  resumo: string;
  episodio: string;
  descricao_data: string;
  data_inicio: string;
  data_fim: string;
  granularidade_data: string;
  camada_temporal: string;
  aparece_em: string;
};

// lista oficial de granularidades do AntiVerso
const GRANULARIDADES = [
  {
    value: "dia",
    label: "Dia exato",
    description: "Data precisa no formato AAAA-MM-DD.",
  },
  {
    value: "mes",
    label: "Mês e ano",
    description: "Data conhecida até o mês (AAAA-MM).",
  },
  {
    value: "ano",
    label: "Ano",
    description: "Evento que só possui ano definido.",
  },
  {
    value: "decada",
    label: "Década",
    description: "Evento conhecido apenas pela década (ex: anos 1990).",
  },
  {
    value: "seculo",
    label: "Século",
    description: "Evento conhecido apenas pelo século (ex: século XX).",
  },
  {
    value: "vago",
    label: "Vago / impreciso",
    description: 'Data narrativa ou imprecisa ("há dez anos", "numa noite...").',
  },
  {
    value: "indefinido",
    label: "Desconhecido",
    description: "Nenhuma informação de data disponível.",
  },
];

export default function TimelinePage() {
  const [view, setView] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [antiVersoWorldId, setAntiVersoWorldId] = useState<string | null>(null);

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [camadaFilter, setCamadaFilter] = useState<string>("");
  const [episodeFilter, setEpisodeFilter] = useState<string>("");

  // edição / deleção
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    titulo: "",
    resumo: "",
    episodio: "",
    descricao_data: "",
    data_inicio: "",
    data_fim: "",
    granularidade_data: "",
    camada_temporal: "",
    aparece_em: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  // Helpers
  // ----------------------------

  function isAntiVerso(world: World | null | undefined): boolean {
    if (!world?.nome) return false;
    return world.nome.trim().toLowerCase() === "antiverso";
  }

  function getWorldIdForApi(
    selectedId: string | null,
    antiId: string | null,
  ): string | null {
    if (!selectedId) return null;
    if (antiId && selectedId === antiId) {
      // AntiVerso = visão geral, não filtra por mundo
      return null;
    }
    return selectedId;
  }

  function normalizarGranularidadeInicial(ev: TimelineEvent): string {
    const raw = ev.granularidade_data ?? "";
    const existe = GRANULARIDADES.some((g) => g.value === raw);
    if (existe) return raw;

    // se não havia granularidade mas há descrição narrativa,
    // faz sentido assumir "vago"
    if (!raw) {
      if (ev.descricao_data && ev.descricao_data.trim().length > 0) {
        return "vago";
      }
      return "indefinido";
    }

    // valor antigo/solto → mapeia para "vago" como padrão
    return "vago";
  }

  // ----------------------------
  // Fetch helpers
  // ----------------------------

  async function fetchAllData() {
    setError(null);
    setIsLoading(true);
    try {
      const { selectedId, antiId } = await fetchWorlds();
      const worldIdForApi = getWorldIdForApi(selectedId, antiId);
      await fetchEvents(worldIdForApi);
    } catch (err: any) {
      console.error(err);
      setError("Erro inesperado ao carregar dados da timeline.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWorlds(): Promise<{
    selectedId: string | null;
    antiId: string | null;
  }> {
    const { data, error } = await supabaseBrowser
      .from("worlds")
      .select("*")
      .order("ordem", { ascending: true });

    if (error) {
      console.error(error);
      setError("Erro ao carregar lista de Mundos.");
      return { selectedId: null, antiId: null };
    }

    const raw = (data || []) as World[];

    // identifica AntiVerso
    let antiId: string | null = null;
    for (const w of raw) {
      if (isAntiVerso(w)) {
        antiId = w.id;
        break;
      }
    }

    // ordena com AntiVerso sempre no topo
    const sorted = raw.slice().sort((a, b) => {
      if (antiId) {
        if (a.id === antiId && b.id !== antiId) return -1;
        if (b.id === antiId && a.id !== antiId) return 1;
      }
      const ao = a.ordem ?? 0;
      const bo = b.ordem ?? 0;
      return ao - bo;
    });

    setWorlds(sorted);
    setAntiVersoWorldId(antiId);

    let initialSelected = selectedWorldId;

    if (!initialSelected) {
      // padrão: AntiVerso; se não existir, o primeiro mundo
      initialSelected = antiId || (sorted[0]?.id ?? null);
      setSelectedWorldId(initialSelected);
    }

    return { selectedId: initialSelected, antiId };
  }

  
async function fetchEvents(worldIdForApi: string | null) {
  setLoadingEvents(true);
  setError(null);

  try {
    console.log("[Timeline] Carregando eventos diretamente do Supabase...", {
      worldIdForApi,
      camadaFilter,
    });

    // Monta query base: apenas fichas do tipo "evento"
    let query = supabaseBrowser
      .from("fichas")
      .select(
        `
        id,
        world_id,
        episodio,
        titulo,
        resumo,
        data_inicio,
        data_fim,
        granularidade_data,
        descricao_data,
        camada_temporal,
        aparece_em,
        created_at
      `
      )
      .eq("tipo", "evento");

    // Se um mundo específico foi selecionado, filtra por ele
    if (worldIdForApi) {
      query = query.eq("world_id", worldIdForApi);
    }

    // Ordenação básica: primeiro pela data de início, depois pela criação
    const { data, error } = await query
      .order("data_inicio", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[Timeline] Erro ao buscar eventos do Supabase:", error.message);
      throw error;
    }

    const mappedEvents: TimelineEvent[] =
      (data || []).map((row: any) => ({
        id: row.id,
        world_id: row.world_id ?? null,
        episodio: row.episodio ?? null,
        titulo: row.titulo ?? null,
        // Usa SEMPRE o campo 'resumo' da ficha; se estiver vazio, deixa null
        resumo: row.resumo ?? null,
        data_inicio: row.data_inicio ?? null,
        data_fim: row.data_fim ?? null,
        granularidade_data: row.granularidade_data ?? null,
        descricao_data: row.descricao_data ?? null,
        camada_temporal: row.camada_temporal ?? null,
        aparece_em: row.aparece_em ?? null,
        created_at: row.created_at ?? null,
      })) ?? [];

    console.log("[Timeline] Eventos carregados do Supabase:", mappedEvents.length);
    setEvents(mappedEvents);
  } catch (err: any) {
    console.error("[Timeline] Erro ao carregar eventos:", err?.message || err);
    setError("Erro ao carregar eventos. Veja o console para detalhes.");
    setEvents([]);
  } finally {
    setLoadingEvents(false);
  }
}
\nasync function handleSaveEdit() {
    if (!editingEvent) return;
    setIsSavingEdit(true);
    setError(null);

    try {
      const { error: updateError } = await supabaseBrowser
        .from("fichas")
        .update({
          titulo: editForm.titulo || null,
          resumo: editForm.resumo || null,
          episodio: editForm.episodio || null,
          descricao_data: editForm.descricao_data || null,
          data_inicio: editForm.data_inicio || null,
          data_fim: editForm.data_fim || null,
          granularidade_data: editForm.granularidade_data || null,
          camada_temporal: editForm.camada_temporal || null,
          aparece_em: editForm.aparece_em || null,
        })
        .eq("id", editingEvent.id);

      if (updateError) {
        console.error(updateError);
        setError("Erro ao salvar alterações da Ficha.");
        return;
      }

      const worldIdForApi = getWorldIdForApi(
        selectedWorldId,
        antiVersoWorldId,
      );
      await fetchEvents(worldIdForApi);
      closeEditModal();
    } catch (err: any) {
      console.error(err);
      setError("Erro inesperado ao salvar alterações.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteEvent(ev: TimelineEvent) {
    const ok = window.confirm(
      "Tem certeza que deseja deletar este Evento? Essa ação não pode ser desfeita.",
    );
    if (!ok) return;

    setDeletingId(ev.id);
    setError(null);

    try {
      const { error: deleteError } = await supabaseBrowser
        .from("fichas")
        .delete()
        .eq("id", ev.id);

      if (deleteError) {
        console.error(deleteError);
        setError("Erro ao deletar o Evento.");
        return;
      }

      const worldIdForApi = getWorldIdForApi(
        selectedWorldId,
        antiVersoWorldId,
      );
      await fetchEvents(worldIdForApi);
    } catch (err: any) {
      console.error(err);
      setError("Erro inesperado ao deletar o Evento.");
    } finally {
      setDeletingId(null);
    }
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
            Escolha um Mundo para filtrar os eventos da Linha do Tempo. O
            <span className="font-semibold"> AntiVerso</span> exibe eventos de
            todos os mundos.
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
                  ? `Eventos ordenados cronologicamente para o Mundo ${
                      getWorldNameById(selectedWorldId) || "selecionado"
                    }.${
                      antiVersoWorldId &&
                      selectedWorldId === antiVersoWorldId
                        ? " (Visão geral: todos os mundos.)"
                        : ""
                    }`
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

            <div className="max-w-3xl">
              <ol className="relative border-l border-neutral-800 pl-4">
                {filteredEvents.map((ev) => (
                  <li key={ev.id} className="relative mb-5 ml-1">
                    {/* ponto da linha */}
                    <div className="w-2 h-2 rounded-full bg-emerald-500 absolute -left-[5px] mt-4" />

                    <div className="bg-neutral-950/60 border border-neutral-800 rounded-md px-3 py-2">
                      <div className="text-[10px] text-neutral-500 mb-1">
                        {formatDateRange(ev)}
                        {ev.granularidade_data && (
                          <span className="ml-2 text-[9px] text-neutral-600">
                            (
                            {labelGranularidade(ev.granularidade_data) ||
                              ev.granularidade_data}
                            )
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs font-semibold text-neutral-100">
                        {ev.titulo || "(Evento sem título)"}
                      </h3>

                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        {ev.episodio && (
                          <span className="mr-2">Ep. {ev.episodio}</span>
                        )}
                        <span>{formatCamada(ev)}</span>
                      </div>

                      {ev.resumo && (
                        <p className="text-[11px] text-neutral-300 mt-1">
                          {ev.resumo}
                        </p>
                      )}

                      {ev.aparece_em && (
                        <p className="text-[10px] text-neutral-500 mt-1">
                          <span className="uppercase tracking-[0.16em] mr-1">
                            Aparece em:
                          </span>
                          {ev.aparece_em}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-neutral-700 hover:border-emerald-400 hover:text-emerald-300 transition-colors"
                          onClick={() => openEditModal(ev)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40 transition-colors"
                          onClick={() => handleDeleteEvent(ev)}
                          disabled={deletingId === ev.id}
                        >
                          {deletingId === ev.id ? "Del…" : "Del"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>

      {/* Modal de edição simples */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Editar Evento
              </h2>
              <button
                className="text-[11px] text-neutral-400 hover:text-neutral-100"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                Fechar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[11px]">
              <div>
                <div className="text-neutral-500 mb-1">Título</div>
                <input
                  className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                  value={editForm.titulo}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, titulo: e.target.value }))
                  }
                />
              </div>

              <div>
                <div className="text-neutral-500 mb-1">Resumo</div>
                <textarea
                  className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px] min-h-[60px]"
                  value={editForm.resumo}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, resumo: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-neutral-500 mb-1">Episódio</div>
                  <input
                    className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                    value={editForm.episodio}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, episodio: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">
                    Camada temporal
                  </div>
                  <input
                    className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                    value={editForm.camada_temporal}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        camada_temporal: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <div className="text-neutral-500 mb-1">
                  Descrição da data (texto)
                </div>
                <input
                  className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                  value={editForm.descricao_data}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      descricao_data: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-neutral-500 mb-1">Data início</div>
                  <input
                    type="date"
                    className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                    value={editForm.data_inicio || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        data_inicio: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Data fim</div>
                  <input
                    type="date"
                    className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                    value={editForm.data_fim || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        data_fim: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <div className="text-neutral-500 mb-1 flex items-center gap-1">
                  Granularidade da data
                  <span className="text-[9px] text-neutral-600">
                    (passe o mouse para ver a explicação)
                  </span>
                </div>
                <select
                  className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                  value={editForm.granularidade_data}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      granularidade_data: e.target.value,
                    }))
                  }
                >
                  {GRANULARIDADES.map((g) => (
                    <option
                      key={g.value}
                      value={g.value}
                      title={g.description}
                    >
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-neutral-500 mb-1">Aparece em</div>
                <input
                  className="w-full bg-black/60 border border-neutral-800 rounded px-2 py-1 text-[11px]"
                  value={editForm.aparece_em}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      aparece_em: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="px-4 py-2 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                className="text-[11px] px-3 py-1 rounded-full border border-neutral-700 hover:border-neutral-400 hover:text-neutral-50 transition-colors"
                onClick={closeEditModal}
                disabled={isSavingEdit}
              >
                Cancelar
              </button>
              <button
                className="text-[11px] px-3 py-1 rounded-full border border-emerald-600 bg-emerald-600/10 hover:bg-emerald-600/20 hover:border-emerald-400 text-emerald-300 transition-colors"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
