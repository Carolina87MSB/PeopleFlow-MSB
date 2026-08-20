// Timeline da trajetória profissional do colaborador — funções puras, sem
// estado nem dependência de UI/Supabase. Substitui o antigo "Histórico"
// (lista genérica de movimentações) na ficha de /colaboradores por uma
// linha do tempo de eventos de carreira: só o que aconteceu de fato
// (admissão, mudança de gestor, transferência, promoção, alteração
// salarial, avaliação de experiência, ciclo de AVD+Potencial, PDI,
// desligamento) — nunca um log técnico de "quem editou o quê".
//
// Reaproveita 100% dos dados já existentes: nenhuma tabela nova, nenhum
// cadastro paralelo. "Antes"/"depois" de cargo/depto/gestor/salário vêm
// sempre do snapshot já gravado na própria movimentação no momento em que
// ela foi criada (`dados`/`atualizacaoInfo`/`admissaoInfo`/
// `desligamentoInfo`) — nunca do cadastro atual do colaborador, que só tem
// o valor de HOJE e reescreveria o passado se fosse usado como fonte.

import { dataBrParaIso, hojeIso } from "./dates";
import { classificarFaixaMatriz9Box, posicionarMatriz9Box } from "./matriz9Box";
import { montarHistoricoColaborador } from "./historicoDesempenho";
import type {
  AvaliacaoDesempenho,
  AvaliacaoExperiencia,
  AvaliacaoPotencial,
  CicloAvaliacaoDesempenho,
  Colaborador,
  ConfigAvaliacaoDesempenho,
  FaixaMatriz9Box,
  Movimentacao,
  Pdi,
} from "../types/domain";

function valorDado(m: Movimentacao, label: string): string | null {
  return m.dados?.find((d) => d.label === label)?.value ?? null;
}

/** `avaliadoEm`/`criadoEm`/`concluidoEm`/`devolutivaEm` são sempre
 * `new Date().toISOString()` (timestamp completo, ex.: "2026-08-20T14:23:00.000Z")
 * — corta pro formato "aaaa-mm-dd" que `formatarDataIso()`/comparação de
 * strings esperam. É um no-op quando já vem só a data. */
function soData(iso: string): string {
  return iso.slice(0, 10);
}

/** Data "efetiva" de uma movimentação de PRO/TRF — a `dataPrevistaIso`
 * escolhida no formulário (mesma fonte que `efetivarSincronizacoesPendentes()`
 * usa pra aplicar de fato em `colaboradores`, já em ISO "aaaa-mm-dd"), com
 * fallback pra data de aprovação final e, por último, data de solicitação —
 * essas duas últimas vêm em "dd/mmm/aaaa" (ver formatarDataAtual() em
 * domain/dates.ts), por isso passam por dataBrParaIso() antes de comparar/
 * ordenar junto com datas ISO. Nunca inventada. */
function dataEfetivaMovimentacao(m: Movimentacao): string | null {
  return m.atualizacaoInfo?.dataPrevistaIso || dataBrParaIso(m.aprovacaoFinal?.data) || dataBrParaIso(m.dataSolicitacao) || null;
}

export type EventoTimelineCarreira =
  | { id: string; tipo: "admissao"; data: string; cargo: string; depto: string; gestor: string }
  | { id: string; tipo: "alteracaoGestor"; data: string; gestorAnterior: string; novoGestor: string }
  | { id: string; tipo: "transferencia"; data: string; deptoAnterior: string; novoDepto: string; cargo: string | null }
  | { id: string; tipo: "promocao"; data: string; cargoAnterior: string; novoCargo: string; gestorResponsavel: string | null }
  | { id: string; tipo: "alteracaoSalarial"; data: string; salarioAnterior: string; novoSalario: string; motivo: string | null }
  | { id: string; tipo: "avaliacaoExperiencia"; data: string; etapa: string; resultado: string; concluidaEm: string }
  | {
      id: string;
      tipo: "cicloAvaliacao";
      data: string;
      cicloNome: string;
      periodo: string;
      notaDesempenho: number | null;
      faixaDesempenho: FaixaMatriz9Box | null;
      notaPotencial: number | null;
      faixaPotencial: FaixaMatriz9Box | null;
      nomeQuadrante: string | null;
      concluidoEm: string | null;
    }
  | { id: string; tipo: "pdi"; data: string; objetivos: string[]; prazo: string | null; status: string; concluidoEm: string | null }
  | { id: string; tipo: "desligamento"; data: string; motivo: string | null };

/** Monta a timeline de carreira de 1 colaborador, mais recente primeiro.
 * Só eventos que já aconteceram de fato (data efetiva <= hoje) — uma
 * movimentação aprovada mas agendada pro futuro ainda não é um evento da
 * trajetória. Não recebe `perfil`/regra de permissão nenhuma — quem decide
 * se mostra o valor do salário é a tela (ver podeVerSalario em
 * domain/permissoes.ts), este módulo é agnóstico de quem está olhando. */
export function montarTimelineCarreira(
  colaborador: Colaborador,
  movimentacoes: Movimentacao[],
  avaliacoesExperiencia: AvaliacaoExperiencia[],
  ciclos: CicloAvaliacaoDesempenho[],
  avaliacoesDesempenho: AvaliacaoDesempenho[],
  avaliacoesPotencial: AvaliacaoPotencial[],
  pdis: Pdi[],
  config: ConfigAvaliacaoDesempenho | null,
): EventoTimelineCarreira[] {
  const hoje = hojeIso();
  const doColaborador = movimentacoes.filter((m) => m.colaborador === colaborador.nome);
  const eventos: EventoTimelineCarreira[] = [];

  // ── Admissão ────────────────────────────────────────────────────────
  const admissao = doColaborador.find((m) => m.tipoCod === "ADM" && m.status === "Concluído");
  const gestorInicial = admissao?.admissaoInfo?.gestor ?? null;
  if (admissao?.admissaoInfo) {
    eventos.push({
      id: `${admissao.id}:admissao`,
      tipo: "admissao",
      data: admissao.admissaoInfo.admissaoIso || colaborador.admissaoIso,
      cargo: admissao.admissaoInfo.cargo,
      depto: admissao.admissaoInfo.depto,
      gestor: admissao.admissaoInfo.gestor,
    });
  } else if (colaborador.admissaoIso) {
    // Sem movimentação de Admissão registrada (colaborador legado, pré-portal)
    // — usa o próprio cadastro, único dado disponível nesse caso.
    eventos.push({
      id: `${colaborador.nome}:admissao-legado`,
      tipo: "admissao",
      data: colaborador.admissaoIso,
      cargo: colaborador.cargo,
      depto: colaborador.depto,
      gestor: colaborador.gestor,
    });
  }

  // ── Movimentações efetivadas (PRO/TRF/SAL) → Alteração de gestor,
  // Transferência, Promoção, Alteração salarial ──────────────────────────
  const efetivadas = doColaborador
    .filter((m) => (m.tipoCod === "PRO" || m.tipoCod === "TRF" || m.tipoCod === "SAL") && m.status === "Aprovado")
    .map((m) => ({ m, data: dataEfetivaMovimentacao(m) }))
    .filter((x): x is { m: Movimentacao; data: string } => !!x.data && x.data <= hoje)
    .sort((a, b) => a.data.localeCompare(b.data));

  let gestorAtual = gestorInicial;
  for (const { m, data } of efetivadas) {
    if (m.tipoCod === "PRO") {
      const cargoAnterior = valorDado(m, "Cargo atual");
      const novoCargo = valorDado(m, "Novo cargo");
      if (cargoAnterior && novoCargo) {
        eventos.push({
          id: `${m.id}:promocao`,
          tipo: "promocao",
          data,
          cargoAnterior,
          novoCargo,
          gestorResponsavel: m.atualizacaoInfo?.novoGestor ?? gestorAtual,
        });
      }
      if (valorDado(m, "Alteração salarial") === "Sim") {
        const salarioAnterior = valorDado(m, "Salário atual");
        const novoSalario = valorDado(m, "Novo salário");
        if (salarioAnterior && novoSalario && novoSalario !== "—") {
          eventos.push({ id: `${m.id}:salario`, tipo: "alteracaoSalarial", data, salarioAnterior, novoSalario, motivo: "Promoção" });
        }
      }
      const deptoOrigem = valorDado(m, "Departamento de origem");
      const deptoDestino = valorDado(m, "Departamento de destino");
      if (deptoOrigem && deptoDestino) {
        eventos.push({ id: `${m.id}:transferencia`, tipo: "transferencia", data, deptoAnterior: deptoOrigem, novoDepto: deptoDestino, cargo: novoCargo });
      }
    } else if (m.tipoCod === "TRF") {
      const deptoAnterior = valorDado(m, "Departamento atual");
      const novoDepto = valorDado(m, "Novo departamento");
      if (deptoAnterior && novoDepto) {
        eventos.push({ id: `${m.id}:transferencia`, tipo: "transferencia", data, deptoAnterior, novoDepto, cargo: null });
      }
    } else if (m.tipoCod === "SAL") {
      const salarioAnterior = valorDado(m, "Salário atual");
      const novoSalario = valorDado(m, "Novo salário");
      if (salarioAnterior && novoSalario) {
        eventos.push({ id: `${m.id}:salario`, tipo: "alteracaoSalarial", data, salarioAnterior, novoSalario, motivo: null });
      }
    }

    const novoGestor = m.atualizacaoInfo?.novoGestor;
    if (novoGestor && novoGestor !== gestorAtual) {
      eventos.push({ id: `${m.id}:gestor`, tipo: "alteracaoGestor", data, gestorAnterior: gestorAtual ?? "—", novoGestor });
      gestorAtual = novoGestor;
    }
  }

  // ── Avaliação de Experiência ────────────────────────────────────────
  avaliacoesExperiencia
    .filter((a) => a.colaboradorNome === colaborador.nome)
    .forEach((a) => {
      eventos.push({
        id: `exp:${a.id}`,
        tipo: "avaliacaoExperiencia",
        data: soData(a.avaliadoEm),
        etapa: a.etapa,
        resultado: a.decisaoFinal,
        concluidaEm: soData(a.avaliadoEm),
      });
    });

  // ── Avaliação de Desempenho + Potencial (1 evento por ciclo, nunca 2) ──
  // Reaproveita montarHistoricoColaborador() (já usado na aba Histórico da
  // Gestão de Desempenho) pro join AVD+Potencial+PDI por cicloId — mesma
  // fonte de verdade, sem lógica nova de cálculo.
  const linhasCiclo = montarHistoricoColaborador(colaborador.nome, ciclos, avaliacoesDesempenho, avaliacoesPotencial, pdis, config);
  linhasCiclo
    .filter((l) => l.notaDesempenho !== null || l.notaPotencial !== null)
    .forEach((l) => {
      const faixaDesempenho =
        l.notaDesempenho !== null
          ? classificarFaixaMatriz9Box(l.notaDesempenho, config?.matrizDesempenhoLimiteMedio ?? 3, config?.matrizDesempenhoLimiteAlto ?? 4)
          : null;
      const faixaPotencial =
        l.notaPotencial !== null
          ? classificarFaixaMatriz9Box(l.notaPotencial, config?.matrizPotencialLimiteMedio ?? 3, config?.matrizPotencialLimiteAlto ?? 4)
          : null;
      const posicao = posicionarMatriz9Box(l.notaDesempenho, l.notaPotencial, config);
      const concluidoEm = (l.dataDevolutiva && soData(l.dataDevolutiva)) || l.dataEncerramento || null;
      eventos.push({
        id: `ciclo:${l.cicloId}`,
        tipo: "cicloAvaliacao",
        data: concluidoEm || l.dataInicio,
        cicloNome: l.cicloNome,
        periodo: ciclos.find((c) => c.id === l.cicloId)?.periodoReferencia ?? "",
        notaDesempenho: l.notaDesempenho,
        faixaDesempenho,
        notaPotencial: l.notaPotencial,
        faixaPotencial,
        nomeQuadrante: posicao?.nomeQuadrante ?? null,
        concluidoEm,
      });
    });

  // ── PDI ─────────────────────────────────────────────────────────────
  pdis
    .filter((p) => p.colaboradorNome === colaborador.nome)
    .forEach((p) => {
      const prazos = p.itens.map((i) => i.dataPrevistaConclusao).filter((d): d is string => !!d);
      const prazo = prazos.length ? prazos.sort().at(-1)! : null;
      const objetivos = p.itens.map((i) => i.objetivoDesenvolvimento || i.competenciaNome).filter(Boolean);
      eventos.push({
        id: `pdi:${p.id}`,
        tipo: "pdi",
        data: soData(p.criadoEm),
        objetivos,
        prazo,
        status: p.status,
        concluidoEm: p.concluidoEm ? soData(p.concluidoEm) : null,
      });
    });

  // ── Desligamento ────────────────────────────────────────────────────
  if (colaborador.desligado) {
    const desligamento = doColaborador.find((m) => m.tipoCod === "DES" && m.desligamentoInfo);
    const dataIso = desligamento?.desligamentoInfo?.dataIso || dataBrParaIso(colaborador.dataDesligamento) || hoje;
    eventos.push({
      id: desligamento ? `${desligamento.id}:desligamento` : `${colaborador.nome}:desligamento`,
      tipo: "desligamento",
      data: dataIso,
      motivo: desligamento?.desligamentoInfo?.motivo || colaborador.motivoDesligamento || null,
    });
  }

  return eventos.sort((a, b) => b.data.localeCompare(a.data));
}
