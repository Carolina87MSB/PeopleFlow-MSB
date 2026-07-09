const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatarDataAtual(d: Date = new Date()): string {
  return String(d.getDate()).padStart(2, "0") + "/" + MESES[d.getMonth()] + "/" + d.getFullYear();
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
