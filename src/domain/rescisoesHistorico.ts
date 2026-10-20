// Histórico de rescisões da folha (tabela `peopleflow_rescisoes_historico`) para os INDICADORES de pessoas — funções puras.
//
// Dois tipos de linha:
//  • "saida_efetiva"         → a pessoa deixou a empresa. Se ela NÃO tem cadastro em `colaboradores`, o histórico completa o
//                              quadro (headcount, desligamentos, turnover). Se tem cadastro, ela é contada PELO CADASTRO (nunca duas vezes).
//  • "conversao_estagio_clt" → encerramento de estágio com efetivação: a pessoa CONTINUA na empresa. Não é saída, não é nova admissão de
//                              pessoa; só entra no indicador de "rescisões contratuais" e preserva a continuidade do vínculo
//                              (a admissão efetiva para indicadores é a do estágio). Nunca altera MPs nem datas do cadastro.

import type { Colaborador } from "../types/domain.js";

export type NaturezaRescisao = "saida_efetiva" | "conversao_estagio_clt";

export interface RescisaoHistorica {
  id: number;
  codigoFolha: number;
  nome: string;
  nomeNormalizado: string;
  admissaoIso: string;
  demissaoIso: string;
  tipoRescisao: string;
  departamento: string | null;
  natureza: NaturezaRescisao;
  efetivacaoEmIso: string | null;
  colaboradorId: number | null;
  /** Data de emissão do relatório da folha de onde a linha foi importada (só o servidor preenche; usada para identificar a origem dos valores). */
  relatorioEmitidoEmIso?: string | null;
}

/** Mesma regra de peopleflow_dev_normalizar_nome (SQL): minúsculas, sem acentos, espaços colapsados e aparados. */
export function normalizarNomeHistorico(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ \t\n\v\f\r ]+/g, " ")
    .trim();
}

/** Histórico já separado e livre de dupla contagem, pronto para os indicadores. */
export interface HistoricoPreparado {
  /** Saídas efetivas de quem NÃO tem cadastro — completam o quadro. */
  saidasSemCadastro: RescisaoHistorica[];
  /** Encerramentos de estágio com efetivação (a pessoa continua ativa). */
  conversoes: RescisaoHistorica[];
  /** Saídas efetivas que já estão no cadastro (contadas pelo cadastro, ignoradas aqui para não duplicar). */
  jaNoCadastro: RescisaoHistorica[];
}

export const HISTORICO_VAZIO: HistoricoPreparado = { saidasSemCadastro: [], conversoes: [], jaNoCadastro: [] };

/**
 * Separa o histórico. `todosOsColaboradores` precisa ser o cadastro COMPLETO (não o recorte de um filtro), senão uma pessoa
 * cadastrada mas filtrada seria contada de novo pelo histórico.
 * Saída efetiva é "já no cadastro" quando a linha tem `colaboradorId` OU existe cadastro com o mesmo nome (normalizado) e a mesma admissão.
 */
export function prepararHistorico(historico: RescisaoHistorica[], todosOsColaboradores: Pick<Colaborador, "id" | "nome" | "admissaoIso">[]): HistoricoPreparado {
  const chaves = new Set(todosOsColaboradores.map((c) => `${normalizarNomeHistorico(c.nome)}|${c.admissaoIso}`));
  const out: HistoricoPreparado = { saidasSemCadastro: [], conversoes: [], jaNoCadastro: [] };
  for (const h of historico) {
    if (h.natureza === "conversao_estagio_clt") out.conversoes.push(h);
    else if (h.colaboradorId !== null || chaves.has(`${h.nomeNormalizado}|${h.admissaoIso}`)) out.jaNoCadastro.push(h);
    else out.saidasSemCadastro.push(h);
  }
  return out;
}

export interface FiltrosHistorico {
  setor: string;
  gestor: string;
  cargo: string;
}

/**
 * Aplica ao histórico os mesmos filtros do Dashboard:
 *  • saídas sem cadastro só têm setor (mapeado do centro de custo) — com filtro de gestor ou cargo ativo não há como atribuí-las, ficam de fora;
 *  • conversões seguem a pessoa: entram quando a pessoa (por id) está no recorte já filtrado.
 */
export function filtrarHistorico(h: HistoricoPreparado, filtros: FiltrosHistorico, colaboradoresFiltrados: Pick<Colaborador, "id">[], incluirSemCadastro: boolean): HistoricoPreparado {
  const ids = new Set(colaboradoresFiltrados.map((c) => c.id));
  const semAtributoInalcancavel = filtros.gestor !== "Todos" || filtros.cargo !== "Todos";
  return {
    saidasSemCadastro: !incluirSemCadastro || semAtributoInalcancavel ? [] : h.saidasSemCadastro.filter((r) => filtros.setor === "Todos" || r.departamento === filtros.setor),
    conversoes: h.conversoes.filter((r) => r.colaboradorId !== null && ids.has(r.colaboradorId)),
    jaNoCadastro: h.jaNoCadastro,
  };
}
