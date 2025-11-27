"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { clsx } from "clsx";

// --- TIPOS ---
type Universe = {
  id: string;
  nome: string;
};

type World = {
  id: string;
  nome: string | null;
  descricao?: string | null;
  ordem?: number | null;
  has_episodes?: boolean | null;
  universe_id?: string | null;
  is_root?: boolean; // Importante para filtrar
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
  label: string; 
  type: "decade" | "year" | "unknown";
  children?: TimelineGroup[];
  events?: TimelineEvent[];
  count: number;
  isOpen: boolean;
};

type CatalogResponse = {
  worlds: World[];
  entities: any[];
  types: { id: string; label: string }[];
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
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const adjustedDate = new Date(date.getTime() + userTimezoneOffset);

      if (event.granularidade_data === "ano") return `${adjustedDate.getFullYear()}`;
      if (event.granularidade_data === "mes") return `${adjustedDate.getMonth() + 1}/${adjustedDate.getFullYear()}`;
      
      return adjustedDate.toLocaleDateString("pt-BR");
    } catch { /* ignore */ }
  }
  return "";
}

// --- CARD DE EVENTO AUXILIAR (Mantido) ---
const EventCard = ({ event, selectedEvent, onSelect, onDelete, onEdit }: any) => {
    const isSelected = selectedEvent && selectedEvent.ficha_id === event.ficha_id;
    return (
        <div 
            key={event.ficha_id}
            className={clsx(
                "group relative border rounded-lg p-3 cursor-pointer transition-all min-h-24",
                isSelected ? "border-emerald-500 bg-emerald-900/20 shadow-lg" : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/60"
            )}
            onClick={() => onSelect(event)}
        >
            <div className="flex justify-between items-start">
                <div className="pr-10">
                    <div className={clsx("text-[10px] uppercase font-mono tracking-wider mb-1", isSelected ? "text-emerald-300" : "text-zinc-500")}>
                        {formatDescricaoData(event) || "Data Desconhecida"}
                    </div>
                    <h4 className="text-sm font-bold text-white leading-snug">
                        {event.titulo || "Evento sem título"}
                    </h4>
                </div>
                
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        type="button"
                        className="text-[10px] px-1 py-0.5 rounded border border-zinc-700 hover:border-zinc-400 text-zinc-300"
                        onClick={(e) => { e.stopPropagation(); onEdit(event); }}
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        className="text-[10px] px-1 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40"
                        onClick={(e) => { e.stopPropagation(); onDelete(event); }}
                    >
                        Del
                    </button>
                </div>
            </div>
            <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
                {event.resumo || event.conteudo || "Sem resumo."}
            </p>
        </div>
    );
};


export default function TimelinePage() {
  // --- ESTADOS DE DADOS ---
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null);
  
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  
  // --- ESTADOS DE UI/FILTROS ---
  const [selectedCamada, setSelectedCamada] = useState<string>("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- ESTADOS DE EDIÇÃO/CRIAÇÃO ---
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<TimelineEvent>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState<Partial<TimelineEvent>>({});
  const [isSavingCreate, setIsSavingCreate] = useState(false);

  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [newWorldHasEpisodes, setNewWorldHasEpisodes] = useState(true);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);

  const [reloadCounter, setReloadCounter] = useState(0);

  // 1. CARREGAR UNIVERSOS
  useEffect(() => {
    async function fetchUniverses() {
      try {
        const { data, error } = await supabaseBrowser
          .from("universes")
          .select("id, nome")
          .order("nome", { ascending: true });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setUniverses(data);
          if (!selectedUniverseId) {
             const antiverso = data.find(u => u.nome.toLowerCase() === 'antiverso');
             setSelectedUniverseId(antiverso ? antiverso.id : data[0].id);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar universos:", err);
      }
    }
    fetchUniverses();
  }, []);

  // 2. CARREGAR MUNDOS (CHAMA API DO SERVIDOR)
  const fetchWorlds = async () => {
    if (!selectedUniverseId) return;

    setIsLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams({ universeId: selectedUniverseId });
      const res = await fetch(`/api/catalog?${params.toString()}`);

      if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Falha na rede ou API' }));
          throw new Error(errorData.error || `Falha ao carregar Mundos. Status: ${res.status}`);
      }
      
      const data = (await res.json()) as CatalogResponse;
      
      // Define todos os mundos carregados pela API.
      setWorlds(data.worlds); 
      
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar mundos.");
      setWorlds([]);
    } finally {
      setIsLoadingData(false);
    }
  }

  useEffect(() => {
    if (!selectedUniverseId) return;
    fetchWorlds();
  }, [selectedUniverseId, reloadCounter]); // Adiciona reloadCounter

  // 3. CARREGAR EVENTOS (CHAMA A API DO BACK-END)
  useEffect(() => {
    if (!selectedUniverseId) return;

    async function fetchEvents() {
      setIsLoadingData(true);
      setError(null);
      
      try {
        // CONSTRUÇÃO DOS PARÂMETROS PARA A ROTA DA API (BACK-END)
        const params = new URLSearchParams();
        
        if (selectedWorldId) {
            params.set("worldId", selectedWorldId);
        } else {
            // Se "Tudo" estiver selecionado, passamos o universeId e a API se vira.
            params.set("universeId", selectedUniverseId);
        }

        if (selectedCamada) {
            params.set("camada_temporal", selectedCamada);
        }

        const res = await fetch(`/api/lore/timeline?${params.toString()}`);
        const json = await res.json();
        
        if (!res.ok || json.error) {
            throw new Error(json.error || "Erro desconhecido ao buscar eventos.");
        }

        const mappedEvents: TimelineEvent[] = (json.events || []).map((row: any) => ({
          ficha_id: row.id as string,
          world_id: (row as any).world_id ?? null,
          titulo: (row as any).titulo ?? null,
          resumo: (row as any).resumo ?? null,
          conteudo: (row as any).conteudo ?? null,
          tipo: (row as any).tipo ?? null,
          episodio: (row as any).episodio ?? null,
          camada_temporal: (row as any).camada_temporal ?? null,
          descricao_data: (row as any).descricao_data ?? null,
          data_inicio: (row as any).data_inicio ?? null,
          data_fim: (row as any).data_fim ?? null,
          granularidade_data: (row as any).granularidade_data ?? null,
          aparece_em: (row as any).aparece_em ?? null,
          created_at: (row as any).created_at ?? null,
        }));

        setEvents(mappedEvents);
        setExpandedGroups(new Set()); 
      } catch (err: any) {
        console.error(err);
        setError(`Falha ao buscar eventos: ${err.message}`);
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchEvents();
  }, [selectedUniverseId, selectedWorldId, selectedCamada, reloadCounter]);

  // 4. LÓGICA DE AGRUPAMENTO
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
      if (!res.ok) throw new Error("Erro ao deletar");
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
      if (!res.ok) throw new Error("Erro ao salvar");
      
      setEvents(prev => prev.map(e => e.ficha_id === editData.ficha_id ? { ...e, ...editData } as TimelineEvent : e));
      setSelectedEvent(prev => prev?.ficha_id === editData.ficha_id ? { ...prev, ...editData } as TimelineEvent : prev);
      setIsEditOpen(false);
    } catch (e: any) { alert(e.message); } finally { setIsSavingEdit(false); }
  }

  async function handleSaveCreate(e: React.FormEvent) {
    e.preventDefault(); // Garante que não haverá reload
    if (!createData.world_id) return alert("Selecione um mundo.");
    setIsSavingCreate(true);
    try {
      const res = await fetch("/api/lore/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createData),
      });
      if (!res.ok) throw new Error("Erro ao criar");
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
      // CORREÇÃO: Força o seletor a voltar ao ID atual/anterior
      e.target.value = createData.world_id || worlds.find(w => w.is_root)?.id || worlds[0]?.id || "";
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

  async function handleCreateWorldFromModal(e: React.FormEvent) {
    e.preventDefault(); // Garante que não haverá reload
    if (!newWorldName.trim()) {
      alert("Dê um nome ao novo Mundo.");
      return;
    }
    setIsCreatingWorld(true);

    try {
      const slugId = newWorldName.trim().toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
      const payload: any = {
        id: slugId,
        nome: newWorldName.trim(),
        descricao: newWorldDescription.trim() || null,
        has_episodes: newWorldHasEpisodes,
        tipo: "mundo_ficcional",
        universe_id: selectedUniverseId
      };

      const { data, error } = await supabaseBrowser.from("worlds").insert([payload]).select("*");

      if (error) throw error;

      const inserted = (data?.[0] || null) as World | null;
      if (inserted) {
        // CORREÇÃO: Força o refetch da lista de mundos e eventos
        setReloadCounter(c => c + 1);
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
        <div className="flex items-center gap-4 text-xs">
          <a href="/" className="text-zinc-300 hover:text-white">← Home</a>
          <a href="/lore-upload" className="text-zinc-400 hover:text-white">Upload</a>
          <a href="/lore-admin" className="text-zinc-400 hover:text-white">Catálogo</a>
        </div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          Modo Timeline Visual
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR MUNDOS */}
        <aside className="w-64 border-r border-zinc-800 p-4 overflow-y-auto bg-zinc-950/50">
          <div className="mb-4">
             <label className="text-[9px] uppercase text-zinc-500 font-bold">Universo</label>
             <select className="w-full bg-black border border-zinc-800 rounded text-xs p-1 mt-1" value={selectedUniverseId || ""} onChange={e => setSelectedUniverseId(e.target.value)}>
               {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
             </select>
          </div>

          <h1 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Mundos</h1>
          <div className="space-y-1">
            {/* Botão "Todos" sem ícone */}
            <button
                onClick={() => { setSelectedWorldId(null); setSelectedEvent(null); }}
                className={clsx(
                  "w-full text-left rounded px-3 py-2 text-xs transition-colors flex items-center gap-2 mb-2",
                  !selectedWorldId ? "bg-zinc-800 text-white border-l-2 border-emerald-500 font-bold" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border-l-2 border-transparent"
                )}
              >
                {/* Nome direto sem ícone */}
                <span>{(universes.find(u => u.id === selectedUniverseId)?.nome || "Universo")} (Completo)</span>
            </button>

            <div className="h-px bg-zinc-800 my-2"></div>

            {worlds
              .filter(w => !w.is_root) // Filtra para mostrar apenas os mundos "filhos" aqui.
              .map((w) => (
              <button
                key={w.id}
                onClick={() => { setSelectedWorldId(w.id); setSelectedEvent(null); }}
