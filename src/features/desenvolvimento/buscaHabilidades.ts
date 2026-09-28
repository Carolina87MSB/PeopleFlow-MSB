// Busca tolerante no Catálogo de Habilidades Técnicas e detecção de possíveis duplicidades.
// Regras puras (testadas isoladamente): ignora maiúsculas/minúsculas, acentuação, plural
// simples e pequenos erros de digitação; aceita busca parcial.

export interface ItemCatalogo {
  id: number;
  nome: string;
  descricao?: string;
  categoria?: string | null;
}

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o", "as", "os", "no", "na", "nos", "nas", "ou", "por",
  "conhecimento", "conhecimentos", "nocao", "nocoes", "dominio", "experiencia", "basico", "basica", "basicos", "avancado", "intermediario",
]);

function raiz(p: string): string {
  // plural/sufixos simples: "compras" ~ "compra", "processos" ~ "processo", "fornecedores" ~ "fornecedor"
  return p.replace(/(oes|aes|es|s)$/, "").slice(0, 7);
}

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function palavraCasa(token: string, palavra: string): boolean {
  if (palavra.startsWith(token) || (token.length >= 4 && palavra.includes(token))) return true;
  if (raiz(token).length >= 4 && raiz(palavra) === raiz(token)) return true;
  const limite = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;
  return limite > 0 && distancia(token, palavra) <= limite;
}

function palavras(item: ItemCatalogo): string[] {
  return normalizar(`${item.nome} ${item.categoria ?? ""}`).split(" ").filter(Boolean);
}

/** Todos os termos digitados precisam casar com alguma palavra do nome/categoria. */
export function buscarHabilidades<T extends ItemCatalogo>(catalogo: T[], termo: string): T[] {
  const tokens = normalizar(termo).split(" ").filter((t) => t && !VAZIAS.has(t));
  if (tokens.length === 0) return catalogo;
  return catalogo.filter((h) => {
    const ps = palavras(h);
    return tokens.every((t) => ps.some((p) => palavraCasa(t, p)));
  });
}

/** Possíveis correspondências para um nome sugerido: basta compartilhar um termo significativo. */
export function possiveisCorrespondencias<T extends ItemCatalogo>(catalogo: T[], nome: string, limite = 6): T[] {
  const tokens = normalizar(nome).split(" ").filter((t) => t.length >= 3 && !VAZIAS.has(t));
  if (tokens.length === 0) return [];
  return catalogo
    .map((h) => {
      const ps = palavras(h);
      const pontos = tokens.filter((t) => ps.some((p) => palavraCasa(t, p))).length;
      return { h, pontos };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.h.nome.localeCompare(b.h.nome, "pt-BR"))
    .slice(0, limite)
    .map((x) => x.h);
}

export function mesmoNome(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}
