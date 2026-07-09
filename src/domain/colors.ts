import type { MovStatus, Nivel, Prioridade, TipoCod } from "../types/domain";

const TIPO_COLOR: Record<string, string> = {
  ADM: "#2f8f6b",
  PRO: "#56A4BB",
  SAL: "#5F88A1",
  TRF: "#2c6679",
  FUN: "#3d8499",
  DES: "#c0584e",
  NOV: "#1f4e5e",
  AFA: "#c08a2e",
};

export function tipoColor(cod: TipoCod | string): string {
  return TIPO_COLOR[cod] || "#56A4BB";
}

export interface StatusMeta {
  bg: string;
  fg: string;
  dot: string;
  label: string;
}

export function statusMeta(status: MovStatus | string): StatusMeta {
  if (status === "Aprovado") return { bg: "#e4f3ed", fg: "#1f6b4f", dot: "#2f8f6b", label: "Aprovado" };
  if (status === "Concluído") return { bg: "#e3f0f4", fg: "#2c6679", dot: "#56A4BB", label: "Concluído" };
  if (status === "Reprovado") return { bg: "#f8e7e4", fg: "#99413a", dot: "#c0584e", label: "Reprovado" };
  if (status === "Rascunho") return { bg: "#eef2f4", fg: "#6b7780", dot: "#a8b4ba", label: "Rascunho" };
  return { bg: "#f8efdc", fg: "#8a5e18", dot: "#c08a2e", label: "Em aprovação" };
}

export interface PrioMeta {
  bg: string;
  fg: string;
}

export function prioMeta(p: Prioridade | string): PrioMeta {
  if (p === "Alta") return { bg: "#f8e7e4", fg: "#99413a" };
  if (p === "Baixa") return { bg: "#eef2f4", fg: "#6b7780" };
  return { bg: "#f0f5f7", fg: "#5f7682" };
}

const NIVEL_META: Record<string, PrioMeta> = {
  Diretoria: { bg: "#1f4e5e", fg: "#fff" },
  Gerência: { bg: "#2c6679", fg: "#fff" },
  Liderança: { bg: "#e3f0f4", fg: "#2c6679" },
  Especialista: { bg: "#d6f4f7", fg: "#2c6679" },
  Analista: { bg: "#eef5f7", fg: "#51606b" },
  Técnico: { bg: "#eef5f7", fg: "#51606b" },
  Operacional: { bg: "#f6fafb", fg: "#6b7780" },
  "Aprendiz / Estágio": { bg: "#f8efdc", fg: "#8a5e18" },
};

export function nivelMeta(nivel: Nivel | string): PrioMeta {
  return NIVEL_META[nivel] || NIVEL_META.Operacional;
}
