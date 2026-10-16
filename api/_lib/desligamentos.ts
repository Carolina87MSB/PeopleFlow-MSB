// Efetivação CADASTRAL do desligamento no PeopleFlow (colaboradores.desligado), a partir da Movimentação de Pessoal (MP) de
// Desligamento APROVADA — sem depender da confirmação no Portal SST.
//
// Regra:
//  • MP "Aprovado" com data de desligamento hoje ou no passado → o colaborador passa a Desligado na hora;
//  • data futura → continua Ativo; a rotina diária (cron) efetiva no dia indicado;
//  • MP ainda não aprovada (Em Aprovação / Reprovada) nunca altera o cadastro;
//  • sem data informada → vale a data de hoje (comportamento anterior à fase de duas etapas).
//
// O SST NÃO é tocado: a linha de peopleflow_desligamento_pendente (que alimenta o card "Desligamento pendente" e a avaliação do
// exame demissional/ASO no SST) permanece como está. A pendência no SST nunca impede nem reverte esta efetivação.
//
// Rastreabilidade: colaboradores.desligado_by = "PeopleFlow · <id da MP>" e peopleflow_movimentacoes.sincronizado_em = momento da
// efetivação (mesma coluna usada pelas sincronizações de Promoção/Transferência). Quem já está Desligado (por ex. confirmado antes
// no SST) nunca é reescrito.

export interface DesligamentoInfoMp {
  nome?: string;
  motivo?: string;
  dataIso?: string;
}

export type SituacaoEfetivacao = "efetivado" | "agendado" | "ja_desligado" | "nao_localizado" | "ambiguo" | "sem_dados" | "falha";

export interface ResultadoEfetivacao {
  movimentacaoId: string;
  nome: string;
  dataIso: string | null;
  situacao: SituacaoEfetivacao;
  detalhe?: string;
}

/** Subconjunto do cliente Supabase que esta rotina usa (permite testar com um banco falso). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BancoDesligamentos = { from: (tabela: string) => any };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A data de desligamento já chegou? (aaaa-mm-dd; compara texto, sem fuso). Sem data válida → efetiva hoje. */
export function desligamentoJaVale(dataIso: string | null | undefined, hojeIso: string): boolean {
  return !dataIso || !ISO.test(dataIso) || dataIso <= hojeIso;
}

export async function efetivarDesligamentos(db: BancoDesligamentos, opcoes: { hojeIso: string; movimentacaoId?: string; dryRun?: boolean }): Promise<ResultadoEfetivacao[]> {
  const { hojeIso, movimentacaoId, dryRun } = opcoes;
  let q = db.from("peopleflow_movimentacoes").select("id, colaborador, colaborador_id, desligamento_info").eq("tipo_cod", "DES").eq("status", "Aprovado").is("sincronizado_em", null);
  if (movimentacaoId) q = q.eq("id", movimentacaoId);
  const { data: mps, error } = await q;
  if (error) throw new Error(`Falha ao ler movimentações de desligamento: ${error.message}`);

  const resultados: ResultadoEfetivacao[] = [];
  for (const mp of (mps ?? []) as { id: string; colaborador: string | null; colaborador_id: number | null; desligamento_info: DesligamentoInfoMp | null }[]) {
    const info = mp.desligamento_info ?? {};
    const nome = String(info.nome || mp.colaborador || "").trim();
    const dataIso = info.dataIso && ISO.test(info.dataIso) ? info.dataIso : null;
    const base = { movimentacaoId: mp.id, nome, dataIso };
    const motivo = String(info.motivo || "").trim();
    if (!nome || !motivo) {
      resultados.push({ ...base, situacao: "sem_dados", detalhe: "MP sem nome ou motivo no registro de desligamento." });
      continue;
    }
    if (!desligamentoJaVale(dataIso, hojeIso)) {
      resultados.push({ ...base, situacao: "agendado" });
      continue;
    }
    try {
      // identifica o colaborador: pelo id da MP quando existe, senão pelo nome — que precisa ser único
      let alvo: { id: number; desligado: boolean | null } | null = null;
      if (mp.colaborador_id) {
        const { data, error: e } = await db.from("colaboradores").select("id, desligado").eq("id", mp.colaborador_id);
        if (e) throw new Error(e.message);
        alvo = (data ?? [])[0] ?? null;
      } else {
        const { data, error: e } = await db.from("colaboradores").select("id, desligado").eq("nome", nome);
        if (e) throw new Error(e.message);
        if ((data ?? []).length > 1) {
          resultados.push({ ...base, situacao: "ambiguo", detalhe: "Mais de um colaborador com este nome; nada foi alterado." });
          continue;
        }
        alvo = (data ?? [])[0] ?? null;
      }
      if (!alvo) {
        resultados.push({ ...base, situacao: "nao_localizado", detalhe: "Colaborador não encontrado no cadastro." });
        continue;
      }
      if (alvo.desligado) {
        resultados.push({ ...base, situacao: "ja_desligado" });
        continue;
      }
      if (dryRun) {
        resultados.push({ ...base, situacao: "efetivado", detalhe: "simulação (dryRun): nada foi gravado" });
        continue;
      }
      const { data: atualizados, error: eUp } = await db
        .from("colaboradores")
        .update({ desligado: true, data_desligamento: dataIso ?? hojeIso, motivo_desligamento: motivo, desligado_by: `PeopleFlow · ${mp.id}` })
        .eq("id", alvo.id)
        .eq("desligado", false)
        .select("id");
      if (eUp) throw new Error(eUp.message);
      if (!atualizados || atualizados.length === 0) {
        // alguém desligou no meio do caminho (ex.: SST): não reescreve
        resultados.push({ ...base, situacao: "ja_desligado" });
        continue;
      }
      const { error: eMarca } = await db.from("peopleflow_movimentacoes").update({ sincronizado_em: new Date().toISOString() }).eq("id", mp.id);
      resultados.push({ ...base, situacao: "efetivado", ...(eMarca ? { detalhe: `Desligado, mas não foi possível marcar a MP como sincronizada (${eMarca.message}); a próxima rotina não reaplica.` } : {}) });
    } catch (err) {
      resultados.push({ ...base, situacao: "falha", detalhe: err instanceof Error ? err.message : String(err) });
    }
  }
  return resultados;
}
