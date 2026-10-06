// Rótulos, textos e pequenas regras de apresentação da tela da LNT.
// Sem acesso a dados: só traduz vocabulário técnico (situações, direcionadores, erros) para a linguagem do RH.

import { DIRECIONADORES, type Direcionador, type PendenciaFechamento, type SituacaoItem, type StatusCiclo } from "../../domain/lnt";
import { STATUS_NECESSIDADE, type Tom } from "./rotulos";
import type { NecessidadeNoCicloComViva } from "./lntRepository";
import type { PessoaDesenvolvimento } from "./devRepository";

export const ROTULO_STATUS_CICLO: Record<StatusCiclo, { rotulo: string; tom: Tom }> = {
  em_elaboracao: { rotulo: "Em elaboração", tom: "info" },
  fechada: { rotulo: "Fechada", tom: "neutral" },
};

export const ROTULO_SITUACAO_ITEM: Record<SituacaoItem, { rotulo: string; tom: Tom }> = {
  em_analise: { rotulo: "Em análise", tom: "warning" },
  incluido: { rotulo: "Incluído", tom: "success" },
  nao_priorizado: { rotulo: "Não priorizado", tom: "neutral" },
};

export const ROTULO_DIRECIONADOR: Record<Direcionador, string> = Object.fromEntries(DIRECIONADORES.map((d) => [d.valor, d.rotulo])) as Record<Direcionador, string>;

export const TEXTO_DEMANDA_DIRETA = "Demanda estratégica/direta";

export const ROTULO_STATUS_NA_CARGA: Record<"validada" | "planejada", string> = { validada: "Validada", planejada: "Planejada" };

export const ROTULO_CAMPO_MUDANCA: Record<string, string> = {
  status: "Situação",
  prioridade: "Prioridade",
  departamento: "Departamento",
  descricao: "Descrição",
  justificativa: "Justificativa",
  sugestao_capacitacao: "Sugestão de capacitação",
  colaborador_desligado: "Colaborador desligado",
};

export const ROTULO_EVENTO: Record<string, string> = {
  lnt_ciclo_criado: "LNT criada",
  lnt_candidatas_carregadas: "Candidatas carregadas",
  lnt_candidatas_atualizadas: "Candidatas atualizadas",
  lnt_item_criado: "Item criado",
  lnt_item_editado: "Item editado",
  lnt_necessidades_consolidadas: "Necessidades consolidadas",
  lnt_consolidacao_desfeita: "Consolidação desfeita",
  lnt_prioridade_alterada: "Prioridade alterada",
  lnt_item_incluido: "Item incluído na LNT",
  lnt_item_nao_priorizado: "Item não priorizado",
  lnt_necessidade_nao_priorizada: "Necessidade não priorizada",
  lnt_necessidade_reconsiderada: "Necessidade reconsiderada",
  lnt_ciclo_fechado: "LNT fechada",
  lnt_ciclo_reaberto: "LNT reaberta",
};

const PLURAL = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Frase do impedimento de fechamento, na linguagem do RH. */
export function textoPendencia(p: PendenciaFechamento): string {
  const n = p.quantidade;
  switch (p.codigo) {
    case "candidatas_sem_decisao":
      return `${PLURAL(n, "Existe", "Existem")} ${n} ${PLURAL(n, "necessidade aguardando decisão", "necessidades aguardando decisão")}.`;
    case "itens_em_analise":
      return `${PLURAL(n, "Existe", "Existem")} ${n} ${PLURAL(n, "item ainda em análise", "itens ainda em análise")}.`;
    case "itens_incluidos_sem_necessidade":
      return `${PLURAL(n, "Existe", "Existem")} ${n} ${PLURAL(n, "item incluído sem nenhuma necessidade", "itens incluídos sem nenhuma necessidade")}.`;
  }
}

/** Valor legível de um campo que mudou depois da carga. */
export function textoDoValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "status") return STATUS_NECESSIDADE[valor as keyof typeof STATUS_NECESSIDADE]?.rotulo ?? String(valor);
  if (campo === "prioridade") return ({ alta: "Alta", media: "Média", baixa: "Baixa" } as Record<string, string>)[String(valor)] ?? String(valor);
  if (campo === "colaborador_desligado") return valor ? "Sim" : "Não";
  return String(valor);
}

/** Pessoa ou cargo a que a necessidade se refere. */
export function quemEhANecessidade(l: NecessidadeNoCicloComViva, pessoaPorId: Map<number, PessoaDesenvolvimento>): string {
  const v = l.viva;
  if (v?.colaborador_id) return pessoaPorId.get(v.colaborador_id)?.nome ?? `Colaborador #${v.colaborador_id}`;
  return v?.cargo_nome ? `Cargo ${v.cargo_nome}` : "—";
}

/**
 * Converte a mensagem do servidor/banco em texto compreensível. As mensagens do servidor da LNT já são
 * em português e voltadas ao RH; aqui só tiramos o jargão do banco e tratamos falhas de rede e de sessão.
 */
export function mensagemDeErro(e: unknown): string {
  const bruta = e instanceof Error ? e.message : String(e ?? "");
  if (!bruta) return "Não foi possível concluir. Tente novamente.";
  if (/failed to fetch|networkerror|load failed/i.test(bruta)) return "Sem conexão com o servidor. Verifique a internet e tente novamente.";
  if (/violates|constraint|duplicate key|row-level security|permission denied/i.test(bruta)) return "Não foi possível salvar: os dados não atendem a uma regra da LNT. Confira os campos e tente novamente.";
  const semBanco = bruta.replace(/\s*\((?:[^()]*(?:violates|constraint|check)[^()]*)\)/gi, "");
  if (/^Falha ao salvar \(\d+\)\.?$/.test(semBanco)) return "Não foi possível salvar. Tente novamente em instantes.";
  return semBanco;
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [a, m, dia] = d.split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : iso;
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function resumoDirecionadores(d: Direcionador[]): string {
  if (d.length === 0) return "—";
  const nomes = d.map((x) => ROTULO_DIRECIONADOR[x]);
  return nomes.length > 2 ? `${nomes.slice(0, 2).join(", ")} +${nomes.length - 2}` : nomes.join(", ");
}
