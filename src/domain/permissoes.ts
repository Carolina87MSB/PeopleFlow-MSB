import type { Movimentacao, Perfil } from "../types/domain";

/** Todos os perfis acessam a tela Colaboradores — RH edita, Gestor e
 * Diretoria são só leitura (ver colaboradoresListagem em usePortalData.ts). */
export function navColab(_perfil: Perfil): boolean {
  return true;
}

export function navRegistro(perfil: Perfil): boolean {
  return perfil === "RH";
}

/** Cargos (`/cargos`) é RH-only pra Departamentos/Acessos/Desligados/Gestão
 * de Desempenho (ver navRegistro), mas Gestor e Diretoria também precisam
 * entrar: Gestor pra editar a Descrição de Cargo dos cargos sob sua
 * liderança (a lista em si já vem escopada, ver colaboradoresVisiveis em
 * usePortalData.ts, então liberar a rota não expõe cargos fora da árvore de
 * reportes do Gestor); Diretoria pra revisar/aprovar/rejeitar alterações
 * propostas por qualquer Gestor (vê a lista inteira, sem escopo, igual RH). */
export function navCargos(perfil: Perfil): boolean {
  return perfil === "RH" || perfil === "Gestor" || perfil === "Diretoria";
}

/**
 * RH, Gestor e Diretoria podem solicitar movimentações — Diretor Industrial e
 * CEO também têm reportes diretos (aparecem na coluna `gestor` de algum
 * colaborador) e precisam do botão "Nova movimentação" para essas pessoas,
 * não só o papel de aprovar etapas de outros.
 */
export function canCreate(perfil: Perfil): boolean {
  return perfil === "RH" || perfil === "Gestor" || perfil === "Diretoria";
}

export function showEquipes(perfil: Perfil): boolean {
  return perfil !== "Diretoria";
}

/**
 * Mirrors the prototype's canSeeMov(): RH sees everything, Diretoria only
 * what it must approve, Gestor only their scope. `verTudo` é a exceção do
 * Diretor Industrial (ver ehDiretorIndustrial() em hierarquia.ts) — visão
 * total do Workflow e de Aprovadas, só leitura (não muda podeAgir()).
 */
export function canSeeMov(
  m: Movimentacao,
  perfil: Perfil,
  me: string,
  scopeSet: Set<string> | null,
  verTudo = false,
): boolean {
  if (perfil === "RH" || verTudo) return true;
  if (perfil === "Diretoria") {
    // Além do que precisa aprovar, também precisa ver o que ela mesma
    // solicitou (agora que Diretoria também pode criar movimentação — ver
    // canCreate) — nem toda movimentação que ela cria tem "Diretor
    // Industrial"/"CEO" como aprovador de alguma etapa (ex.: tipos sem CEO na
    // matriz), então sem isso a própria solicitação sumiria da tela dela.
    return m.solicitante === me || (m.status !== "Rascunho" && m.etapas.some((e) => e.aprovador === me));
  }
  return (scopeSet !== null && scopeSet.has(m.colaborador)) || m.solicitante === me || m.etapas.some((e) => e.aprovador === me);
}

/** Valor salarial é informação sensível — RH/Diretoria/Gestor veem o valor em
 * qualquer tela que precise exibi-lo fora do fluxo de aprovação da própria
 * movimentação (ex.: evento "Alteração salarial" na Timeline de carreira do
 * colaborador, ver domain/timelineCarreira.ts, e o bloco Salário/Custo Mensal
 * Folha em ColaboradoresPage.tsx). Pedido da RH, 2026-09: Gestor passou a
 * enxergar salário/custo, mas só do próprio colaborador — não é uma regra
 * nova aqui, e sim consequência do escopo que `colaboradoresListagem` já
 * aplica pra Gestor (só quem tem ele como gestor imediato, ver
 * usePortalData.ts) nas duas únicas telas que chamam esta função. Só
 * Colaborador (perfil que ainda não existe no app) veria que o evento
 * existiu sem o valor, se um dia existir. */
export function podeVerSalario(perfil: Perfil): boolean {
  return perfil === "RH" || perfil === "Diretoria" || perfil === "Gestor";
}

export function filtrarColaboradoresPorEscopo<T extends { nome: string }>(
  colaboradores: T[],
  perfil: Perfil,
  scopeSet: Set<string> | null,
): T[] {
  if (perfil !== "Gestor" || !scopeSet) return colaboradores;
  return colaboradores.filter((c) => scopeSet.has(c.nome));
}
