// Exportação CSV (Etapa 8) — zero dependências, mesmo padrão zero-lib já
// usado em componentes como BarChart.tsx. "Excel" abre CSV nativamente; PDF
// é resolvido à parte via window.print() (ver AppShell.module.css/Header.module.css).

export interface SecaoCsv {
  titulo: string;
  colunas: string[];
  linhas: (string | number)[][];
}

/** Escapa um campo conforme RFC4180 — qualquer valor contendo vírgula, aspas
 * ou quebra de linha é envolvido em aspas duplas, com aspas internas
 * duplicadas. Sem isso, nomes de competência/KPI (texto livre, podem
 * plausivelmente conter vírgula) corromperiam silenciosamente o CSV. */
function escaparCampoCsv(valor: string | number): string {
  const texto = String(valor);
  if (texto.includes(",") || texto.includes('"') || texto.includes("\n") || texto.includes("\r")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function linhaCsv(campos: (string | number)[]): string {
  return campos.map(escaparCampoCsv).join(",");
}

/** Concatena várias seções (cada uma com seu próprio cabeçalho de colunas)
 * num único CSV, separadas por linha em branco — usado pelos 3 dashboards
 * pra exportar todos os blocos de uma vez. */
export function gerarCsv(secoes: SecaoCsv[]): string {
  return secoes
    .map((secao) => [linhaCsv([secao.titulo]), linhaCsv(secao.colunas), ...secao.linhas.map(linhaCsv)].join("\n"))
    .join("\n\n");
}

/** Blob + URL.createObjectURL + `<a>` temporário — padrão zero-dependência
 * de download client-side, sem nenhuma lib nova. */
export function baixarArquivo(conteudo: string, nome: string, tipo: string): void {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
