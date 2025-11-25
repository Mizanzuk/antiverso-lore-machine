"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type DuplicatePair = {
  id_a: string;
  titulo_a: string;
  tipo_a: string;
  id_b: string;
  titulo_b: string;
  tipo_b: string;
  similarity: number;
};

type FichaFull = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string | null;
  tipo: string;
  tags: string | null;
  aparece_em: string | null;
  // campos temporais
  ano_diegese: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  camada_temporal: string | null;
  descricao_data: string | null;
};

export default function ReconcilePage() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState<{ a: FichaFull; b: FichaFull } | null>(null);
  const [mergeDraft, setMergeDraft] = useState<FichaFull | null>(null);
  const [processing, setProcessing] = useState(false);

  // Carrega a lista de duplicatas ao abrir
  useEffect(() => {
    loadDuplicates();
  }, []);

  async function loadDuplicates() {
    setLoading(true);
    try {
      const res = await fetch("/api/lore/reconcile");
      const json = await res.json();
      if (json.duplicates) {
        setPairs(json.duplicates);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao buscar duplicatas.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPair(pair: DuplicatePair) {
    setLoading(true);
    try {
      // Buscar dados completos das duas fichas
      const { data: dataA } = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_a).single();
      const { data: dataB } = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_b).single();

      if (dataA && dataB) {
        setComparing({ a: dataA, b: dataB });
        // Por padrão, o rascunho começa igual à ficha A (arbitrário)
        setMergeDraft({ ...dataA });
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar detalhes das fichas.");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(field: keyof FichaFull, value: any) {
    if (!mergeDraft) return;
    setMergeDraft({ ...mergeDraft, [field]: value });
  }

  async function executeMerge(winnerOriginalId: string, loserOriginalId: string) {
    if (!mergeDraft || !confirm("Essa ação é irreversível. A ficha perdedora será apagada. Continuar?")) return;
    
    setProcessing(true);
    try {
      const res = await fetch("/api/lore/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winnerId: winnerOriginalId,
          loserId: loserOriginalId,
          mergedData: mergeDraft
        })
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      alert("Merge realizado com sucesso!");
      setComparing(null);
      setMergeDraft(null);
      loadDuplicates(); // Recarrega a lista
    } catch (err: any) {
      console.error(err);
      alert("Erro no merge: " + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Função auxiliar para renderizar botão de escolha
  const FieldChoice = ({ label, field }: { label: string; field: keyof FichaFull }) => {
    if (!comparing || !mergeDraft) return null;
    const valA = comparing.a[field];
    const valB = comparing.b[field];
    const current = mergeDraft[field];

    // Se forem iguais, não precisa escolher
    if (valA === valB) {
      return (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-zinc-500 mb-1">{label}</div>
          <div className="text-sm text-zinc-400 italic">Valores idênticos</div>
          <div className="p-2 bg-zinc-900/50 rounded border border-zinc-800 text-sm text-zinc-300 mt-1">
            {String(valA || "(vazio)")}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-4 p-3 bg-zinc-900/30 rounded border border-zinc-800">
        <div className="text-[10px] uppercase text-zinc-500 mb-2 flex justify-between">
          <span>{label} (Conflito)</span>
          <span className="text-emerald-500">Selecionado: {current === valA ? "A" : "B"}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateDraft(field, valA)}
            className={`text-left p-2 rounded border text-xs ${
              current === valA 
                ? "border-emerald-500 bg-emerald-900/20 text-emerald-100" 
                : "border-zinc-700 hover:bg-zinc-800 text-zinc-400"
            }`}
          >
            <span className="block font-bold mb-1 text-[10px] opacity-50">FICHA A</span>
            {String(valA || "(vazio)")}
          </button>

          <button
            onClick={() => updateDraft(field, valB)}
            className={`text-left p-2 rounded border text-xs ${
              current === valB
                ? "border-emerald-500 bg-emerald-900/20 text-emerald-100"
                : "border-zinc-700 hover:bg-zinc-800 text-zinc-400"
            }`}
          >
            <span className="block font-bold mb-1 text-[10px] opacity-50">FICHA B</span>
            {String(valB || "(vazio)")}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-black text-zinc-100 flex-col">
      <header className="h-12 border-b border-zinc-800 flex items-center px-4 justify-between bg-zinc-950">
        <div className="flex items-center gap-4 text-xs">
          <a href="/lore-admin" className="text-zinc-400 hover:text-white">← Voltar ao Admin</a>
          <span className="font-semibold text-zinc-100">Reconciliação de Fichas</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LISTA LATERAL */}
        <aside className="w-80 border-r border-zinc-800 bg-zinc-950 p-4 overflow-y-auto">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Possíveis Duplicatas</h2>
          {loading && <div className="text-xs text-zinc-500">Carregando...</div>}
          {!loading && pairs.length === 0 && <div className="text-xs text-zinc-500">Nenhuma duplicata encontrada.</div>}
          
          <div className="space-y-2">
            {pairs.map((pair, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectPair(pair)}
                className="w-full text-left p-3 rounded border border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/50 hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-emerald-400">{(pair.similarity * 100).toFixed(0)}% similar</span>
                </div>
                <div className="text-sm font-medium text-zinc-200">{pair.titulo_a}</div>
                <div className="text-[10px] text-zinc-500 my-1">vs</div>
                <div className="text-sm font-medium text-zinc-200">{pair.titulo_b}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* ÁREA DE COMPARAÇÃO */}
        <main className="flex-1 p-6 overflow-y-auto bg-black">
          {!comparing && (
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
              Selecione um par à esquerda para comparar e fundir.
            </div>
          )}

          {comparing && mergeDraft && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white mb-1">Resolvendo Conflito</h1>
                  <p className="text-xs text-zinc-400">Escolha os dados que deseja manter. A ficha final será salva e a outra excluída.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setComparing(null)}
                    className="px-4 py-2 rounded border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => executeMerge(comparing.a.id, comparing.b.id)}
                    disabled={processing}
                    className="px-6 py-2 rounded bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {processing ? "Fundindo..." : "Confirmar Fusão (Manter ID da A)"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <FieldChoice label="Título" field="titulo" />
                <FieldChoice label="Resumo" field="resumo" />
                <FieldChoice label="Conteúdo" field="conteudo" />
                <FieldChoice label="Tipo" field="tipo" />
                <FieldChoice label="Tags" field="tags" />
                <FieldChoice label="Aparece Em" field="aparece_em" />
                
                <div className="mt-6 pt-4 border-t border-zinc-800">
                  <h3 className="text-xs uppercase text-zinc-500 mb-4">Dados Temporais</h3>
                  <FieldChoice label="Descrição Data" field="descricao_data" />
                  <FieldChoice label="Ano Diegese" field="ano_diegese" />
                  <FieldChoice label="Camada Temporal" field="camada_temporal" />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
