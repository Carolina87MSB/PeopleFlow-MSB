const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatarDataAtual(d: Date = new Date()): string {
  return String(d.getDate()).padStart(2, "0") + "/" + MESES[d.getMonth()] + "/" + d.getFullYear();
}

export function formatarHoraAtual(d: Date = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
