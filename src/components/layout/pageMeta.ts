export interface PageMeta {
  eyebrow: string;
  title: string;
}

const PAGE_META: Record<string, PageMeta> = {
  dashboard: { eyebrow: "Visão geral", title: "Dashboard gerencial" },
  colaboradores: { eyebrow: "Gestão de pessoas", title: "Colaboradores" },
  departamentos: { eyebrow: "Gestão de pessoas", title: "Departamentos" },
  cargos: { eyebrow: "Gestão de pessoas", title: "Cargos" },
  desligados: { eyebrow: "Gestão de pessoas", title: "Desligados" },
  "movimentacoes/nova": { eyebrow: "Movimentações de pessoal", title: "Nova Movimentação" },
  aprovadas: { eyebrow: "Movimentações de pessoal", title: "Movimentações aprovadas" },
  historico: { eyebrow: "Movimentações de pessoal", title: "Histórico" },
  workflow: { eyebrow: "Movimentações de pessoal", title: "Workflow de aprovação" },
  avaliacoes: { eyebrow: "Desenvolvimento", title: "Avaliações de experiência" },
  desempenho: { eyebrow: "Desenvolvimento", title: "Gestão de Desempenho" },
  desenvolvimento: { eyebrow: "Desenvolvimento", title: "Desenvolvimento" },
  "desenvolvimento/habilidades": { eyebrow: "Desenvolvimento", title: "Habilidades e Requisitos" },
  "desenvolvimento/lnt": { eyebrow: "Desenvolvimento", title: "Necessidades de Desenvolvimento" },
  "desenvolvimento/treinamentos": { eyebrow: "Desenvolvimento", title: "Treinamentos" },
  "desenvolvimento/treinamento": { eyebrow: "Desenvolvimento", title: "Treinamento" },
  acessos: { eyebrow: "Administração do sistema", title: "Acessos" },
};

/** Procura primeiro "segmento/subsegmento" (só o módulo Desenvolvimento usa)
 * e cai no 1º segmento — o mesmo comportamento de sempre para as demais telas. */
export function pageMetaFromPath(pathname: string): PageMeta {
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[0] ?? "dashboard";
  return PAGE_META[`${segment}/${segments[1] ?? ""}`] ?? PAGE_META[segment] ?? PAGE_META.dashboard;
}
