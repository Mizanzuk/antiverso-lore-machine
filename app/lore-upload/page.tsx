"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";


const KNOWN_TIPOS = [
  "personagem",
  "local",
  "conceito",
  "evento",
  "mídia",
  "empresa",
  "agência",
  "epistemologia",
  "regras de mundo",
];

type FichaSugerida = {
  id?: string;
  tipo: string;
  titulo: string;
  resumo?: string;
  conteudo?: string;
  tags?: string[];
  aparece_em?: string;
  codigo?: string;
  ano_diegese?: number | null;
  slug?: string;
  world_id?: string;
};

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo?: string | null;
  ordem?: number | null;
};


export default function LoreUploadPage() {
  const [worldId, setWorldId] = useState("");
  const [worlds, setWorlds] = useState<World[]>([]);
  const [unitNumber, setUnitNumber] = useState("");
  const [documentName, setDocumentName] = useState("");

  const [textInput, setTextInput] = useState("");
  const [fichas, setFichas] = useState<FichaSugerida[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalFicha, setModalFicha] = useState<FichaSugerida | null>(null);


  useEffect(() => {
    const loadWorlds = async () => {
      const { data, error } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) {
        console.error("Erro ao carregar mundos:", error);
        return;
      }

      if (data) {
        setWorlds(data as World[]);
      }
    };

    loadWorlds();
  }, []);

  const handleWorldChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (value === "create_new") {
      const nome = window.prompt("Nome do novo mundo:");
      if (!nome) {
        return;
      }

      const baseId = nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const newId = baseId || `mundo_${Date.now()}`;

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
        .select()
        .single();

      if (error) {
        console.error("Erro ao criar mundo:", error);
        alert("Erro ao criar mundo. Veja o console.");
        return;
      }

      const criado = data as World;
      setWorlds((prev) => [...prev, criado]);
      setWorldId(criado.id);
    } else {
      setWorldId(value);
    }
  };
  
  async function handleExtract() {
    if (!textInput.trim() || !worldId || !unitNumber) return;
    setLoading(true);

    try {
      const res = await fetch("/api/lore/extract", {
        method: "POST",
        body: JSON.stringify({
          worldId,
          unitNumber,
          text: textInput,
          documentName,
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao extrair fichas");
      }

      const data = await res.json();
      setFichas(data.fichas ?? []);
    } catch (err) {
      console.error(err);
      alert("Erro ao extrair fichas. Veja o console.");
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(f: FichaSugerida) {
    setModalFicha({ ...f });
  }

  function closeEditModal() {
    setModalFicha(null);
  }

  function updateFichaInList(updated: FichaSugerida) {
    setFichas((prev) =>
      prev.map((f) => (f.titulo === updated.titulo ? updated : f))
    );
  }

  async function handleSave() {
    if (!worldId || !unitNumber) {
      alert("Selecione o Mundo e o Número de episódio/capítulo.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/lore/save", {
        method: "POST",
        body: JSON.stringify({
          worldId,
          unitNumber,
          fichas,
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao salvar fichas");
      }

      alert("Fichas salvas com sucesso!");
      setFichas([]);
      setTextInput("");
      setDocumentName("");
      setUnitNumber("");
      setWorldId("");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar. Veja o console.");
    } finally {
      setSaving(false);
    }
  }


  const tipoOptions = Array.from(
    new Set<string>([
      ...KNOWN_TIPOS,
      ...fichas
        .map((f) => (f.tipo || "").toLowerCase())
        .filter((t) => !!t),
    ]),
  ).sort();
  return (
    <div className="min-h-screen bg-[#0b0b0d] text-gray-100 flex flex-col">

      {/* 🔹 TOPO FIXO - VOLTAR À HOME E IR PARA CATÁLOGO */}
      <header className="h-10 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-gray-300 hover:text-white">
            ← Voltar à Home
          </a>
          <a
            href="/lore-admin"
            className="text-[11px] text-gray-400 hover:text-white"
          >
            Ir para Catálogo
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold">Upload de Texto</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Envie o texto de um episódio, capítulo ou documento.
          A Lore Machine extrai automaticamente fichas pertencentes ao Mundo escolhido,
          permitindo editar cada ficha antes de salvar no banco.
        </p>

        {/* Seleção de mundo + episódio */}
        <div className="flex gap-2">
          <select
            className="flex-1 rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
            value={worldId}
            onChange={handleWorldChange}
          >
            <option value="">Selecione um Mundo...</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nome}
              </option>
            ))}
            <option value="create_new">+ Criar novo mundo…</option>
          </select>
          <input
            className="w-32 rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
            placeholder="Ep/Cap #"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
          />
        </div>

        <input
          className="w-full rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm"
          placeholder="Nome do documento (opcional)"
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
        />

        <textarea
          className="w-full h-48 rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm resize-none"
          placeholder="Cole aqui o texto que deseja analisar..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
        />

        <button
          onClick={handleExtract}
          disabled={loading || !textInput.trim()}
          className="w-full py-2 rounded-md bg-purple-600 hover:bg-purple-700 transition disabled:opacity-40"
        >
          {loading ? "Processando..." : "Extrair fichas"}
        </button>

        {fichas.length > 0 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Fichas sugeridas ({fichas.length})
            </h2>

            <div className="space-y-3">
              {fichas.map((f) => (
                <div
                  key={f.titulo}
                  className="border border-white/10 bg-black/30 rounded-md p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-gray-100">{f.titulo}</strong>{" "}
                      <span className="text-[11px] px-2 py-[1px] rounded-full bg-white/10 border border-white/20 uppercase tracking-wide">
                        {f.tipo}
                      </span>
                    </div>
                    <button
                      onClick={() => openEditModal(f)}
                      className="text-[11px] text-blue-300 hover:text-blue-100"
                    >
                      Editar
                    </button>
                  </div>

                  {f.resumo && (
                    <p className="mt-1 text-xs text-gray-300 line-clamp-2">
                      {f.resumo}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-40"
            >
              {saving ? "Salvando..." : "Salvar fichas"}
            </button>
          </div>
        )}
      </main>

      {/* Modal de edição */}
      {modalFicha && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1b1b1f] border border-white/10 rounded-lg p-4 w-full max-w-lg space-y-3">
            <h2 className="text-lg font-semibold">Editar ficha</h2>

            <input
              value={modalFicha.titulo}
              onChange={(e) =>
                setModalFicha({ ...modalFicha, titulo: e.target.value })
              }
              className="w-full bg-black/40 border border-white/15 px-3 py-2 rounded-md text-sm"
            />

            <select
              value={modalFicha.tipo || ""}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "__novo__") {
                  const novo = window.prompt(
                    "Digite o novo tipo/categoria (ex: personagem, local, conceito…):",
                    modalFicha.tipo || "",
                  );
                  if (novo && novo.trim()) {
                    setModalFicha({
                      ...modalFicha,
                      tipo: novo.trim().toLowerCase(),
                    });
                  }
                } else {
                  setModalFicha({
                    ...modalFicha,
                    tipo: value,
                  });
                }
              }}
              className="w-full bg-black/40 border border-white/15 px-3 py-2 rounded-md text-sm"
            >
              <option value="">Selecione um tipo…</option>
              {tipoOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__novo__">+ Novo tipo…</option>
            </select>

            <textarea
              className="w-full h-24 bg-black/40 border border-white/15 px-3 py-2 rounded-md text-sm resize-none"
              value={modalFicha.resumo ?? ""}
              onChange={(e) =>
                setModalFicha({ ...modalFicha, resumo: e.target.value })
              }
              placeholder="Resumo (opcional)"
            />

            <textarea
              className="w-full h-24 bg-black/40 border border-white/15 px-3 py-2 rounded-md text-sm resize-none"
              value={modalFicha.conteudo ?? ""}
              onChange={(e) =>
                setModalFicha({ ...modalFicha, conteudo: e.target.value })
              }
              placeholder="Conteúdo (opcional)"
            />

            <input
              value={(modalFicha.tags ?? []).join(", ")}
              onChange={(e) =>
                setModalFicha({
                  ...modalFicha,
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Tags separadas por vírgula"
              className="w-full bg-black/40 border border-white/15 px-3 py-2 rounded-md text-sm"
            />

            <button
              onClick={() => {
                updateFichaInList(modalFicha);
                closeEditModal();
              }}
              className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition"
            >
              Salvar alterações
            </button>

            <button
              onClick={closeEditModal}
              className="w-full py-2 rounded-md bg-gray-600 hover:bg-gray-700 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
