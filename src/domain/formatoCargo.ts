const PALAVRAS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o", "ou"]);
const SIGLAS = new Set(["ti", "kam", "ceo", "rh", "erp", "crm", "kpi", "mtbf", "mttr", "esg", "cmms"]);

/** Exibe nomes de cargo cadastrados em CAIXA ALTA como Title Case (PT-BR),
 * preservando siglas conhecidas e nomes que já vieram em mixed-case do
 * cadastro original (ex.: "Assistente Op. de Vendas"). */
export function formatarNomeCargo(nome: string): string {
  if (!nome) return nome;
  if (nome !== nome.toLocaleUpperCase("pt-BR")) return nome;

  return nome
    .split(" ")
    .map((palavra, i) => transformarPalavra(palavra, i === 0))
    .join(" ");
}

function transformarPalavra(palavra: string, primeira: boolean): string {
  const m = palavra.match(/^([^\p{L}]*)(\p{L}[\p{L}'-]*)?([^\p{L}]*)$/u);
  if (!m || !m[2]) return palavra;
  const [, antes, nucleo, depois] = m;
  const nucleoMin = nucleo.toLocaleLowerCase("pt-BR");

  let novoNucleo: string;
  if (SIGLAS.has(nucleoMin)) {
    novoNucleo = nucleo.toLocaleUpperCase("pt-BR");
  } else if (!primeira && PALAVRAS_MINUSCULAS.has(nucleoMin)) {
    novoNucleo = nucleoMin;
  } else {
    novoNucleo = nucleoMin.charAt(0).toLocaleUpperCase("pt-BR") + nucleoMin.slice(1);
  }
  return antes + novoNucleo + depois;
}
