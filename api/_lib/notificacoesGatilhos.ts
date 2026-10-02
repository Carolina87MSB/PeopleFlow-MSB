// Os 3 gatilhos de notificação por e-mail do PeopleFlow (RH, 2026-10) — a
// regra de NEGÓCIO de cada um, separada dos endpoints (api/notificacoes.ts,
// api/cron-notificacoes.ts) pra poder ser testada sem HTTP. Todos seguem o
// mesmo princípio: o navegador/cron só informa QUAL evento aconteceu (um id);
// aqui o servidor relê o estado ATUAL no banco, descobre se existe mesmo uma
// pendência, quem é o responsável e qual a chave de deduplicação, e só então
// chama notificar() (api/_lib/notificacoesEmail.ts), que reserva a chave,
// envia e registra. Nada de destinatário, assunto ou texto vem de fora.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./adminAuth.js";
import { notificar, criarResolvedorDeEmail } from "./notificacoesEmail.js";
import type { DependenciasNotificacao, ResultadoNotificacao } from "./notificacoesEmail.js";
import { avaliacoesAVencer } from "../../src/domain/experienciaDatas.js";
import type { AvaliacaoExperiencia, DispensaAvaliacaoExperiencia } from "../../src/types/domain.js";

export type ResultadoGatilho = ResultadoNotificacao | { resultado: "sem_pendencia"; motivo: string };

/** Texto gravado no histórico por reabrirParaRH() (domain/workflow.ts) — cada
 * ocorrência é uma nova "rodada" da mesma etapa, então entra na chave de
 * deduplicação: reabrir uma MP gera uma notificação nova, recarregar não. */
const ACAO_REABERTURA = "Movimentação restaurada para nova análise do RH";

interface EtapaRow {
  papel: string;
  aprovador: string;
  status: string;
}

function client(deps: DependenciasNotificacao): SupabaseClient {
  return deps.supabase ?? supabaseAdmin;
}

/** Gatilho 1 — MP aguardando ação. Chamado quando uma MP é criada, quando uma
 * etapa é aprovada (e surge a próxima) e quando o RH restaura uma MP
 * reprovada. Descobre a etapa "Em análise" pelo banco: se a MP não está "Em
 * Aprovação" ou não tem etapa em análise (ex.: acabou de ser concluída ou
 * reprovada), não há pendência e nada é enviado. */
export async function notificarEtapaDaMovimentacao(
  movimentacaoId: string,
  atorEmail: string,
  deps: DependenciasNotificacao = {},
): Promise<ResultadoGatilho> {
  const { data, error } = await client(deps)
    .from("peopleflow_movimentacoes")
    .select("id, status, etapas, historico")
    .eq("id", movimentacaoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { resultado: "sem_pendencia", motivo: "Movimentação não encontrada." };

  const mp = data as { id: string; status: string; etapas: EtapaRow[] | null; historico: { acao?: string }[] | null };
  if (mp.status !== "Em Aprovação") return { resultado: "sem_pendencia", motivo: `Movimentação está "${mp.status}".` };

  const etapas = mp.etapas ?? [];
  const idx = etapas.findIndex((e) => e.status === "Em análise");
  if (idx < 0) return { resultado: "sem_pendencia", motivo: "Nenhuma etapa em análise." };
  const etapa = etapas[idx];
  if (!etapa.aprovador) return { resultado: "sem_pendencia", motivo: "Etapa sem responsável definido." };

  const reaberturas = (mp.historico ?? []).filter((h) => h.acao === ACAO_REABERTURA).length;

  return notificar(
    {
      tipo: "mp_aguardando_acao",
      chaveDedup: `mp:${mp.id}:${idx}:${reaberturas}`,
      destinatarioNome: etapa.aprovador,
      referenciaId: mp.id,
      rota: `/workflow?id=${encodeURIComponent(mp.id)}`,
      contexto: { rota: "/workflow", etapa: etapa.papel },
      atorEmail,
    },
    deps,
  );
}

/** Gatilho 2 — aprovação do preenchimento de uma vaga. Só existe pendência
 * enquanto a vaga está "aguardando_aprovacao_gestor". O responsável é o
 * solicitante da MP que autorizou a vaga (mesma regra de quem pode aprovar,
 * ver aprovarPreenchimentoFn). A chave usa `registrado_em`: editar o
 * preenchimento depois NÃO muda esse valor, então não gera e-mail novo. */
export async function notificarPreenchimentoDaVaga(
  vagaId: number,
  atorEmail: string,
  deps: DependenciasNotificacao = {},
): Promise<ResultadoGatilho> {
  const supabase = client(deps);
  const { data: vaga, error } = await supabase
    .from("peopleflow_vagas")
    .select("id, status, movimentacao_id, registrado_em")
    .eq("id", vagaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!vaga) return { resultado: "sem_pendencia", motivo: "Vaga não encontrada." };

  const v = vaga as { id: number; status: string; movimentacao_id: string; registrado_em: string | null };
  if (v.status !== "aguardando_aprovacao_gestor") return { resultado: "sem_pendencia", motivo: `Vaga está "${v.status}".` };
  if (!v.registrado_em) return { resultado: "sem_pendencia", motivo: "Vaga sem registro de preenchimento." };

  const { data: mp, error: mpError } = await supabase
    .from("peopleflow_movimentacoes")
    .select("id, solicitante")
    .eq("id", v.movimentacao_id)
    .maybeSingle();
  if (mpError) throw new Error(mpError.message);
  const solicitante = (mp as { solicitante: string } | null)?.solicitante;
  if (!solicitante) return { resultado: "sem_pendencia", motivo: "Movimentação da vaga sem solicitante." };

  return notificar(
    {
      tipo: "vaga_aprovacao",
      chaveDedup: `vaga:${v.id}:${v.registrado_em}`,
      destinatarioNome: solicitante,
      referenciaId: String(v.id),
      rota: `/aprovadas?mp=${encodeURIComponent(v.movimentacao_id)}`,
      contexto: { rota: "/aprovadas", movimentacao: v.movimentacao_id },
      atorEmail,
    },
    deps,
  );
}

export interface ResumoCronExperiencia {
  hoje: string;
  dryRun: boolean;
  naJanela: number;
  enviadas: number;
  erros: number;
  ignoradas: number;
  duplicadas: number;
  /** Só no dry-run: quem seria notificado (sem enviar nem gravar nada). */
  previstas?: { colaborador: string; etapa: string; vencimento: string; diasRestantes: number; gestor: string }[];
}

/** Gatilho 3 — avaliação de experiência (45/90 dias) perto do vencimento:
 * janela D-10 a D-8, 1 notificação por colaborador/etapa (a chave inclui o
 * vencimento, então rodar o cron de novo na janela não repete). O responsável
 * é o gestor ATUAL do colaborador (`colaboradores.gestor`) — mesmo critério
 * da tela de Avaliações. `dryRun` só lista, sem enviar nem registrar. */
export async function executarCronExperiencia(
  opcoes: { hojeIso: string; dryRun?: boolean },
  deps: DependenciasNotificacao = {},
): Promise<ResumoCronExperiencia> {
  const supabase = client(deps);
  const [colabs, avals, disp] = await Promise.all([
    supabase.from("colaboradores").select("nome, vinculo, gestor, admissao, desligado"),
    supabase.from("peopleflow_avaliacoes_experiencia").select("colaborador_nome, etapa"),
    supabase.from("peopleflow_avaliacoes_experiencia_dispensas").select("colaborador_nome"),
  ]);
  for (const r of [colabs, avals, disp]) if (r.error) throw new Error(r.error.message);

  const colaboradores = (colabs.data ?? []).map((c: { nome: string; vinculo: string | null; gestor: string | null; admissao: string | null; desligado: boolean | null }) => ({
    nome: c.nome,
    vinculo: c.vinculo ?? "—",
    gestor: c.gestor ?? "",
    admissaoIso: c.admissao ?? "",
    desligado: c.desligado ?? false,
  }));
  const avaliacoes = (avals.data ?? []).map((a: { colaborador_nome: string; etapa: string }) => ({
    colaboradorNome: a.colaborador_nome,
    etapa: a.etapa,
  })) as unknown as AvaliacaoExperiencia[];
  const dispensas = (disp.data ?? []).map((d: { colaborador_nome: string }) => ({ colaboradorNome: d.colaborador_nome })) as unknown as DispensaAvaliacaoExperiencia[];

  const naJanela = avaliacoesAVencer(colaboradores, avaliacoes, dispensas, opcoes.hojeIso);
  const resumo: ResumoCronExperiencia = {
    hoje: opcoes.hojeIso,
    dryRun: Boolean(opcoes.dryRun),
    naJanela: naJanela.length,
    enviadas: 0,
    erros: 0,
    ignoradas: 0,
    duplicadas: 0,
  };

  if (opcoes.dryRun) {
    resumo.previstas = naJanela.map((a) => ({
      colaborador: a.colaborador.nome,
      etapa: a.etapa,
      vencimento: a.vencimentoIso,
      diasRestantes: a.diasRestantes,
      gestor: a.colaborador.gestor,
    }));
    return resumo;
  }

  // Uma lista de usuários só pra rodada inteira (a fábrica guarda em cache).
  const resolverEmail = deps.resolverEmail ?? criarResolvedorDeEmail(supabase);
  for (const a of naJanela) {
    const gestor = a.colaborador.gestor;
    const semGestor = !gestor || gestor === "—";
    const r = await notificar(
      {
        tipo: "experiencia_vencimento",
        chaveDedup: `exp:${a.colaborador.nome}:${a.etapa}:${a.vencimentoIso}`,
        destinatarioNome: semGestor ? "(sem gestor cadastrado)" : gestor,
        referenciaId: `${a.colaborador.nome}|${a.etapa}`,
        rota: "/avaliacoes",
        contexto: { rota: "/avaliacoes", etapa: a.etapa, vencimento: a.vencimentoIso },
        ...(semGestor ? { falhaPrevia: "Colaborador sem gestor cadastrado — ninguém foi notificado." } : {}),
      },
      { ...deps, resolverEmail },
    );
    if (r.resultado === "enviado") resumo.enviadas++;
    else if (r.resultado === "erro") resumo.erros++;
    else if (r.resultado === "ignorado") resumo.ignoradas++;
    else resumo.duplicadas++;
  }
  return resumo;
}
