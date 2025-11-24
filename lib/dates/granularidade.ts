// lib/dates/granularidade.ts

export type GranularidadeValue =
  | "dia"
  | "mes"
  | "ano"
  | "decada"
  | "seculo"
  | "vago"
  | "indefinido";

export type GranularidadeDef = {
  value: GranularidadeValue;
  label: string;
  description: string;
};

// Lista oficial de granularidades do AntiVerso
export const GRANULARIDADES: GranularidadeDef[] = [
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
    description:
      'Data narrativa ou imprecisa (ex: "há dez anos", "numa noite de quinta-feira").',
  },
  {
    value: "indefinido",
    label: "Desconhecido",
    description: "Nenhuma informação de data disponível.",
  },
];

const ALLOWED_VALUES = new Set<GranularidadeValue>([
  "dia",
  "mes",
  "ano",
  "decada",
  "seculo",
  "vago",
  "indefinido",
]);

/**
 * Normaliza a granularidade para um dos valores oficiais.
 *
 * Regras:
 * - Se raw já é um valor válido → mantém.
 * - Se raw está vazio e há descricao_data → "vago".
 * - Se raw está vazio e NÃO há descricao_data → "indefinido".
 * - Se raw tem qualquer outra coisa → "vago" (limpa lixo legado).
 */
export function normalizeGranularidade(
  raw: string | null | undefined,
  descricaoData?: string | null | undefined,
): GranularidadeValue {
  const trimmed = (raw ?? "").trim();

  if (trimmed && ALLOWED_VALUES.has(trimmed as GranularidadeValue)) {
    return trimmed as GranularidadeValue;
  }

  if (!trimmed) {
    if (descricaoData && descricaoData.trim().length > 0) {
      return "vago";
    }
    return "indefinido";
  }

  // Qualquer valor não padrão cai em "vago"
  return "vago";
}

export function labelGranularidade(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const found = GRANULARIDADES.find((g) => g.value === value);
  return found?.label ?? null;
}

export function descriptionGranularidade(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const found = GRANULARIDADES.find((g) => g.value === value);
  return found?.description ?? null;
}
