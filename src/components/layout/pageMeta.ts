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
  desligados: { eyebrow: "Operação", title: "Desligados" },
  avaliacoes: { eyebrow: "Operação", title: "Avaliações de experiência" },
  desempenho: { eyebrow: "Cadastro", title: "Gestão de Desempenho" },
  desenvolvimento: { eyebrow: "Desenvolvimento", title: "Desenvolvimento" },
  "desenvolvimento/habilidades": { eyebrow: "Desenvolvimento", title: "Habilidades" },
  "desenvolvimento/lnt": { eyebrow: "Desenvolvimento", title: "Necessidades de Desenvolvimento" },
  "desenvolvimento/treinamentos": { eyebrow: "Desenvolvimento", title: "Treinamentos" },
  "desenvolvimento/treinamento": { eyebrow: "Desenvolvimento", title: "Treinamento" },
};

/** Procura primeiro "segmento/subsegmento" (só o módulo Desenvolvimento usa)
 * e cai no 1º segmento — o mesmo comportamento de sempre para as demais telas. */
export function pageMetaFromPath(pathname: string): PageMeta {
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[0] ?? "dashboard";
  return PAGE_META[`${segment}/${segments[1] ?? ""}`] ?? PAGE_META[segment] ?? PAGE_META.dashboard;
}
