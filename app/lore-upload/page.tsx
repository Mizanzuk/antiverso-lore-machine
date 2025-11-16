"use client";

import { useEffect, useState, FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
};

type ExtractedItem = {
  tipo: string;
  titulo: string;
  resumo?: string;
  conteudo?: string;
  tags?: string[];
  ano_diegese?: string | number | null;
  ordem_cronologica?: string | number | null;
  aparece_em?: string | null;
  codes?: string[];
};

type ExtractResponse = {
  worldId: string;
  documentName: string;
  personagens: ExtractedItem[];
  locais: ExtractedItem[];
  empresas: ExtractedItem[];
  agencias: ExtractedItem[];
  midias: ExtractedItem[];
};

export default function LoreUploadPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResponse | null>(null);

  // Carrega mundos ao abrir
  useEffect(() => {
    const loadWorlds = async () => {
      try {
        setIsLoadingWorlds(true);
        setError(null);
        const { data, error: worldsError } = await supabaseBrowser
          .from("worlds")
          .select("*")
          .order("ordem", { ascending: true });

        if (worldsError) {
          console.error(worldsError);
          setError("Erro ao carregar Mundos.");
          setIsLoadingWorlds(false);
          return;
        }

        const list = (data ?? []) as World[];
        setWorlds(list);

        if (list.length > 0 && !selectedWorldId) {
          setSelectedWorldId(list[0].id);
        }

        setIsLoadingWorlds(false);
      } catch (err) {
        console.error(err);
        setError("Erro inesperado ao carregar Mundos.");
        setIsLoadingWorlds(false);
      }
    };

    loadWorlds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de enviar o texto.");
      return;
    }
    if (!documentName.trim()) {
      setError("Dê um nome para o documento (ex: AV1 – Roteiro completo).");
      return;
    }
    if (!rawText.trim()) {
      setError("Cole algum texto para a Lore Machine analisar.");
      return;
    }

    try {
      setIsProcessing(true);

      const response = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: selectedWorldId,
          documentName: documentName.trim(),
          text: rawText,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as any)?.error ||
            "Erro ao processar texto com a Lore Machine.",
        );
      }

      const data = (await response.json()) as ExtractResponse;
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ||
          "Erro inesperado ao falar com a Lore Machine. Tente novamente.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function hasAnyResult(res: ExtractResponse | null): boolean {
    if (!res) return false;
    return (
      res.personagens.length > 0 ||
      res.locais.length > 0 ||
      res.empresas.length > 0 ||
      res.agencias.length > 0 ||
      res.midias.length > 0
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            AntiVerso Lore Machine
          </div>
          <div className="text-[11px] text-neutral-600">
            /lore-upload – Alimentar o catálogo com novos documentos
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="/"
            className="text-[11px] px-3 py-1 rounded-full border border-neutral-800 text-neutral-400 hover:text-emerald-300 hover:border-emerald-500 transition-colors"
          >
            Voltar ao chat
          </a>
          <a
            href="/lore-admin"
            className="text-[11px] px-3 py-1 rounded-full border border-neutral-800 text-neutral-400 hover:text-emerald-300 hover:border-emerald-500 transition-colors"
          >
            Admin
          </a>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-[11px] text-red-400 bg-red-950/40 border-b border-red-900">
          {error}
        </div>
      )}

      {isLoadingWorlds && (
        <div className="px-4 py-1 text-[11px] text-neutral-500 border-b border-neutral-900">
          Carregando Mundos…
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        {/* Coluna esquerda: formulário */}
        <section className="w-[38rem] border-r border-neutral-800 p-4 flex flex-col gap-3">
          <div className="text-[11px] text-neutral-400">
            Use esta tela para enviar um roteiro ou texto longo. A Lore Machine
            vai{" "}
            <span className="text-neutral-200">
              sugerir fichas para Personagens, Locais, Empresas, Agências e
              Mídias
            </span>{" "}
            com base no conteúdo.
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 border border-neutral-800 rounded-lg p-3 bg-neutral-950/70"
          >
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Mundo de destino
              </label>
              <select
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={selectedWorldId}
                onChange={(e) => setSelectedWorldId(e.target.value)}
              >
                {worlds.length === 0 && (
                  <option value="">Nenhum Mundo cadastrado</option>
                )}
                {worlds.length > 0 &&
                  worlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-neutral-500">
                Ex: Arquivos Vermelhos, A Sala, Evangelho de Or…
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Nome do documento
              </label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Ex: AV1 – Roteiro completo, versão 1"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Texto do documento
              </label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[260px]"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Cole aqui o texto completo do roteiro, cena ou documento…"
              />
              <p className="text-[10px] text-neutral-500">
                Versão inicial aceita apenas texto colado. Depois podemos
                evoluir para upload de PDF/DOCX.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRawText("");
                  setResult(null);
                  setError(null);
                }}
                disabled={isProcessing}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-4 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:opacity-60"
              >
                {isProcessing
                  ? "Processando com a Lore Machine…"
                  : "Processar texto"}
              </button>
            </div>
          </form>

          <div className="text-[10px] text-neutral-500">
            Nada é salvo automaticamente. A tela à direita mostra uma{" "}
            <span className="text-neutral-300">
              prévia das fichas sugeridas
            </span>{" "}
            para depois você aprovar e salvar via Admin (próxima etapa).
          </div>
        </section>

        {/* Coluna direita: prévia dos resultados */}
        <section className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Prévia das fichas sugeridas
          </h2>

          {!result && (
            <div className="text-[11px] text-neutral-600">
              Envie um texto pela coluna da esquerda para ver aqui as fichas
              sugeridas.
            </div>
          )}

          {result && !hasAnyResult(result) && (
            <div className="text-[11px] text-neutral-500 border border-neutral-800 rounded-lg p-3 bg-neutral-950/60">
              A Lore Machine leu o texto, mas não encontrou entidades claras
              para criar fichas. Você pode ajustar o texto ou tentar outro
              documento.
            </div>
          )}

          {result && hasAnyResult(result) && (
            <div className="flex-1 overflow-auto space-y-3 pr-1">
              <ResultSection
                title="Personagens"
                items={result.personagens}
                color="text-emerald-300"
              />
              <ResultSection
                title="Locais"
                items={result.locais}
                color="text-sky-300"
              />
              <ResultSection
                title="Empresas"
                items={result.empresas}
                color="text-amber-300"
              />
              <ResultSection
                title="Agências"
                items={result.agencias}
                color="text-fuchsia-300"
              />
              <ResultSection
                title="Mídias"
                items={result.midias}
                color="text-rose-300"
              />

              <div className="text-[10px] text-neutral-500 border-t border-neutral-800 pt-2 mt-2">
                Próximo passo (em desenvolvimento): aprovar/ajustar essas
                fichas e salvá-las automaticamente nas tabelas{" "}
                <span className="text-neutral-300">fichas</span> e{" "}
                <span className="text-neutral-300">codes</span>.
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ResultSection({
  title,
  items,
  color,
}: {
  title: string;
  items: ExtractedItem[];
  color: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="border border-neutral-800 rounded-lg bg-neutral-950/60">
      <div className="px-3 py-2 border-b border-neutral-900 flex items-center justify-between">
        <div className={`text-[11px] uppercase tracking-[0.18em] ${color}`}>
          {title}
        </div>
        <div className="text-[10px] text-neutral-500">
          {items.length} ficha(s) sugerida(s)
        </div>
      </div>
      <div className="max-h-[260px] overflow-auto divide-y divide-neutral-900">
        {items.map((item, idx) => (
          <div key={idx} className="px-3 py-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-neutral-100">{item.titulo}</div>
              {item.aparece_em && (
                <div className="text-[9px] text-neutral-500">
                  Aparece em:{" "}
                  <span className="text-neutral-300">{item.aparece_em}</span>
                </div>
              )}
            </div>
            {item.resumo && (
              <div className="text-[10px] text-neutral-400">{item.resumo}</div>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="text-[9px] text-neutral-500">
                Tags:{" "}
                <span className="text-neutral-300">
                  {item.tags.join(", ")}
                </span>
              </div>
            )}
            {(item.ano_diegese || item.ordem_cronologica) && (
              <div className="text-[9px] text-neutral-500 flex gap-3">
                {item.ano_diegese && (
                  <span>
                    Ano diegese:{" "}
                    <span className="text-neutral-300">
                      {String(item.ano_diegese)}
                    </span>
                  </span>
                )}
                {item.ordem_cronologica && (
                  <span>
                    Ordem cronológica:{" "}
                    <span className="text-neutral-300">
                      {String(item.ordem_cronologica)}
                    </span>
                  </span>
                )}
              </div>
            )}
            {item.codes && item.codes.length > 0 && (
              <div className="text-[9px] text-neutral-500">
                Códigos sugeridos:{" "}
                <span className="text-neutral-300">
                  {item.codes.join(", ")}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
