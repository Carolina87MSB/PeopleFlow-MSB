// Datas, exclusões e vencimentos do período de experiência — funções puras,
// SEM nenhum import de dado (JSON), de propósito: este arquivo também é usado
// pelo cron de notificações (api/cron-notificacoes.ts, só servidor) e um JSON
// importado numa Vercel Function ESM exigiria atributo de import. Os helpers
// já existentes (dataEtapaAvaliacaoExperiencia, etapaConcluida) moraram em
// avaliacaoExperiencia.ts e continuam exportados de lá (re-export) — nenhuma
// tela mudou.

import type { AvaliacaoExperiencia, Colaborador, DispensaAvaliacaoExperiencia, EtapaAvaliacaoExperiencia } from "../types/domain.js";

/** Data (ISO "aaaa-mm-dd") em que uma etapa do contrato de experiência cai,
 * a partir da admissão — ex.: admitido em 2026-06-01, "45 dias" cai em
 * 2026-07-16. Puramente informativo pra tela de acompanhamento (mostrar a
 * data prevista de cada etapa); NUNCA decide elegibilidade/pendência —
 * isso continua exclusivamente em pendenciasAvaliacaoExperiencia(), sem
 * nenhuma mudança de regra aqui. */
export function dataEtapaAvaliacaoExperiencia(admissaoIso: string | null | undefined, dias: number): string | null {
  if (!admissaoIso) return null;
  const [anoStr, mesStr, diaStr] = admissaoIso.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIdx = parseInt(mesStr, 10) - 1;
  const dia = parseInt(diaStr, 10);
  if (Number.isNaN(ano) || Number.isNaN(mesIdx) || Number.isNaN(dia)) return null;
  const data = new Date(ano, mesIdx, dia);
  data.setDate(data.getDate() + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** true quando já existe uma AvaliacaoExperiencia registrada pro colaborador
 * nessa etapa específica — usado só pra exibir "Concluída"/"Pendente" na
 * tela de acompanhamento, mesma checagem que pendenciasAvaliacaoExperiencia()
 * já faz internamente, só reaproveitada aqui pra exibição por etapa. */
export function etapaConcluida(
  colaboradorNome: string,
  etapa: EtapaAvaliacaoExperiencia,
  avaliacoes: AvaliacaoExperiencia[],
): boolean {
  return avaliacoes.some((a) => a.colaboradorNome === colaboradorNome && a.etapa === etapa);
}

/** Quem nunca entra no acompanhamento da experiência: desligado, vínculo PJ
 * (regra da RH, 2026-09 — contrato PJ não tem período de experiência CLT) ou
 * dispensado (já avaliado fora do sistema antes da implantação do módulo).
 * Fonte ÚNICA dessa regra — pendenciasAvaliacaoExperiencia() e o aviso de
 * vencimento por e-mail usam esta mesma função. */
export function foraDaExperiencia(c: Pick<Colaborador, "nome" | "vinculo" | "desligado">, dispensados: Set<string>): boolean {
  return c.desligado || c.vinculo === "PJ" || dispensados.has(c.nome);
}

/** Diferença em dias inteiros entre duas datas ISO "aaaa-mm-dd" (b − a), por
 * calendário — sem hora nem fuso, então não sofre com horário de verão. */
export function diasEntreDatasIso(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export interface AvaliacaoAVencer {
  colaborador: Pick<Colaborador, "nome" | "vinculo" | "gestor" | "admissaoIso" | "desligado">;
  etapa: EtapaAvaliacaoExperiencia;
  /** Data (ISO) em que a etapa vence — admissão + 45 ou 90 dias. */
  vencimentoIso: string;
  diasRestantes: number;
}

/** Avaliações de experiência pendentes que estão na janela de aviso — de
 * `diasMax` a `diasMin` dias antes do vencimento (RH, 2026-10: D-10 a D-8; a
 * janela existe pra um dia em que o cron não rode não perder o aviso, a
 * deduplicação garante um único e-mail por colaborador/etapa).
 *
 * "Pendente" segue a regra do próprio acompanhamento (ver
 * pendenciasAvaliacaoExperiencia()): a etapa ainda não pode ter avaliação
 * registrada e a de 90 dias só conta depois que a de 45 foi feita — antes
 * disso a etapa atual do colaborador é a de 45, e avisar da de 90 seria avisar
 * de algo que o gestor ainda não consegue fazer. Exclusões: ver
 * foraDaExperiencia(). */
export function avaliacoesAVencer(
  colaboradores: AvaliacaoAVencer["colaborador"][],
  avaliacoes: AvaliacaoExperiencia[],
  dispensas: DispensaAvaliacaoExperiencia[],
  hojeIso: string,
  diasMax = 10,
  diasMin = 8,
): AvaliacaoAVencer[] {
  const dispensados = new Set(dispensas.map((d) => d.colaboradorNome));
  const resultado: AvaliacaoAVencer[] = [];

  for (const c of colaboradores) {
    if (foraDaExperiencia(c, dispensados)) continue;

    for (const [etapa, dias] of [["45 dias", 45], ["90 dias", 90]] as const) {
      if (etapaConcluida(c.nome, etapa, avaliacoes)) continue;
      if (etapa === "90 dias" && !etapaConcluida(c.nome, "45 dias", avaliacoes)) continue;

      const vencimentoIso = dataEtapaAvaliacaoExperiencia(c.admissaoIso, dias);
      if (!vencimentoIso) continue;
      const diasRestantes = diasEntreDatasIso(hojeIso, vencimentoIso);
      if (diasRestantes >= diasMin && diasRestantes <= diasMax) resultado.push({ colaborador: c, etapa, vencimentoIso, diasRestantes });
    }
  }
  return resultado;
}
