const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function formatarDataAtual(d: Date = new Date()): string {
  return String(d.getDate()).padStart(2, "0") + "/" + MESES[d.getMonth()] + "/" + d.getFullYear();
}

/** Data de hoje em ISO ("aaaa-mm-dd") — usado para comparar com "Data prevista"
 * de movimentações (atualizacaoInfo.dataPrevistaIso), que também vem em ISO. */
export function hojeIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatarHoraAtual(d: Date = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/** Converte uma data ISO ("yyyy-mm-dd", como vem do Postgres) para o formato "dd/mmm/aaaa" usado no resto do app. */
export function formatarDataIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  const mesIdx = parseInt(mes, 10) - 1;
  if (!ano || !dia || Number.isNaN(mesIdx) || !MESES[mesIdx]) return "—";
  return `${dia}/${MESES[mesIdx]}/${ano}`;
}

/** Converte "dd/mmm/aaaa" (formato usado no app, ver formatarDataIso) para o bucket "aaaa-mm" —
 * usado para agrupar por mês (ex.: gráfico de custos de rescisão no Dashboard). */
export function mesIsoFromDataBr(dataBr: string | null | undefined): string | null {
  if (!dataBr) return null;
  const [, mesAbrev, ano] = dataBr.split("/");
  const mesIdx = MESES.indexOf((mesAbrev ?? "").toLowerCase());
  if (!ano || mesIdx < 0) return null;
  return `${ano}-${String(mesIdx + 1).padStart(2, "0")}`;
}

/** Rótulo curto para exibição em gráfico (ex.: "Jul/26") a partir de um bucket "aaaa-mm". */
export function mesLabel(mesIso: string): string {
  const [ano, mes] = mesIso.split("-");
  const idx = parseInt(mes, 10) - 1;
  return `${MESES_LABEL[idx] ?? mes}/${ano.slice(2)}`;
}

/** Tempo decorrido desde a admissão (ISO "yyyy-mm-dd", como vem do Postgres) até hoje, em texto
 * ("2 anos e 3 meses", "8 meses", "12 dias"...). `hoje` é injetável só para facilitar teste. */
export function tempoDeEmpresa(iso: string | null | undefined, hoje: Date = new Date()): string {
  if (!iso) return "—";
  const [anoStr, mesStr, diaStr] = iso.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIdx = parseInt(mesStr, 10) - 1;
  const dia = parseInt(diaStr, 10);
  if (Number.isNaN(ano) || Number.isNaN(mesIdx) || Number.isNaN(dia)) return "—";
  const admissao = new Date(ano, mesIdx, dia);

  let anos = hoje.getFullYear() - admissao.getFullYear();
  let meses = hoje.getMonth() - admissao.getMonth();
  let dias = hoje.getDate() - admissao.getDate();

  if (dias < 0) {
    meses -= 1;
    dias += new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }

  if (anos < 0 || (anos === 0 && meses === 0 && dias <= 0)) return "Menos de 1 dia";

  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  if (partes.length > 0) return partes.join(" e ");

  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}
