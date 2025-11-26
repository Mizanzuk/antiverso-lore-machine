"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { clsx } from "clsx";

// --- TIPOS ---
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
  conteudo: string | null;
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

type TimelineGroup = {
  label: string; // "Anos 1990", "2025", "Sem data"
  type: "decade" | "year" | "unknown";
  children?: TimelineGroup[];
  events?: TimelineEvent[];
  count: number;
  isOpen: boolean;
};

// --- CONSTANTES ---
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

// --- HELPERS DE DATA ---
function getYearFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear();
  } catch {
    return null;
  }
}

function getDecade(year: number): number {
  return Math.floor(year / 10) * 10;
}

function formatDescricaoData(event: TimelineEvent) {
  if (event.descricao_data && event.descricao_data.trim().length > 0) {
    return event.descricao_data;
  }
  if (event.data_inicio) {
    try {
      const date = new Date(event.data_inicio);
      // Ajuste de fuso horário simples para visualização (evita dia anterior)
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const adjustedDate = new Date(date.getTime() + userTimezoneOffset);

      if (event.granularidade_data === "ano") return `${adjustedDate.getFullYear()}`;
      if (event.granularidade_data === "mes") return `${adjustedDate.getMonth() + 1}/${adjustedDate.getFullYear()}`;
      
      return adjustedDate.toLocaleDateString("pt-BR");
    } catch { /* ignore */ }
  }
  return "";
}

export default function TimelinePage() {
  // Estados de Dados
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  
  // Estados de UI/Filtros
  const [selectedCamada, setSelectedCamada] = useState<string>("");
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  
  // Estado de expansão dos grupos
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Estados de Edição
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<TimelineEvent>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Estados de Criação de Evento
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState<Partial<TimelineEvent>>({});
  const [isSavingCreate, setIsSavingCreate] = useState(false);

  // Estados de Criação de Mundo (NOVO)
  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [newWorldHasEpisodes, setNewWorldHasEpisodes] = useState(true);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);

  // Contador para forçar recarregamento
  const [reloadCounter, setReloadCounter] = useState(0);

  // Memoized helpers
  const antiVersoWorld = useMemo(
    () => worlds.find((w) => w.nome && w.nome.toLowerCase().trim() === "antiverso") || null,
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

  // 1. Carrega mundos
  useEffect(() => {
    async function fetchWorlds() {
      setIsLoadingWorlds(true);
      try {
        const { data, error } = await supabaseBrowser
          .from("worlds")
          .select("id, nome, descricao, ordem, has_episodes")
          .order("ordem", { ascending: true });

        if (error) throw error;

        const list = (data || []) as World[];
        // Ordenação: AntiVerso primeiro
        list.sort((a, b) => {
          const aIsAnti = a.nome?.toLowerCase().trim() === "antiverso";
          const bIsAnti = b.nome?.toLowerCase().trim() === "antiverso";
          if (aIsAnti && !bIsAnti) return -1;
          if (!aIsAnti && bIsAnti) return 1;
          return (a.ordem ?? 0) - (b.ordem ?? 0);
        });

        setWorlds(list);
        if (list.length > 0) {
          const anti = list.find(w => w.nome?.toLowerCase().trim() === "antiverso");
          setSelectedWorldId(anti ? anti.id : list[0].id);
        }
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar mundos.");
      } finally {
        setIsLoadingWorlds(false);
      }
    }
    fetchWorlds();
  }, []);

  // 2. Carrega eventos
  useEffect(() => {
    async function fetchEvents() {
      if (!selectedWorldId && !isAntiVersoSelected) return;
      setIsLoadingEvents(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (!isAntiVersoSelected && selectedWorldId) params.set("worldId", selectedWorldId);
        if (selectedCamada) params.set("camada_temporal", selectedCamada);

        const res = await fetch(`/api/lore/timeline?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Erro ao carregar timeline");

        setEvents(json.events || []);
        
        setExpandedGroups(new Set()); 
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setIsLoadingEvents(false);
      }
    }
    fetchEvents();
  }, [selectedWorldId, selectedCamada, isAntiVersoSelected, reloadCounter]);

  // 3. Lógica de Agrupamento
  const groupedData = useMemo(() => {
    if (viewMode === "flat") return null;

    const groups: TimelineGroup[] = [];
    const noDateEvents: TimelineEvent[] = [];
    const decadesMap = new Map<number, Map<number, TimelineEvent[]>>();

    events.forEach(ev => {
      const year = getYearFromDate(ev.data_inicio);
      if (year === null) {
        noDateEvents.push(ev);
        return;
      }
      const decade = getDecade(year);
      
      if (!decadesMap.has(decade)) decadesMap.set(decade, new Map());
      const yearMap = decadesMap.get(decade)!;
      
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year)!.push(ev);
    });

    const sortedDecades = Array.from(decadesMap.keys()).sort((a, b) => a - b);

    sortedDecades.forEach(dec => {
      const yearMap = decadesMap.get(dec)!;
      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
      
      const yearGroups: TimelineGroup[] = sortedYears.map(yr => ({
        label: yr.toString(),
        type: "year",
        events: yearMap.get(yr),
        count: yearMap.get(yr)!.length,
        isOpen: expandedGroups.has(yr.toString())
      }));

      const totalEventsInDecade = yearGroups.reduce((acc, curr) => acc + curr.count, 0);

      groups.push({
        label: `Anos ${dec}`,
        type: "decade",
        children: yearGroups,
        count: totalEventsInDecade,
        isOpen: expandedGroups.has(`dec-${dec}`)
      });
    });

    if (noDateEvents.length > 0) {
      groups.push({
        label: "Sem data definida",
        type: "unknown",
        events: noDateEvents,
        count: noDateEvents.length,
        isOpen: expandedGroups.has("unknown")
      });
    }

    return groups;
  }, [events, viewMode, expandedGroups]);

  // Handlers
  function toggleGroup(id: string) {
    const newSet = new Set(expandedGroups);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedGroups(newSet);
  }

  function expandAll() {
    const allIds = new Set<string>();
    groupedData?.forEach(g => {
      if (g.type === 'decade') allIds.add(`dec-${g.label.split(' ')[1]}`);
      if (g.type === 'unknown') allIds.add('unknown');
      g.children?.forEach(c => allIds.add(c.label));
    });
    setExpandedGroups(allIds);
  }
  
  function collapseAll() {
    setExpandedGroups(new Set());
  }

  // CRUD Handlers
  async function handleDeleteEvent(event: TimelineEvent) {
    if (!confirm(`Apagar evento "${event.titulo}"?`)) return;
    try {
      const res = await fetch(`/api/lore/timeline?ficha_id=${event.ficha_id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEvents(prev => prev.filter(e => e.ficha_id !== event.ficha_id));
      setSelectedEvent(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleSaveEdit() {
    if (!editData.ficha_id) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      
      setEvents(prev => prev.map(e => e.ficha_id === editData.ficha_id ? { ...e, ...editData } as TimelineEvent : e));
      setSelectedEvent(prev => prev?.ficha_id === editData.ficha_id ? { ...prev, ...editData } as TimelineEvent : prev);
      setIsEditOpen(false);
    } catch (e: any) { alert(e.message); } finally { setIsSavingEdit(false); }
  }

  async function handleSaveCreate() {
    if (!createData.world_id) return alert("Selecione um mundo.");
    setIsSavingCreate(true);
    try {
      const res = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createData),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReloadCounter(c => c + 1);
      setIsCreateOpen(false);
      setCreateData({});
    } catch (e: any) { alert(e.message); } finally { setIsSavingCreate(false); }
  }

  // --- HANDLERS DE CRIAÇÃO DE MUNDO ---
  function handleWorldChangeInCreate(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "create_new") {
      setShowNewWorldModal(true);
      return;
    }
    setCreateData({ ...createData, world_id: value });
  }

  function handleCancelWorldModal() {
    setShowNewWorldModal(false);
    setNewWorldName("");
    setNewWorldDescription("");
    setNewWorldHasEpisodes(true);
  }

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

      const { data, error } = await supabaseBrowser.from("worlds").insert([payload]).select("*");

      if (error) throw error;

      const inserted = (data?.[0] || null) as World | null;
      if (inserted) {
        setWorlds((prev) => [...prev, inserted]);
        // Seleciona o novo mundo no form de criação de evento
        setCreateData(prev => ({ ...prev, world_id: inserted.id }));
        setShowNewWorldModal(false);
        setNewWorldName("");
        setNewWorldDescription("");
        setNewWorldHasEpisodes(true);
      }
    } catch (err: any) {
      console.error(err);
      alert("Erro ao criar mundo: " + err.message);
    } finally {
      setIsCreatingWorld(false);
    }
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 flex-col">
      {/* HEADER */}
      <header className="border-b border-zinc-900 px-4 py-2 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-4">
          <a href="/" className="text-[11px] text-zinc-300 hover:text-white">← Home</a>
          <a href="/lore-upload" className="text-[11px] text-zinc-400 hover:text-white">Upload</a>
          <a href="/lore-admin" className="text-[11px] text-zinc-400 hover:text-white">Catálogo</a>
        </div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          Modo Timeline Visual
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR MUNDOS */}
        <aside className="w-64 border-r border-zinc-800 p-4 overflow-y-auto bg-zinc-950/50">
          <h1 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Mundos</h1>
          {isLoadingWorlds && <p className="text-xs text-zinc-600">Carregando...</p>}
          <div className="space-y-1">
            {worlds.map((w) => (
              <button
                key={w.id}
                onClick={() => { setSelectedWorldId(w.id); setSelectedEvent(null); }}
                className={clsx(
                  "w-full text-left rounded px-3 py-2 text-xs transition-colors flex items-center justify-between",
                  selectedWorldId === w.id ? "bg-zinc-800 text-emerald-400 border-l-2 border-emerald-500" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                )}
              >
                <span className="truncate">{w.nome}</span>
                {w.has_episodes && <span className="text-[9px] opacity-50">Série</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL (TIMELINE) */}
        <main className="flex-1 border-r border-zinc-800 p-0 flex flex-col bg-black relative">
          {/* Barra de Ferramentas da Timeline */}
          <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/30 backdrop-blur-sm z-10">
             <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-white">{currentWorld?.nome ?? "..."}</h2>
                <div className="h-4 w-px bg-zinc-700 mx-2"></div>
                <div className="flex bg-zinc-900 rounded p-0.5 border border-zinc-700">
                  <button onClick={() => setViewMode("grouped")} className={clsx("px-3 py-1 text-[10px] rounded uppercase font-medium transition-colors", viewMode === "grouped" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-white")}>Agrupado</button>
                  <button onClick={() => setViewMode("flat")} className={clsx("px-3 py-1 text-[10px] rounded uppercase font-medium transition-colors", viewMode === "flat" ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-white")}>Lista</button>
                </div>
             </div>
             
             <div className="flex items-center gap-3">
                {viewMode === "grouped" && (
                  <div className="flex gap-1 mr-2">
                     <button onClick={expandAll} className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 border border-zinc-800 rounded hover:bg-zinc-800">Expandir Tudo</button>
                     <button onClick={collapseAll} className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 border border-zinc-800 rounded hover:bg-zinc-800">Recolher Tudo</button>
                  </div>
                )}
                <select value={selectedCamada} onChange={(e) => setSelectedCamada(e.target.value)} className="bg-zinc-900 border border-zinc-700 text-xs rounded px-2 py-1 text-zinc-300 focus:border-emerald-500 outline-none">
                  {CAMADAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button onClick={() => {
                  const defWorld = selectedWorldId || antiVersoWorld?.id || "";
                  setCreateData({ world_id: defWorld, titulo: "", resumo: "", episodio: "", camada_temporal: "", descricao_data: "", data_inicio: "", data_fim: "", granularidade_data: "" });
                  setIsCreateOpen(true);
                }} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded shadow-lg shadow-emerald-900/20">+ Evento</button>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin relative">
             {/* LINHA VERTICAL CENTRAL (Estilo Árvore) */}
             <div className="absolute left-[48px] top-0 bottom-0 w-px bg-zinc-800 pointer-events-none z-0"></div>

             {isLoadingEvents && <div className="text-center text-xs text-zinc-500 mt-10">Carregando linha do tempo...</div>}
             
             {!isLoadingEvents && events.length === 0 && (
               <div className="text-center text-zinc-500 mt-10 flex flex-col items-center">
                 <span className="text-2xl mb-2">⏳</span>
                 <p className="text-sm">Nenhum evento encontrado.</p>
                 <p className="text-xs opacity-60">Tente mudar os filtros ou adicionar um novo evento.</p>
               </div>
             )}

             {/* RENDERIZAÇÃO AGRUPADA */}
             {viewMode === "grouped" && groupedData && (
               <div className="space-y-6 relative z-10">
                 {groupedData.map((group) => (
                   <div key={group.type === 'decade' ? `dec-${group.label}` : group.label} className="relative">
                      {/* CARD DA DÉCADA */}
                      <div className="flex items-center gap-4 mb-2 group/decade">
                         <div className="w-12 text-right text-[10px] font-bold text-zinc-500 pt-1">{group.type === 'decade' ? group.label.replace('Anos ', '') : '???'}</div>
                         <button 
                           onClick={() => toggleGroup(group.type === 'decade' ? `dec-${group.label.split(' ')[1]}` : 'unknown')}
                           className="flex-1 flex items-center gap-3 p-2 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-all text-left"
                         >
                            <div className={clsx("w-2 h-2 rounded-full", group.isOpen ? "bg-emerald-500" : "bg-zinc-700 group-hover/decade:bg-zinc-500")}></div>
                            <span className="text-sm font-bold text-zinc-200 uppercase tracking-wide">{group.label}</span>
                            <span className="ml-auto text-[10px] bg-zinc-900 px-2 py-0.5 rounded text-zinc-500">{group.count} eventos</span>
                         </button>
                      </div>

                      {/* CONTEÚDO DA DÉCADA (ANOS) */}
                      {group.isOpen && (
                         <div className="ml-16 border-l border-zinc-800 pl-6 space-y-4 pt-2 pb-4">
                            {group.type === 'unknown' ? (
                              // Lista direta para eventos sem data
                              <div className="space-y-3">
                                {group.events?.map(ev => <EventCard key={ev.ficha_id} event={ev} selectedEvent={selectedEvent} onSelect={setSelectedEvent} onDelete={handleDeleteEvent} onEdit={(e) => { setEditData({...e}); setIsEditOpen(true); }} />)}
                              </div>
                            ) : (
                              // Lista de Anos
                              group.children?.map(yearGroup => (
                                <div key={yearGroup.label}>
                                   <button 
                                     onClick={() => toggleGroup(yearGroup.label)}
                                     className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white mb-2 transition-colors"
                                   >
                                      <span className={clsx("transition-transform", yearGroup.isOpen ? "rotate-90" : "")}>▶</span>
                                      {yearGroup.label} <span className="opacity-40 font-normal">({yearGroup.count})</span>
                                   </button>
                                   
                                   {yearGroup.isOpen && (
                                     <div className="space-y-3 pl-2 border-l border-zinc-800/50 ml-1">
                                        {yearGroup.events?.map(ev => (
                                          <EventCard key={ev.ficha_id} event={ev} selectedEvent={selectedEvent} onSelect={setSelectedEvent} onDelete={handleDeleteEvent} onEdit={(e) => { setEditData({...e}); setIsEditOpen(true); }} />
                                        ))}
                                     </div>
                                   )}
                                </div>
                              ))
                            )}
                         </div>
                      )}
                   </div>
                 ))}
               </div>
             )}

             {/* RENDERIZAÇÃO LISTA PLANA (FLAT) */}
             {viewMode === "flat" && (
               <div className="space-y-4 pl-12 relative z-10">
                 {events.map(ev => (
                   <div key={ev.ficha_id} className="relative">
                     {/* Bolinha na linha do tempo */}
                     <div className="absolute -left-[37px] top-4 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 bg-zinc-600 z-20"></div>
                     <EventCard event={ev} selectedEvent={selectedEvent} onSelect={setSelectedEvent} onDelete={handleDeleteEvent} onEdit={(e) => { setEditData({...e}); setIsEditOpen(true); }} />
                   </div>
                 ))}
               </div>
             )}

          </div>
        </main>

        {/* COLUNA DIREITA: DETALHES */}
        <section className="w-80 p-6 overflow-y-auto bg-zinc-950 border-l border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Detalhes do Evento</h2>

          {!selectedEvent && (
            <div className="text-sm text-zinc-500 italic text-center mt-10">
              Clique em um evento na linha do tempo para ver os detalhes aqui.
            </div>
          )}

          {selectedEvent && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-emerald-500 font-bold">{selectedEvent.tipo || "Evento"}</span>
                <h3 className="text-xl font-bold text-white mt-1 leading-tight">{selectedEvent.titulo || "Sem título"}</h3>
                <div className="flex flex-wrap gap-2 mt-3">
                   {selectedEvent.episodio && <span className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-300 border border-zinc-700">Ep. {selectedEvent.episodio}</span>}
                   {selectedEvent.camada_temporal && <span className="text-[10px] px-2 py-0.5 bg-zinc-800 rounded text-zinc-300 border border-zinc-700 capitalize">{selectedEvent.camada_temporal.replace(/_/g, " ")}</span>}
                </div>
              </div>

              <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
                 <div className="text-[10px] text-zinc-500 uppercase mb-1">Data / Momento</div>
                 <div className="text-sm text-white font-mono">
                    {formatDescricaoData(selectedEvent) || "Data desconhecida"}
                 </div>
              </div>

              <div>
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Resumo</div>
                <p className="text-sm text-zinc-300 leading-relaxed">{selectedEvent.resumo || "Sem resumo."}</p>
              </div>

              {selectedEvent.conteudo && (
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase mb-1">Conteúdo Completo</div>
                  <div className="text-xs text-zinc-400 leading-relaxed max-h-60 overflow-y-auto pr-2 whitespace-pre-wrap border-l-2 border-zinc-800 pl-3">
                    {selectedEvent.conteudo}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-800 flex gap-2">
                 <button onClick={() => { setEditData({...selectedEvent}); setIsEditOpen(true); }} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 rounded font-medium transition-colors">Editar</button>
                 <button onClick={() => handleDeleteEvent(selectedEvent)} className="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 text-xs py-2 rounded font-medium transition-colors">Apagar</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* --- MODAIS --- */}
      
      {/* EDITAR EVENTO */}
      {isEditOpen && editData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
           <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Editar Evento</h3>
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
                 <div><label className="text-[10px] text-zinc-500 uppercase">Título</label><input className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={editData.titulo || ''} onChange={e => setEditData({...editData, titulo: e.target.value})} /></div>
                 <div><label className="text-[10px] text-zinc-500 uppercase">Resumo</label><textarea className="w-full bg-black border border-zinc-700 rounded p-2 text-xs h-20" value={editData.resumo || ''} onChange={e => setEditData({...editData, resumo: e.target.value})} /></div>
                 <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-zinc-500 uppercase">Data Início</label><input type="date" className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={editData.data_inicio || ''} onChange={e => setEditData({...editData, data_inicio: e.target.value})} /></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase">Data Fim</label><input type="date" className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={editData.data_fim || ''} onChange={e => setEditData({...editData, data_fim: e.target.value})} /></div>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-zinc-500 uppercase">Granularidade</label><select className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={editData.granularidade_data || 'vago'} onChange={e => setEditData({...editData, granularidade_data: e.target.value})}>{GRANULARIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase">Descrição da Data</label><input className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={editData.descricao_data || ''} onChange={e => setEditData({...editData, descricao_data: e.target.value})} /></div>
                 </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                 <button onClick={() => setIsEditOpen(false)} className="px-4 py-2 rounded text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-900">Cancelar</button>
                 <button onClick={handleSaveEdit} disabled={isSavingEdit} className="px-4 py-2 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingEdit ? "Salvando..." : "Salvar"}</button>
              </div>
           </div>
        </div>
      )}

      {/* CRIAR EVENTO */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
           <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Novo Evento</h3>
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
                 <div>
                   <label className="text-[10px] text-zinc-500 uppercase">Mundo</label>
                   <select className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.world_id || ''} onChange={handleWorldChangeInCreate}>
                     {worlds.map(w => <option key={w.id} value={w.id}>{w.nome}</option>)}
                     <option value="create_new">+ Novo Mundo...</option>
                   </select>
                 </div>
                 <div><label className="text-[10px] text-zinc-500 uppercase">Título</label><input className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.titulo || ''} onChange={e => setCreateData({...createData, titulo: e.target.value})} /></div>
                 <div><label className="text-[10px] text-zinc-500 uppercase">Resumo</label><textarea className="w-full bg-black border border-zinc-700 rounded p-2 text-xs h-20" value={createData.resumo || ''} onChange={e => setCreateData({...createData, resumo: e.target.value})} /></div>
                 
                 <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-zinc-500 uppercase">Data Início</label><input type="date" className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.data_inicio || ''} onChange={e => setCreateData({...createData, data_inicio: e.target.value})} /></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase">Data Fim</label><input type="date" className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.data_fim || ''} onChange={e => setCreateData({...createData, data_fim: e.target.value})} /></div>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-zinc-500 uppercase">Camada</label><select className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.camada_temporal || 'linha_principal'} onChange={e => setCreateData({...createData, camada_temporal: e.target.value})}>{CAMADAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                    <div><label className="text-[10px] text-zinc-500 uppercase">Descrição da Data</label><input className="w-full bg-black border border-zinc-700 rounded p-2 text-xs" value={createData.descricao_data || ''} onChange={e => setCreateData({...createData, descricao_data: e.target.value})} placeholder="ex: 'No verão de 1993'"/></div>
                 </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                 <button onClick={() => setIsCreateOpen(false)} className="px-4 py-2 rounded text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-900">Cancelar</button>
                 <button onClick={handleSaveCreate} disabled={isSavingCreate} className="px-4 py-2 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingCreate ? "Criando..." : "Criar"}</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL NOVO MUNDO (CHAMADO VIA DROPDOWN) */}
      {showNewWorldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md max-h-[90vh] overflow-auto border border-zinc-800 rounded-lg p-4 bg-zinc-950/95 space-y-3">
            <div className="flex items-center justify-between"><div className="text-[11px] text-zinc-400">Novo Mundo</div><button type="button" onClick={handleCancelWorldModal} className="text-[11px] text-zinc-500 hover:text-zinc-200">fechar</button></div>
            <div className="space-y-1"><label className="text-[11px] text-zinc-500">Nome</label><input className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} placeholder="Ex: Arquivos Vermelhos" /></div>
            <div className="space-y-1"><label className="text-[11px] text-zinc-500">Descrição</label><textarea className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs min-h-[140px]" value={newWorldDescription} onChange={(e) => setNewWorldDescription(e.target.value)} placeholder="Resumo do Mundo…" /></div>
            <div className="flex items-center gap-2 pt-1"><button type="button" onClick={() => setNewWorldHasEpisodes((prev) => !prev)} className={`h-4 px-2 rounded border text-[11px] ${newWorldHasEpisodes ? "border-emerald-400 text-emerald-300 bg-emerald-400/10" : "border-zinc-700 text-zinc-400 bg-black/40"}`}>Este mundo possui episódios</button></div>
            <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={handleCancelWorldModal} className="px-3 py-1.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800/60">Cancelar</button><button type="button" onClick={handleCreateWorldFromModal} disabled={isCreatingWorld} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[11px] font-medium">{isCreatingWorld ? "Criando..." : "Salvar"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente Auxiliar para Renderizar o Card
function EventCard({ event, selectedEvent, onSelect, onDelete, onEdit }: { event: TimelineEvent, selectedEvent: TimelineEvent | null, onSelect: (e: TimelineEvent) => void, onDelete: (e: TimelineEvent) => void, onEdit: (e: TimelineEvent) => void }) {
  const isSelected = selectedEvent?.ficha_id === event.ficha_id;
  return (
    <div 
      onClick={() => onSelect(event)}
      className={clsx(
        "group relative p-3 rounded-lg border transition-all cursor-pointer hover:shadow-lg",
        isSelected ? "bg-zinc-800 border-emerald-500/50 shadow-emerald-900/10" : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-600"
      )}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="text-[10px] font-mono text-emerald-500/80 bg-emerald-900/20 px-1.5 rounded">{formatDescricaoData(event) || "S/ Data"}</span>
        {event.camada_temporal && <span className="text-[9px] text-zinc-500 uppercase">{event.camada_temporal.replace('_', ' ')}</span>}
      </div>
      <h4 className={clsx("font-semibold text-sm mb-1", isSelected ? "text-white" : "text-zinc-300")}>{event.titulo || "Sem título"}</h4>
      {event.resumo && <p className="text-xs text-zinc-500 line-clamp-2">{event.resumo}</p>}
      
      {/* Botões de ação rápida no hover */}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
         <button onClick={(e) => { e.stopPropagation(); onEdit(event); }} className="p-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 hover:text-white text-[10px]">✎</button>
         <button onClick={(e) => { e.stopPropagation(); onDelete(event); }} className="p-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900 hover:text-white text-[10px]">×</button>
      </div>
    </div>
  );
}
