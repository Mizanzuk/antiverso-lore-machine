"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type World = {
  id: string;
  nome: string | null;
};

type SuggestedFicha = {
  id: string; // id local, só para controle no front
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string;
  aparece_em: string;
  codigo: string;
};

const WORLD_PREFIX_MAP: Record<string, string> = {
  arquivos_vermelhos: "AV",
  torre_de_vera_cruz: "TVC",
  evangelho_de_or: "EO",
  culto_de_or: "CO",
  a_sala: "AS",
  aris: "ARIS",
  antiverso: "AN",
  teste: "TS",
};

const TYPE_PREFIX_MAP: Record<string, string> = {
  personagem: "PS",
  local: "LO",
  conceito: "CC",
  evento: "EV",
  midia: "MD",
  "mídia": "MD",
  empresa: "EM",
  agencia: "AG",
  "agência": "AG",
  registro_anomalo: "RA",
  "registro anômalo": "RA",
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getWorldPrefix(world?: World | null): string {
  if (!world) return "XX";

  const idKey = (world.id || "").toLowerCase().trim();
  if (WORLD_PREFIX_MAP[idKey]) return WORLD_PREFIX_MAP[idKey];

  const nameKey = (world.nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (WORLD_PREFIX_MAP[nameKey]) return WORLD_PREFIX_MAP[nameKey];

  const parts = nameKey.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  const initials = parts.map((p) => p[0]).join("");
  return initials.toUpperCase().slice(0, 4) || "XX";
}

function normalizeTipo(tipo: string): string {
  return tipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getTypePrefix(tipo: string): string {
  const key = normalizeTipo(tipo);
  if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key];
  return key.slice(0, 2).toUpperCase() || "FX";
}

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

function createEmptyFicha(id: string): SuggestedFicha {
  return {
    id,
    tipo: "conceito",
    titulo: "",
    resumo: "",
    conteudo: "",
    tags: "",
    aparece_em: "",
    codigo: "",
  };
}

export default function LoreUploadPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  const [text, setText] = useState<string>("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestedFichas, setSuggestedFichas] = useState<SuggestedFicha[]>([]);
  const [editingFicha, setEditingFicha] = useState<SuggestedFicha | null>(null);

  // Carrega mundos
  useEffect(() => {
    const fetchWorlds = async () => {
      const { data, error } = await supabaseBrowser
        .from("worlds")
        .select("id, nome")
        .order("ordem", { ascending: true });

      if (error) {
        console.error("Erro ao carregar mundos:", error);
        setError("Erro ao carregar mundos.");
      } else if (data) {
        setWorlds(data as World[]);
        if (!selectedWorldId && data.length > 0) {
          setSelectedWorldId((data[0] as any).id);
        }
      }
    };

    fetchWorlds();
  }, []);

  async function handleWorldChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;

    if (value === "create_new") {
      const nome = window.prompt("Nome do novo mundo:");
      if (!nome) return;

      const baseId = nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const existingIds = new Set(worlds.map((w) => w.id));
      let newId = baseId || "mundo_novo";
      let suffix = 2;
      while (existingIds.has(newId)) {
        newId = `${baseId || "mundo_novo"}_${suffix}`;
        suffix++;
      }

      const { data, error } = await supabaseBrowser
        .from("worlds")
        .insert([
          {
            id: newId,
            nome,
            descricao: "",
            tipo: "mundo_ficcional",
          },
        ])
        .select("id, nome")
        .single();

      if (error) {
        console.error("Erro ao criar mundo:", error);
        alert("Erro ao criar mundo. Veja o console.");
        return;
      }

      const criado = data as World;
      setWorlds((prev) => [...prev, criado]);
      setSelectedWorldId(criado.id);
    } else {
      setSelectedWorldId(value);
    }
  }

  function handleEditFicha(fichaId: string) {
    const ficha = suggestedFichas.find((f) => f.id === fichaId) || null;
    if (!ficha) return;
    setEditingFicha({ ...ficha });
  }

  function handleRemoveFicha(fichaId: string) {
    setSuggestedFichas((prev) => prev.filter((f) => f.id !== fichaId));
  }

  function handleClearAll() {
    setSuggestedFichas([]);
  }

  function applyEditingFicha() {
    if (!editingFicha) return;
    setSuggestedFichas((prev) =>
      prev.map((f) => (f.id === editingFicha.id ? editingFicha : f)),
    );
    setEditingFicha(null);
  }

  async function handleExtractFichas() {
    setError(null);

    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de extrair fichas.");
      return;
    }
    if (!unitNumber.trim()) {
      setError("Informe o número do episódio/capítulo.");
      return;
    }
    if (!text.trim()) {
      setError("Cole um texto para extrair fichas.");
      return;
    }

    try {
      setIsExtracting(true);

      const response = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: selectedWorldId,
          unitNumber,
          text,
          documentName: documentName || null,
        }),
      });

      if (!response.ok) {
        console.error("Erro HTTP em /api/lore/extract:", response.status);
        setError("Erro ao extrair fichas. Tente novamente.");
        setIsExtracting(false);
        return;
      }

      const data = await response.json();

      const extracted = Array.isArray(data.fichas) ? data.fichas : [];
      const world = worlds.find((w) => w.id === selectedWorldId) || null;
      const worldPrefix = getWorldPrefix(world);
      const episode = normalizeEpisode(unitNumber);

      // Contadores por prefixo de tipo, para gerar número incremental
      const typeCounters: Record<string, number> = {};

      const mapped: SuggestedFicha[] = extracted.map((raw: any) => {
        const id =
          typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : Math.random().toString(36).slice(2);

        const tipoNormalizado = normalizeTipo(raw.tipo || "conceito");
        const typePrefix = getTypePrefix(tipoNormalizado);
        const currentCount = (typeCounters[typePrefix] || 0) + 1;
        typeCounters[typePrefix] = currentCount;

        const codigo =
          worldPrefix && episode
            ? `${worldPrefix}${episode}-${typePrefix}${currentCount}`
            : "";

        const tagsArray = Array.isArray(raw.tags) ? raw.tags : [];
        const tagsStr = tagsArray.join(", ");

        return {
          id,
          tipo: raw.tipo || "conceito",
          titulo: raw.titulo || "",
          resumo: raw.resumo || "",
          conteudo: raw.conteudo || "",
          tags: tagsStr,
          aparece_em: raw.aparece_em || "",
          codigo,
        };
      });

      // Caso não venha nada da API, ainda assim permitir criar uma ficha manual
      if (mapped.length === 0) {
        const id =
          typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : Math.random().toString(36).slice(2);

        mapped.push(createEmptyFicha(id));
      }

      setSuggestedFichas(mapped);
    } catch (err) {
      console.error("Erro inesperado em handleExtractFichas:", err);
      setError("Erro inesperado ao extrair fichas.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSaveFichas() {
    setError(null);

    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de salvar fichas.");
      return;
    }
    if (!unitNumber.trim()) {
      setError("Informe o número do episódio/capítulo.");
      return;
    }
    if (suggestedFichas.length === 0) {
      setError("Não há fichas para salvar.");
      return;
    }

    try {
      setIsSaving(true);

      const fichasPayload = suggestedFichas
        .filter((f) => f.titulo.trim())
        .map((f) => {
          const tagsArray = f.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          return {
            tipo: f.tipo || "conceito",
            titulo: f.titulo.trim(),
            resumo: f.resumo.trim() || "",
            conteudo: f.conteudo.trim() || "",
            tags: tagsArray,
            aparece_em: f.aparece_em.trim() || null,
            codigo: f.codigo.trim() || undefined,
          };
        });

      if (fichasPayload.length === 0) {
        setError("Nenhuma ficha possui título preenchido.");
        setIsSaving(false);
        return;
      }

      const response = await fetch("/api/lore/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: selectedWorldId,
          unitNumber,
          fichas: fichasPayload,
        }),
      });

      if (!response.ok) {
        console.error("Erro HTTP em /api/lore/save:", response.status);
        setError("Erro ao salvar fichas. Verifique os dados e tente novamente.");
        setIsSaving(false);
        return;
      }

      const data = await response.json();
      console.log("Fichas salvas:", data);

      // Limpa somente as fichas sugeridas; texto permanece para referência
      setSuggestedFichas([]);
    } catch (err) {
      console.error("Erro inesperado em handleSaveFichas:", err);
      setError("Erro inesperado ao salvar fichas.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Upload de Texto</h1>
          <p className="text-sm text-zinc-400">
            Envie o texto de um episódio, capítulo ou documento. A Lore Machine
            extrai automaticamente fichas pertencentes ao Mundo escolhido,
            permitindo editar cada ficha antes de salvar no banco.
          </p>
        </header>

        {error && (
          <div className="rounded-md border border-red-500 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Seleção de mundo e episódio */}
        <section className="grid grid-cols-1 md:grid-cols-[2fr,1fr] gap-3 items-center">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">
              Mundo de destino
            </label>
            <select
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
              value={selectedWorldId}
              onChange={handleWorldChange}
            >
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.nome ?? world.id}
                </option>
              ))}
              <option value="create_new">+ Novo mundo...</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">
              Episódio / Capítulo / Documento #
            </label>
            <input
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="Ex.: 6"
            />
          </div>
        </section>

        {/* Nome do documento (opcional) */}
        <section className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-zinc-400">
            Nome do documento (opcional)
          </label>
          <input
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder="Ex.: Episódio 6 — A Geladeira"
          />
        </section>

        {/* Texto */}
        <section className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-zinc-400">
            Texto do episódio / capítulo
          </label>
          <textarea
            className="w-full min-h-[180px] rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o texto a ser analisado..."
          />
        </section>

        {/* Botão de extrair */}
        <div className="flex justify-center">
          <button
            onClick={handleExtractFichas}
            disabled={isExtracting}
            className="w-full md:w-auto px-6 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-sm font-medium"
          >
            {isExtracting ? "Extraindo fichas..." : "Extrair fichas"}
          </button>
        </div>

        {/* Fichas sugeridas */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Fichas sugeridas ({suggestedFichas.length})
            </h2>
            {suggestedFichas.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-zinc-400 hover:text-zinc-100 underline-offset-2 hover:underline"
              >
                Limpar todas
              </button>
            )}
          </div>

          {suggestedFichas.length === 0 && (
            <p className="text-xs text-zinc-500">
              Nenhuma ficha sugerida ainda. Extraia fichas a partir de um texto
              para começar.
            </p>
          )}

          <div className="space-y-2">
            {suggestedFichas.map((ficha) => (
              <div
                key={ficha.id}
                className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {ficha.titulo || "(sem título)"}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                      {ficha.tipo || "conceito"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ficha.codigo && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">
                        {ficha.codigo}
                      </span>
                    )}
                    <button
                      onClick={() => handleEditFicha(ficha.id)}
                      className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleRemoveFicha(ficha.id)}
                      className="text-xs px-2 py-1 rounded-md border border-red-700 text-red-200 hover:bg-red-900/40"
                    >
                      Remover
                    </button>
                  </div>
                </div>
                {ficha.resumo && (
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                    {ficha.resumo}
                  </p>
                )}
              </div>
            ))}
          </div>

          {suggestedFichas.length > 0 && (
            <div className="pt-3 flex justify-center">
              <button
                onClick={handleSaveFichas}
                disabled={isSaving}
                className="w-full md:w-auto px-6 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-medium"
              >
                {isSaving ? "Salvando fichas..." : "Salvar fichas"}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Modal de edição de ficha */}
      {editingFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar ficha</h2>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-100"
                onClick={() => setEditingFicha(null)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Título
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.titulo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, titulo: e.target.value } : prev,
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Tipo
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.tipo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, tipo: e.target.value } : prev,
                    )
                  }
                  placeholder="Ex.: personagem, local, conceito, evento..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Resumo
                </label>
                <textarea
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[60px]"
                  value={editingFicha.resumo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, resumo: e.target.value } : prev,
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Conteúdo
                </label>
                <textarea
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[80px]"
                  value={editingFicha.conteudo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, conteudo: e.target.value } : prev,
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Tags (separadas por vírgula)
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.tags}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, tags: e.target.value } : prev,
                    )
                  }
                  placeholder="Ex.: religião, protagonista, fé"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Aparece em
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.aparece_em}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, aparece_em: e.target.value } : prev,
                    )
                  }
                  placeholder="Ex.: Episódio 6 — A Geladeira"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Código da ficha (gerado automaticamente, mas editável)
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono"
                  value={editingFicha.codigo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, codigo: e.target.value } : prev,
                    )
                  }
                  placeholder="Ex.: TS6-PS1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-zinc-700 text-xs hover:bg-zinc-800"
                onClick={() => setEditingFicha(null)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium"
                onClick={applyEditingFicha}
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
