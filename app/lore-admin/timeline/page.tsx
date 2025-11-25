"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type World = {
  id: string;
  nome: string | null;
  descricao?: string | null;
  ordem?: number | null;
  has_episodes?: boolean | null;
};

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
  aparece_em?: string | null;
  created_at?: string | null;
};

const CAMADAS = [
  { value: "", label: "Todas as camadas" },
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

function formatDescricaoData(event: TimelineEvent) {
  if (event.descricao_data && event.descricao_data.trim().length > 0) {
    return event.descricao_data;
  }

  if (event.data_inicio) {
    try {
      const date = new Date(event.data_inicio);
      if (event.granularidade_data === "ano") {
        return `${date.getFullYear()}`;
      }
      if (event.granularidade_data === "mes") {
        return `${date.getMonth() + 1}/${date.getFullYear()}`;
      }
      if (event.granularidade_data === "dia" || !event.granularidade_data) {
        return date.toLocaleDateString("pt-BR");
      }
    } catch {
      // ignore
    }
  }

  return "";
}

export default function TimelinePage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [selectedCamada, setSelectedCamada] = useState<string>("");
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para criação de mundo (modal dentro do modal ou separado)
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [newWorldHasEpisodes, setNewWorldHasEpisodes] = useState(true);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<TimelineEvent>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState<Partial<TimelineEvent>>({});
  const [isSavingCreate, setIsSavingCreate] = useState(false);

  const [reloadCounter, setReloadCounter] = useState(0);

  const antiVersoWorld = useMemo(
    () =>
      worlds.find(
        (w) => w.nome && w.nome.toLowerCase().trim() === "antiverso"
      ) || null,
    [worlds]
  );

  const currentWorld = useMemo(
    () => worlds.find((w) => w.id === selectedWorldId) || null,
    [worlds, selectedWorldId]
  );

  const isAntiVersoSelected = useMemo(
    () => !!currentWorld && currentWorld === antiVersoWorld,
    [currentWorld, antiVersoWorld]
  );

  // Carrega mundos
  useEffect(() => {
    async function fetchWorlds() {
      setIsLoadingWorlds(true);
      setError(null);
      try {
        const { data, error } = await supabaseBrowser
          .from("worlds")
          .select("id, nome, descricao, ordem, has_episodes")
          .order("ordem", { ascending: true });

        if (error) {
          console.error("Erro ao carregar mundos:", error);
          setError("Erro ao carregar mundos.");
          return;
        }

        const list = (data || []) as World[];

        // AntiVerso sempre primeiro
        const sorted = [...list].sort((a, b) => {
          const aIsAnti =
            a.nome && a.nome.toLowerCase().trim() === "antiverso";
          const bIsAnti =
            b.nome && b.nome.toLowerCase().trim() === "antiverso";

          if (aIsAnti && !bIsAnti) return -1;
          if (!aIsAnti && bIsAnti) return 1;

          const ao = a.ordem ?? 0;
          const bo = b.ordem ?? 0;
          return ao - bo;
        });

        setWorlds(sorted);

        if (sorted.length > 0) {
          const anti = sorted.find(
            (w) => w.nome && w.nome.toLowerCase().trim() === "antiverso"
          );
          setSelectedWorldId(anti ? anti.id : sorted[0].id);
        }
      } finally {
        setIsLoadingWorlds(false);
      }
    }

    fetchWorlds();
  }, []);

  // Carrega eventos sempre que mundo, camada ou reloadCounter mudar
  useEffect(() => {
    async function fetchEvents() {
      if (!selectedWorldId && !isAntiVersoSelected) return;

      setIsLoadingEvents(true);
      setError(null);

      try {
        const params = new URLSearchParams();

        // AntiVerso enxerga todos → não manda worldId
        if (!isAntiVersoSelected && selectedWorldId) {
          params.set("worldId", selectedWorldId);
        }

        if (selectedCamada && selectedCamada.trim().length > 0) {
          params.set("camada_temporal", selectedCamada.trim());
        }

        const url =
          "/api/lore/timeline" + (params.toString() ? `?${params}` : "");
        const response = await fetch(url);
        const json = await response.json();

        if (!response.ok || !json.success) {
          console.error("Erro da API /timeline:", json.error);
          setError(json.error || "Erro ao carregar eventos da Timeline.");
          setEvents([]);
          return;
        }

        setEvents(json.events || []);
      } catch (err) {
        console.error("Erro ao chamar /api/lore/timeline:", err);
        setError("Erro ao carregar eventos da Timeline.");
        setEvents([]);
      } finally {
        setIsLoadingEvents(false);
      }
    }

    fetchEvents();
  }, [selectedWorldId, selectedCamada, isAntiVersoSelected, reloadCounter]);

  function handleSelectWorld(worldId: string) {
    setSelectedWorldId(worldId);
    setSelectedEvent(null);
  }

  function handleOpenEdit(event: TimelineEvent) {
    setSelectedEvent(event);
    setEditData({ ...event });
    setIsEditOpen(true);
  }

  function handleOpenCreate() {
    // Ao criar, se o mundo selecionado for AntiVerso (ou outro), já preenche
    // Mas deixamos o campo editável para trocar
    const defaultWorldId = selectedWorldId || antiVersoWorld?.id || "";

    setCreateData({
      world_id: defaultWorldId,
      titulo: "",
      resumo: "",
      episodio: "",
      camada_temporal: "",
      descricao_data: "",
      data_inicio: "",
      data_fim: "",
      granularidade_data: "",
    });
    setIsCreateOpen(true);
  }

  async function handleDeleteEvent(event: TimelineEvent) {
    const ok = window.confirm(
      `Tem certeza que deseja apagar o evento "${event.titulo ?? ""}"?`
    );
    if (!ok) return;

    try {
      setIsLoadingEvents(true);
      const params = new URLSearchParams();
      params.set("ficha_id", event.ficha_id);

      const response = await fetch(`/api/lore/timeline?${params.toString()}`, {
        method: "DELETE",
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        console.error("Erro ao deletar evento:", json.error);
        alert(json.error || "Erro ao deletar evento.");
        return;
      }

      setEvents((prev) => prev.filter((e) => e.ficha_id !== event.ficha_id));
      if (selectedEvent?.ficha_id === event.ficha_id) {
        setSelectedEvent(null);
      }
    } catch (err) {
      console.error("Erro ao deletar evento:", err);
      alert("Erro ao deletar evento.");
    } finally {
      setIsLoadingEvents(false);
    }
  }

  function handleChangeEdit<K extends keyof TimelineEvent>(
    key: K,
    value: TimelineEvent[K]
  ) {
    // Se estiver mudando o mundo e selecionar "create_new"
    if (key === "world_id" && value === "create_new") {
      setShowNewWorldModal(true);
      return;
    }
    setEditData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleChangeCreate<K extends keyof TimelineEvent>(
    key: K,
    value: TimelineEvent[K]
  ) {
    if (key === "world_id" && value === "create_new") {
      setShowNewWorldModal(true);
      return;
    }
    setCreateData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSaveEdit() {
    if (!editData || !editData.ficha_id) return;

    setIsSavingEdit(true);
    setError(null);

    try {
      const payload = {
        ficha_id: editData.ficha_id,
        titulo: editData.titulo ?? "",
        resumo: editData.resumo ?? "",
        episodio: editData.episodio ?? "",
        camada_temporal: editData.camada_temporal ?? "",
        descricao_data: editData.descricao_data ?? "",
        granularidade_data: editData.granularidade_data ?? "",
        data_inicio: editData.data_inicio ?? null,
        data_fim: editData.data_fim ?? null,
        // Note: world_id usually isn't updated via timeline edit, but if needed:
        // world_id: editData.world_id
      };

      const response = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        console.error("Erro ao salvar edição:", json.error);
        setError(json.error || "Erro ao salvar alterações.");
        return;
      }

      // Atualiza lista local
      setEvents((prev) =>
        prev.map((evt) =>
          evt.ficha_id === editData.ficha_id
            ? { ...evt, ...editData }
            : evt
        )
      );

      // Atualiza selecionado
      setSelectedEvent((prev) =>
        prev && prev.ficha_id === editData.ficha_id
          ? ({ ...prev, ...editData } as TimelineEvent)
          : prev
      );

      setIsEditOpen(false);
    } catch (err) {
      console.error("Erro ao salvar edição:", err);
      setError("Erro ao salvar alterações.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleSaveCreate() {
    // Validação básica
    if (!createData.world_id) {
      alert("Selecione um mundo para criar o evento.");
      return;
    }

    setIsSavingCreate(true);
    setError(null);

    try {
      const payload = {
        world_id: createData.world_id,
        titulo: createData.titulo ?? "",
        resumo: createData.resumo ?? "",
        episodio: createData.episodio ?? "",
        camada_temporal: createData.camada_temporal ?? "",
        descricao_data: createData.descricao_data ?? "",
        granularidade_data: createData.granularidade_data ?? "",
        data_inicio: createData.data_inicio || null,
        data_fim: createData.data_fim || null,
      };

      const response = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        console.error("Erro ao criar evento:", json.error);
        setError(json.error || "Erro ao criar evento.");
        return;
      }

      setIsCreateOpen(false);
      setCreateData({});
      // Recarrega eventos para incluir o novo
      setReloadCounter((prev) => prev + 1);
    } catch (err) {
      console.error("Erro ao criar evento:", err);
      setError("Erro ao criar evento.");
    } finally {
      setIsSavingCreate(false);
    }
  }

  // Lógica de criação de mundo (igual lore-upload)
  async function handleCreateWorldFromModal() {
    if (!newWorldName.trim()) {
      alert("Dê um nome ao novo Mundo.");
      return;
    }

    setIsCreatingWorld(true);

    try {
      const baseId = newWorldName
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const existingIds = new Set(worlds.map((w) => w.id as string));
      let newId = baseId || "mundo_novo";
      let suffix = 2;
      while (existingIds.has(newId)) {
        newId = `${baseId || "mundo_novo"}_${suffix}`;
        suffix++;
      }

      const payload: any = {
        id: newId,
        nome: newWorldName.trim(),
        descricao: newWorldDescription.trim() || null,
        has_episodes: newWorldHasEpisodes,
        tipo: "mundo_ficcional",
      };

      const { data, error } = await supabaseBrowser
        .from("worlds")
        .insert([payload])
        .select("*");

      if (error) {
        console.error(error);
        alert("Erro ao criar novo Mundo.");
        return;
      }

      const inserted = (data?.[0] || null) as World | null;

      if (inserted) {
        setWorlds((prev) => [...prev, inserted]);
        
        // Define o novo mundo como selecionado no modal que estiver aberto
        if (isCreateOpen) {
          setCreateData(prev => ({ ...prev, world_id: inserted.id }));
        } else if (isEditOpen) {
          setEditData(prev => ({ ...prev, world_id: inserted.id }));
        }

        setShowNewWorldModal(false);
        setNewWorldName("");
        setNewWorldDescription("");
        setNewWorldHasEpisodes(true);
      }
    } catch (err) {
      console.error(err);
      alert("Erro inesperado ao criar Mundo.");
    } finally {
      setIsCreatingWorld(false);
    }
  }

  function handleCancelWorldModal() {
    setShowNewWorldModal(false);
    setNewWorldName("");
    setNewWorldDescription("");
    setNewWorldHasEpisodes(true);
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 flex-col">
      {/* Top Header (igual Catálogo) */}
      <header className="border-b border-zinc-900 px-4 py-2 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-[11px] text-zinc-300 hover:text-white"
          >
            ← Home
          </a>
          <a
            href="/lore-upload"
            className="text-[11px] text-zinc-400 hover:text-white"
          >
            Upload
          </a>
          <a
            href="/lore-admin"
            className="text-[11px] text-zinc-400 hover:text-white"
          >
            Catálogo
          </a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Coluna de Mundos */}
        <aside className="w-64 border-r border-zinc-800 p-4 overflow-y-auto">
          <h1 className="text-lg font-semibold mb-2">Mundos</h1>
          <p className="text-xs text-zinc-400 mb-4">
            Selecione um mundo para ver sua linha do tempo.
            <span className="block mt-1">
              AntiVerso mostra todos os eventos do AntiVerso.
            </span>
          </p>

          {isLoadingWorlds && (
            <p className="text-sm text-zinc-400">Carregando mundos...</p>
          )}

          {!isLoadingWorlds && worlds.length === 0 && (
            <p className="text-sm text-zinc-500">Nenhum mundo cadastrado.</p>
          )}

          <div className="space-y-1">
            {worlds.map((world) => {
              const isSelected = world.id === selectedWorldId;
              const isAnti =
                world.nome && world.nome.toLowerCase().trim() === "antiverso";

              return (
                <button
                  key={world.id}
                  onClick={() => handleSelectWorld(world.id)}
                  className={[
                    "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                    isSelected
                      ? "bg-zinc-800 text-emerald-300 border border-emerald-600/40"
                      : "bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">
                      {world.nome || "Sem nome"}
                    </span>
                    {isAnti && (
                      <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        AntiVerso
                      </span>
                    )}
                  </div>
                  {world.descricao && (
                    <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                      {world.descricao}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Coluna central: Timeline */}
        <main className="flex-1 border-r border-zinc-800 p-6 overflow-y-auto">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-semibold">
                Timeline — {currentWorld?.nome ?? "Selecione um mundo"}
              </h2>
              <p className="text-sm text-zinc-400">
                Visualize e edite os eventos cronológicos das fichas. Cada evento
                corresponde a uma ficha marcada como "evento" no mundo
                selecionado.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <label className="text-xs text-zinc-400">
                Camada temporal
                <select
                  value={selectedCamada}
                  onChange={(e) => setSelectedCamada(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {CAMADAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={handleOpenCreate}
                className="mt-2 rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
              >
                + Novo evento
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {isLoadingEvents && (
            <p className="text-sm text-zinc-400">Carregando eventos...</p>
          )}

          {!isLoadingEvents && events.length === 0 && !error && (
            <p className="text-sm text-zinc-500">
              Nenhum evento encontrado para os filtros selecionados.
            </p>
          )}

          {/* Linha vertical + eventos */}
          <div className="relative mt-4">
            {/* Linha central */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800" />

            <div className="space-y-6 pl-10">
              {events.map((event) => {
                const isSelected =
                  selectedEvent && selectedEvent.ficha_id === event.ficha_id;
                const descricaoData = formatDescricaoData(event);

                return (
                  <div key={event.ficha_id} className="relative">
                    {/* nó da linha */}
                    <div className="absolute -left-[18px] top-4 h-3 w-3 rounded-full border border-emerald-400 bg-zinc-950" />

                    <div
                      className={[
                        "rounded-xl border p-4 transition-colors cursor-pointer",
                        isSelected
                          ? "border-emerald-500 bg-zinc-900"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/60",
                      ].join(" ")}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">
                          {event.titulo || "Evento sem título"}
                        </h3>
                        <div className="flex items-center gap-2">
                          {event.episodio && (
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                              EPISÓDIO {event.episodio}
                            </span>
                          )}
                          {event.camada_temporal && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                              {event.camada_temporal.replace("_", " ")}
                            </span>
                          )}
                        </div>
                      </div>

                      {descricaoData && (
                        <p className="mt-1 text-xs text-zinc-400">
                          {descricaoData}
                        </p>
                      )}

                      {event.resumo && (
                        <p className="mt-3 text-sm text-zinc-200">
                          {event.resumo}
                        </p>
                      )}

                      <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
                        <div className="flex flex-col gap-0.5">
                          {event.aparece_em && (
                            <span>Aparece em: {event.aparece_em}</span>
                          )}
                          {event.created_at && (
                            <span>
                              Criado em:{" "}
                              {new Date(event.created_at).toLocaleDateString(
                                "pt-BR"
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(event);
                            }}
                            className="rounded border border-emerald-500/70 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                          >
                            Editar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEvent(event);
                            }}
                            className="rounded border border-red-500/70 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
                          >
                            Deletar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Coluna direita: detalhes da ficha */}
        <section className="w-80 p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-3">Ficha selecionada</h2>

          {!selectedEvent && (
            <p className="text-sm text-zinc-500">
              Selecione um evento na linha do tempo para ver detalhes aqui.
            </p>
          )}

          {selectedEvent && (
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="text-base font-semibold">
                  {selectedEvent.titulo || "Evento sem título"}
                </h3>
                {selectedEvent.resumo && (
                  <p className="mt-1 text-zinc-300">{selectedEvent.resumo}</p>
                )}
              </div>

              <div className="space-y-1 text-xs text-zinc-400">
                {selectedEvent.world_id && (
                  <p>Mundo ID: {selectedEvent.world_id}</p>
                )}
                {selectedEvent.episodio && (
                  <p>Ep.: {selectedEvent.episodio}</p>
                )}
                {selectedEvent.camada_temporal && (
                  <p>Camada: {selectedEvent.camada_temporal}</p>
                )}
                {selectedEvent.descricao_data && (
                  <p>Data: {selectedEvent.descricao_data}</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal de edição */}
      {isEditOpen && editData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Editar evento</h3>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => setIsEditOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Seleção de Mundo (Novo Campo) */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Mundo
                </label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  value={editData.world_id ?? ""}
                  onChange={(e) => handleChangeEdit("world_id", e.target.value)}
                >
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome ?? w.id}
                    </option>
                  ))}
                  <option value="create_new">+ Novo Mundo...</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Título
                </label>
                <input
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={editData.titulo ?? ""}
                  onChange={(e) => handleChangeEdit("titulo", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Resumo
                </label>
                <textarea
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm min-h-[80px]"
                  value={editData.resumo ?? ""}
                  onChange={(e) => handleChangeEdit("resumo", e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Episódio
                  </label>
                  <input
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={editData.episodio ?? ""}
                    onChange={(e) =>
                      handleChangeEdit("episodio", e.target.value)
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Camada temporal
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={editData.camada_temporal ?? ""}
                    onChange={(e) =>
                      handleChangeEdit("camada_temporal", e.target.value)
                    }
                  >
                    <option value="">(nenhuma)</option>
                    {CAMADAS.filter((c) => c.value).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Descrição da data
                </label>
                <input
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={editData.descricao_data ?? ""}
                  onChange={(e) =>
                    handleChangeEdit("descricao_data", e.target.value)
                  }
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Data início
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={editData.data_inicio ?? ""}
                    onChange={(e) =>
                      handleChangeEdit("data_inicio", e.target.value)
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Data fim
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={editData.data_fim ?? ""}
                    onChange={(e) =>
                      handleChangeEdit("data_fim", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Granularidade da data
                </label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={editData.granularidade_data ?? ""}
                  onChange={(e) =>
                    handleChangeEdit("granularidade_data", e.target.value)
                  }
                >
                  <option value="">(não definido)</option>
                  {GRANULARIDADES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingEdit}
              >
                Cancelar
              </button>
              <button
                className="rounded border border-emerald-600 bg-emerald-600/20 px-3 py-1 text-sm font-medium text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Novo evento</h3>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => setIsCreateOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Seleção de Mundo (Novo Campo) */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Mundo
                </label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  value={createData.world_id ?? ""}
                  onChange={(e) => handleChangeCreate("world_id", e.target.value)}
                >
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome ?? w.id}
                    </option>
                  ))}
                  <option value="create_new">+ Novo Mundo...</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Título
                </label>
                <input
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={createData.titulo ?? ""}
                  onChange={(e) => handleChangeCreate("titulo", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Resumo
                </label>
                <textarea
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm min-h-[80px]"
                  value={createData.resumo ?? ""}
                  onChange={(e) =>
                    handleChangeCreate("resumo", e.target.value)
                  }
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Episódio
                  </label>
                  <input
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={createData.episodio ?? ""}
                    onChange={(e) =>
                      handleChangeCreate("episodio", e.target.value)
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Camada temporal
                  </label>
                  <select
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={createData.camada_temporal ?? ""}
                    onChange={(e) =>
                      handleChangeCreate("camada_temporal", e.target.value)
                    }
                  >
                    <option value="">(nenhuma)</option>
                    {CAMADAS.filter((c) => c.value).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Descrição da data
                </label>
                <input
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={createData.descricao_data ?? ""}
                  onChange={(e) =>
                    handleChangeCreate("descricao_data", e.target.value)
                  }
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Data início
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={createData.data_inicio ?? ""}
                    onChange={(e) =>
                      handleChangeCreate("data_inicio", e.target.value)
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">
                    Data fim
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={createData.data_fim ?? ""}
                    onChange={(e) =>
                      handleChangeCreate("data_fim", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Granularidade da data
                </label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  value={createData.granularidade_data ?? ""}
                  onChange={(e) =>
                    handleChangeCreate("granularidade_data", e.target.value)
                  }
                >
                  <option value="">(não definido)</option>
                  {GRANULARIDADES.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => setIsCreateOpen(false)}
                disabled={isSavingCreate}
              >
                Cancelar
              </button>
              <button
                className="rounded border border-emerald-600 bg-emerald-600/20 px-3 py-1 text-sm font-medium text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSaveCreate}
                disabled={isSavingCreate}
              >
                {isSavingCreate ? "Criando..." : "Criar evento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação de novo mundo (Reutilizado da lógica do Upload) */}
      {showNewWorldModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md max-h-[90vh] overflow-auto border border-zinc-800 rounded-lg p-4 bg-zinc-950/95 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-zinc-400">Novo Mundo</div>
              <button
                type="button"
                onClick={handleCancelWorldModal}
                className="text-[11px] text-zinc-500 hover:text-zinc-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Nome</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="Ex: Arquivos Vermelhos"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Descrição</label>
              <textarea
                className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs min-h-[140px]"
                value={newWorldDescription}
                onChange={(e) => setNewWorldDescription(e.target.value)}
                placeholder="Resumo do Mundo…"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setNewWorldHasEpisodes((prev) => !prev)
                }
                className={`h-4 px-2 rounded border text-[11px] ${
                  newWorldHasEpisodes
                    ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                    : "border-zinc-700 text-zinc-400 bg-black/40"
                }`}
              >
                Este mundo possui episódios
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelWorldModal}
                className="px-3 py-1.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateWorldFromModal}
                disabled={isCreatingWorld}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[11px] font-medium"
              >
                {isCreatingWorld ? "Criando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
