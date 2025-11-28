// ============================================
// ARQUIVO: lib/generate-prefix.ts
// ============================================
// Gera prefixo automaticamente baseado no nome da categoria

export function generatePrefix(categoryName: string): string {
  // Remove acentos e caracteres especiais
  const normalized = categoryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  // Remove palavras comuns (artigos, preposições)
  const stopWords = ["DE", "DA", "DO", "DAS", "DOS", "E", "OU", "A", "O"];
  const words = normalized
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0 && !stopWords.includes(w));

  if (words.length === 0) {
    return "XX";
  }

  // Estratégias de geração de prefixo
  if (words.length === 1) {
    // Uma palavra: pega as 2 primeiras letras
    const word = words[0];
    return word.length >= 2 ? word.substring(0, 2) : word + "X";
  } else if (words.length === 2) {
    // Duas palavras: primeira letra de cada
    return words[0][0] + words[1][0];
  } else {
    // Três ou mais palavras: primeira letra das 2 primeiras palavras
    return words[0][0] + words[1][0];
  }
}

// Exemplos de uso:
// generatePrefix("Personagem") → "PE"
// generatePrefix("Livros de Bruxaria") → "LB"
// generatePrefix("Regra de Mundo") → "RM"
// generatePrefix("Cores") → "CO"
// generatePrefix("Números Mágicos") → "NM"
