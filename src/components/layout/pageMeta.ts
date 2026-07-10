export interface PageMeta {
  eyebrow: string;
  title: string;
}

const PAGE_META: Record<string, PageMeta> = {
  dashboard: { eyebrow: "Visão geral", title: "Dashboard gerencial" },
  colaboradores: { eyebrow: "Cadastro", title: "Colaboradores" },
  departamentos: { eyebrow: "Cadastro", title: "Departamentos" },
  cargos: { eyebrow: "Cadastro", title: "Cargos" },
  tipos: { eyebrow: "Cadastro", title: "Tipos de movimentação" },
  acessos: { eyebrow: "Cadastro", title: "Acessos" },
  workflow: { eyebrow: "Operação", title: "Workflow de aprovação" },
  aprovadas: { eyebrow: "Operação", title: "Movimentações aprovadas" },
  historico: { eyebrow: "Operação", title: "Histórico" },
};

export function pageMetaFromPath(pathname: string): PageMeta {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return PAGE_META[segment] ?? PAGE_META.dashboard;
}
