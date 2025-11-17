"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type World = {
  id: string;
  nome: string;
};

type ExtractedFicha = {
  id_temp: string;
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  ano_diegese: number | null;
  aparece_em: string;
};

type ExtractResponse = {
  worldId: string;
  documentName: string;
  fichas: ExtractedFicha[];
  personagens: ExtractedFicha[];
  locais: ExtractedFicha[];
  empresas: ExtractedFicha[];
  agencias: ExtractedFicha[];
  midias: ExtractedFicha[];
};

export default function LoreUploadPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);

  const [unitNumber, setUnitNumber] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  const [text, setText] = useState<string>("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Carrega mundos do Supabase (igual ao admin)
  useEffect(() => {
    const fetchWorlds = async () => {
      setError(null);
      const { data, error } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) {
        console.error(error);
        setError("Erro ao carregar mundos para upload.");
        return;
      }

      if (data && data.length > 0) {
        setWorlds(
          data.map((w: any) => ({
            id: w.id as string,
            nome: w.nome as string,
          })),
        );
        if (!selectedWorldId) {
          setSelectedWorldId(data[0].id as string);
        }
      }
    };

    fetchWorlds();
  }, [selectedWorldId]);

  const handleToggleFicha = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExtract = async () => {
    try {
      setError(null);
      setSuccess(null);
      setExtractResult(null);
      setSelectedIds(new Set());
      setIsProcessing(true);

      if (!selectedWorldId) {
        setError("Selecione um mundo antes de processar o texto.");
        setIsProcessing(false);
        return;
      }

      if (!text.trim()) {
        setError("Cole um texto para análise.");
        setIsProcessing(false);
        return;
      }

      const response = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: selectedWorldId,
          documentName,
          text,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Erro ao processar texto.");
      }

      const data: ExtractResponse = await response.json();
      setExtractResult(data);

      // seleciona todas as fichas por padrão
      const allIds = new Set<string>();
      (data.fichas || []).forEach((f) => allIds.add(f.id_temp));
      setSelectedIds(allIds);

      setSuccess("Texto processado. Revise as fichas sugeridas à direita.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro inesperado ao processar o texto.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsSaving(true);

      if (!selectedWorldId) {
        setError("Selecione um mundo antes de salvar.");
        setIsSaving(false);
        return;
      }

      if (!extractResult || !extractResult.fichas.length) {
        setError("Nenhuma ficha para salvar. Processe um texto primeiro.");
        setIsSaving(false);
        return;
      }

      const fichasSelecionadas = extractResult.fichas.filter((f) =>
        selectedIds.has(f.id_temp),
      );

      if (fichasSelecionadas.length === 0) {
        setError("Nenhuma ficha selecionada para salvar.");
        setIsSaving(false);
        return;
      }

      const response = await fetch("/api/lore/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: selectedWorldId,
          unitNumber: unitNumber ? Number(unitNumber) : null,
          fichas: fichasSelecionadas.map((f) => ({
            tipo: f.tipo,
            titulo: f.titulo,
            resumo: f.resumo,
            conteudo: f.conteudo,
            tags: f.tags,
            aparece_em: f.aparece_em,
            ano_diegese: f.ano_diegese,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Erro ao salvar fichas.");
      }

      const data = await response.json();

      setSuccess(
        `Foram salvas ${data.count ?? fichasSelecionadas.length} fichas no mundo selecionado.`,
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro inesperado ao salvar fichas.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderFichaCard = (f: ExtractedFicha) => {
    const checked = selectedIds.has(f.id_temp);
    return (
      <div
        key={f.id_temp}
        className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm mb-2"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="font-semibold text-neutral-100">{f.titulo}</div>
          <label className="flex items-center gap-1 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={checked}
              onChange={() => handleToggleFicha(f.id_temp)}
            />
            salvar
          </label>
        </div>
        {f.resumo && (
          <p className="text-neutral-200 text-xs mb-1">{f.resumo}</p>
        )}
        {f.aparece_em && (
          <p className="text-[11px] text-neutral-300 mb-1">
            <span className="font-semibold">Aparece em:</span> {f.aparece_em}
          </p>
        )}
        {f.tags && f.tags.length > 0 && (
          <p className="text-[11px] text-neutral-400">
            <span className="font-semibold">Tags:</span>{" "}
            {f.tags.join(", ")}
          </p>
        )}
        {typeof f.ano_diegese === "number" && (
          <p className="text-[11px] text-neutral-400">
            <span className="font-semibold">Ano diegese:</span>{" "}
            {f.ano_diegese}
          </p>
        )}
      </div>
    );
  };

  const outros =
    extractResult?.fichas.filter(
      (f) =>
        !["personagem", "local", "empresa", "agencia", "midia"].includes(
          f.tipo.toLowerCase(),
        ),
    ) ?? [];

  return (
    <div className="flex min-h-screen bg-black text-neutral-100">
      {/* COLUNA ESQUERDA – FORM */}
      <div className="w-full max-w-md border-r border-neutral-900 p-6 space-y-4">
        <h1 className="text-lg font-semibold tracking-tight mb-2">
          AntiVerso Lore Machine — Upload de texto
        </h1>
        <p className="text-xs text-neutral-300 mb-4">
          Selecione o mundo, informe (se quiser) o episódio/capítulo/vídeo
          e cole um texto. Or vai sugerir fichas para o catálogo do AntiVerso.
        </p>

        {error && (
          <div className="rounded-lg border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-500/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
            {success}
          </div>
        )}

        {/* Mundo */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-300">
            Mundo
          </label>
          <select
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
            value={selectedWorldId ?? ""}
            onChange={(e) => setSelectedWorldId(e.target.value)}
          >
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nome}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-neutral-400">
            Esse mundo será usado para salvar as fichas e, depois, gerar os
            códigos de catalogação.
          </p>
        </div>

        {/* Episódio / capítulo / vídeo */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-300">
            Episódio / Capítulo / Vídeo (opcional por enquanto)
          </label>
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
            placeholder="Ex: 1, 2, 7..."
          />
          <p className="text-[11px] text-neutral-400">
            Esse número será usado mais pra frente na criação dos códigos
            (ex: AV1-PS1, AV7-PS4).
          </p>
        </div>

        {/* Nome do documento */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-300">
            Nome do documento (opcional)
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder="Ex: AV1 – roteiro do episódio"
          />
        </div>

        {/* Texto */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-300">
            Texto para análise
          </label>
          <textarea
            className="h-60 w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o texto (roteiro, relato, cena, trecho da Bíblia do AntiVerso...)"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleExtract}
            disabled={isProcessing}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing ? "Processando..." : "Processar texto"}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !extractResult}
            className="flex-1 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-50 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Salvando..." : "Salvar fichas aprovadas"}
          </button>
        </div>

        <p className="text-[11px] text-neutral-500 pt-1">
          Use a coluna da direita para revisar as fichas. Marque ou desmarque
          “salvar” em cada uma antes de clicar em{" "}
          <span className="font-semibold">Salvar fichas aprovadas</span>.
        </p>
      </div>

      {/* COLUNA DIREITA – PRÉVIA DAS FICHAS */}
      <div className="flex-1 p-6 overflow-y-auto">
        <h2 className="text-sm font-semibold tracking-wide mb-4 text-neutral-200">
          PRÉVIA DAS FICHAS SUGERIDAS
        </h2>

        {!extractResult && (
          <p className="text-xs text-neutral-400">
            Depois de processar um texto, as fichas sugeridas vão aparecer
            aqui, organizadas por tipo (personagens, locais, mídias, etc.).
          </p>
        )}

        {extractResult && (
          <div className="space-y-6 text-xs">
            {/* Personagens */}
            {extractResult.personagens.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
                    PERSONAGENS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {extractResult.personagens.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {extractResult.personagens.map((f) => renderFichaCard(f))}
              </section>
            )}

            {/* Locais */}
            {extractResult.locais.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400">
                    LOCAIS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {extractResult.locais.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {extractResult.locais.map((f) => renderFichaCard(f))}
              </section>
            )}

            {/* Empresas */}
            {extractResult.empresas.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
                    EMPRESAS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {extractResult.empresas.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {extractResult.empresas.map((f) => renderFichaCard(f))}
              </section>
            )}

            {/* Agências */}
            {extractResult.agencias.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-400">
                    AGÊNCIAS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {extractResult.agencias.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {extractResult.agencias.map((f) => renderFichaCard(f))}
              </section>
            )}

            {/* Mídias */}
            {extractResult.midias.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400">
                    MÍDIAS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {extractResult.midias.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {extractResult.midias.map((f) => renderFichaCard(f))}
              </section>
            )}

            {/* Outros tipos (conceitos, regras de mundo, eventos, etc.) */}
            {outros.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-300">
                    OUTROS TIPOS
                  </h3>
                  <span className="text-[11px] text-neutral-400">
                    {outros.length} ficha(s) sugerida(s)
                  </span>
                </div>
                {outros.map((f) => (
                  <div key={f.id_temp} className="mb-2">
                    <div className="text-[10px] uppercase text-neutral-400 mb-1">
                      Tipo: {f.tipo}
                    </div>
                    {renderFichaCard(f)}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
