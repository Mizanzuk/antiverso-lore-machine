"use client";

import { useEffect, useMemo, useState } from "react";
import { Database } from "@/lib/database.types";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";

type Ficha = Database["public"]["Tables"]["fichas"]["Row"];

type TimelineEvent = {
  ficha_id: string;
  world_id: string | null;
  titulo: string | null;
  resumo: string | null;
  tipo: string | null;
  episodio: string | null;
  camada_temporal: string | null;
  descricao_data: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  aparece_em: string | null;
  created_at: string | null;
};

type EditFormState = {
  titulo: string;
  resumo: string;
  episodio: string;
  camada_temporal: string;
  descricao_data: string;
  data_inicio: string;
  data_fim: string;
  granularidade_data: string;
};

type ViewState = "loading" | "loggedOut" | "loggedIn";

const CAMADAS = [
  { value: "linha_principal", label: "Linha principal" },
  { value: "flashback", label: "Flashback" },
  { value: "flashforward", label: "Flashforward" },
  { value: "sonho_visao", label: "Sonho / visão" },
  { value: "mundo_alternativo", label: "Mundo alternativo" },
  { value: "outro", label: "Outro" },
];

const GRANULARIDADES = [
  { value: "vago", label: "Vago / impreciso" },
  { value: "ano", label: "Ano" },
  { value: "mes", label: "Mês" },
  { value: "dia", label: "Dia" },
  { value: "hora", label: "Hora" },
];

const getGranularidadeLabel = (value: string | null) => {
  if (!value) return "vago / impreciso";
  const found = GRANULARIDADES.find((g) => g.value === value);
  return found ? found.label : value;
};

function getWorldIdForApi(
  selectedWorldId: string | null,
  antiVersoWorldId: string | null
): string | null {
  if (selectedWorldId === "antiverso") {
    return antiVersoWorldId;
  }
  return selectedWorldId;
}

export default function TimelinePage() {
  const supabaseBrowser = createClientComponentClient<Database>();

  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewState>("loading");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<{ id: string; nome: string }[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [antiVersoWorldId, setAntiVersoWorldId] = useState<string | null>(null);

  const [camadaFilter, setCamadaFilter] = useState<string>("");

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null
  );
  const [editError, setEditError] = useState<string | null>(null);

  const worldParam = searchParams.get("world_id");
  const initialWorldIdFromUrl = useMemo(
    () => (worldParam && worldParam.trim().length > 0 ? worldParam : null),
    [worldParam]
  );

  useEffect(() => {
    async function init() {
      setView("loading");

      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session?.user) {
        setView("loggedOut");
        return;
      }

      setProfileId(session.user.id);

      const { data: worldsData, error: worldsError } = await supabaseBrowser
        .from("worlds")
        .select("id, nome, has_episodes, slug")
        .order("ordem", { ascending: true });

      if (worldsError) {
        console.error(worldsError);
        setError("Erro ao carregar mundos.");
        setView("loggedIn");
        return;
      }

      const worldsList =
        worldsData?.map((w) => ({
          id: w.id,
          nome: w.nome ?? "Mundo sem nome",
          slug: w.slug,
        })) ?? [];

      setWorlds(
        worldsList.map((w) => ({
          id: w.id,
          nome: w.nome,
        }))
      );

      const antiVersoWorld = worldsData?.find((w) => w.slug === "antiverso");
      if (antiVersoWorld) {
        setAntiVersoWorldId(antiVersoWorld.id);
      }

      if (initialWorldIdFromUrl) {
        setSelectedWorldId(initialWorldIdFromUrl);
      } else if (worldsList.length > 0) {
        setSelectedWorldId(worldsList[0].id);
      }

      setView("loggedIn");
    }

    init();
  }, [supabaseBrowser, initialWorldIdFromUrl]);

  async function fetchEvents(worldIdForApi: string | null, camada: string) {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (worldIdForApi) params.set("worldId", worldIdForApi);
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
        cache: "no-store",
      });

      if (!res.ok) {
        console.error("Resposta não OK da API /timeline:", res.status);
        setError("Erro ao carregar eventos da Timeline.");
        setEvents([]);
        return;
      }

      const json = await res.json();

      if (!json.success) {
        console.error("Erro da API /timeline:", json.error);
        setError(json.error || "Erro ao carregar eventos da Timeline.");
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

  useEffect(() => {
    if (view !== "loggedIn") return;
    const worldIdForApi = getWorldIdForApi(selectedWorldId, antiVersoWorldId);
    fetchEvents(worldIdForApi, camadaFilter);
  }, [view, selectedWorldId, camadaFilter, antiVersoWorldId]);

  function handleWorldChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newWorldId = e.target.value;
    setSelectedWorldId(newWorldId === "" ? null : newWorldId);
  }

  function handleCamadaFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCamadaFilter(e.target.value);
  }

  function openEditModal(event: TimelineEvent) {
    const dateInicio = event.data_inicio ? event.data_inicio.substring(0, 10) : "";
    const dateFim = event.data_fim ? event.data_fim.substring(0, 10) : "";

    setEditingEvent(event);

    setEditForm({
      titulo: event.titulo || "",
      resumo: event.resumo || "",
      episodio: event.episodio || "",
      camada_temporal: event.camada_temporal || "linha_principal",
      descricao_data: event.descricao_data || "",
      data_inicio: dateInicio,
      data_fim: dateFim,
      granularidade_data: event.granularidade_data || "vago",
    });

    setSaveSuccessMessage(null);
    setEditError(null);
  }

  function closeEditModal() {
    setEditingEvent(null);
    setEditForm(null);
    setSaveSuccessMessage(null);
    setEditError(null);
  }

  function handleEditFormChange(
    field: keyof EditFormState,
    value: string
  ): void {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSaveEdit() {
    if (!editingEvent || !editForm) return;

    setIsSavingEdit(true);
    setEditError(null);
    setSaveSuccessMessage(null);

    try {
      const payload = {
        ...editForm,
        ficha_id: editingEvent.ficha_id,
      };

      const res = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("Resposta não OK ao salvar edição:", res.status);
        setEditError("Erro ao salvar edição (HTTP).");
        return;
      }

      const json = await res.json();

      if (!json.success) {
        console.error("Erro retornado pela API ao salvar edição:", json.error);
        setEditError(json.error || "Erro ao salvar edição.");
        return;
      }

      setSaveSuccessMessage("Alterações salvas com sucesso!");

      if (selectedWorldId || antiVersoWorldId) {
        const worldIdForApi = getWorldIdForApi(selectedWorldId, antiVersoWorldId);
        await fetchEvents(worldIdForApi, camadaFilter);
      }

      const timer = setTimeout(() => {
        setSaveSuccessMessage(null);
      }, 2000);

      return () => clearTimeout(timer);
    } catch (err: any) {
      console.error(err);
      setEditError("Erro inesperado ao salvar edição.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (view === "loggedOut") {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center">
        <p className="text-gray-400">
          Você não está autenticado. Faça login para acessar a Timeline.
        </p>
      </div>
    );
  }

  const selectedWorldName =
    worlds.find((w) => w.id === selectedWorldId)?.nome || "Selecione um mundo";

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Timeline — {selectedWorldName}
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Visualize e edite os eventos cronológicos das fichas. Cada evento
              corresponde a uma ficha marcada como &quot;evento&quot; no mundo
              selecionado.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-zinc-500">
                Mundo
              </label>
              <select
                value={selectedWorldId || ""}
                onChange={handleWorldChange}
                className="bg-zinc-900 border border-zinc-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {worlds.length === 0 && (
                  <option value="">Nenhum mundo cadastrado</option>
                )}

                {worlds.length > 0 && !selectedWorldId && (
                  <option value="">Selecione um mundo</option>
                )}

                {worlds.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-zinc-500">
                Camada temporal
              </label>
              <select
                value={camadaFilter}
                onChange={handleCamadaFilterChange}
                className="bg-zinc-900 border border-zinc-700 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Todas</option>
                {CAMADAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nenhum evento encontrado para os filtros selecionados.
          </p>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => (
              <div
                key={event.ficha_id + index}
                className="relative rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 hover:border-emerald-500/60 transition-colors"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {event.titulo || "Evento sem título"}
                      </h2>
                      {event.episodio && (
                        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-300">
                          Episódio {event.episodio}
                        </span>
                      )}
                      {event.camada_temporal && (
                        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-400">
                          {CAMADAS.find((c) => c.value === event.camada_temporal)
                            ?.label || event.camada_temporal}
                        </span>
                      )}
                    </div>

                    {event.descricao_data && (
                      <p className="text-xs text-zinc-400">
                        {event.descricao_data}
                      </p>
                    )}

                    {event.data_inicio && (
                      <p className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-300">
                          Data:
                        </span>{" "}
                        {event.data_inicio.substring(0, 10)}
                        {event.data_fim &&
                          event.data_fim.substring(0, 10) !==
                            event.data_inicio.substring(0, 10) &&
                          ` — ${event.data_fim.substring(0, 10)}`}
                        {" · "}
                        <span className="text-zinc-400">
                          {getGranularidadeLabel(event.granularidade_data)}
                        </span>
                      </p>
                    )}

                    <p className="text-sm text-zinc-200 whitespace-pre-line">
                      {event.resumo || "Sem resumo definido."}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-col items-end gap-2 md:mt-0">
                    <button
                      onClick={() => openEditModal(event)}
                      className="rounded border border-emerald-600 bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/20"
                    >
                      Editar evento
                    </button>

                    <div className="text-[11px] text-zinc-500 text-right">
                      <p>
                        <span className="font-semibold text-zinc-300">
                          Aparece em:
                        </span>{" "}
                        {event.aparece_em || "Não informado"}
                      </p>
                      {event.created_at && (
                        <p>
                          <span className="font-semibold text-zinc-300">
                            Criado em:
                          </span>{" "}
                          {event.created_at.substring(0, 10)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editingEvent && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-3xl rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Editar evento</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Ficha vinculada: <span className="font-mono text-zinc-300">{editingEvent.ficha_id}</span>
                </p>
              </div>
              <button
                onClick={closeEditModal}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {editError}
              </div>
            )}

            {saveSuccessMessage && (
              <div className="mb-4 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                {saveSuccessMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={editForm.titulo}
                    onChange={(e) =>
                      handleEditFormChange("titulo", e.target.value)
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Resumo
                  </label>
                  <textarea
                    value={editForm.resumo}
                    onChange={(e) =>
                      handleEditFormChange("resumo", e.target.value)
                    }
                    rows={6}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Episódio
                  </label>
                  <input
                    type="text"
                    value={editForm.episodio}
                    onChange={(e) =>
                      handleEditFormChange("episodio", e.target.value)
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Camada temporal
                  </label>
                  <select
                    value={editForm.camada_temporal}
                    onChange={(e) =>
                      handleEditFormChange("camada_temporal", e.target.value)
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {CAMADAS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Descrição da data (texto)
                  </label>
                  <input
                    type="text"
                    value={editForm.descricao_data}
                    onChange={(e) =>
                      handleEditFormChange("descricao_data", e.target.value)
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      Data início
                    </label>
                    <input
                      type="date"
                      value={editForm.data_inicio}
                      onChange={(e) =>
                        handleEditFormChange("data_inicio", e.target.value)
                      }
                      className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      Data fim
                    </label>
                    <input
                      type="date"
                      value={editForm.data_fim}
                      onChange={(e) =>
                        handleEditFormChange("data_fim", e.target.value)
                      }
                      className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Granularidade da data
                  </label>
                  <select
                    value={editForm.granularidade_data}
                    onChange={(e) =>
                      handleEditFormChange("granularidade_data", e.target.value)
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {GRANULARIDADES.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500">
                As alterações são salvas diretamente na ficha correspondente e
                refletidas na Timeline.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="rounded border border-emerald-600 bg-emerald-600/20 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
