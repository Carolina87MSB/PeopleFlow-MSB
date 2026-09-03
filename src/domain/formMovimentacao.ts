import { formatarDataAtual, formatarDataIso } from "./dates";
import { gestorDoDepartamento } from "./hierarquia";
import { calcularPercentual, montarEtapas, nextId } from "./workflow";
import type { CargoCustom, Colaborador, DadoField, DescricaoCargo, Movimentacao, NovaMovimentacaoForm, TipoMovimentacao } from "../types/domain";

/** true só quando `nomeCargo` é um cargo "novo" (criado pelo botão Novo
 * Cargo, ainda 0 ocupantes) SEM Descrição de Cargo aprovada — nunca pra um
 * cargo já ocupado nem pra um nome digitado livremente numa Admissão que
 * nunca passou pelo botão (esse continua funcionando como sempre, ver
 * comentário de "cargos-existentes" em NovaMovimentacaoModal.tsx). */
function cargoNovoSemDescricaoAprovada(nomeCargo: string, cargosCustom: CargoCustom[], descricoesCargo: DescricaoCargo[]): boolean {
  const nome = nomeCargo.trim();
  if (!nome || !cargosCustom.some((c) => c.nome === nome)) return false;
  const descricao = descricoesCargo.find((d) => d.cargoNome === nome);
  return !descricao || descricao.status !== "Aprovada";
}

export function blankForm(): NovaMovimentacaoForm {
  return {
    tipo: "",
    colab: "",
    destino: "",
    prioridade: "Média",
    justificativa: "",
    admMotivo: "",
    admCandidato: "",
    admCargo: "",
    admDepto: "",
    admGestor: "",
    admVinculo: "",
    admVagas: "",
    admData: "",
    admFaixa: "",
    proNovoCargo: "",
    proSalarioAtual: "",
    proAltSal: "Não",
    proNovoSalario: "",
    proMudaDepto: "Não",
    proNovoDepto: "",
    proData: "",
    salAtual: "",
    salNovo: "",
    trfNovoDepto: "",
    trfData: "",
    desMotivo: "",
    desData: "",
    desUltimoDia: "",
    desSubst: "Não",
    desObs: "",
  };
}

export interface FormContext {
  me: string;
  tipos: TipoMovimentacao[];
  colaboradores: Colaborador[];
  movimentacoes: Movimentacao[];
}

export type FormValidation = { ok: true } | { ok: false; error?: string };

/**
 * Validates required fields per movement type, plus a hard access-control check
 * for Promoção (com mudança de departamento) e Transferência: só o gestor do
 * departamento de destino pode abrir essas movimentações (e, para Promoção sem
 * mudança de departamento, só o gestor atual do colaborador) — não é uma
 * sugestão, o app bloqueia o envio se `me` não for essa pessoa.
 */
export function validarForm(
  f: NovaMovimentacaoForm,
  ctx: { me: string; colaboradores: Colaborador[]; cargosCustom: CargoCustom[]; descricoesCargo: DescricaoCargo[] },
): FormValidation {
  if (f.tipo === "ADM") {
    if (!f.admCargo.trim() || !f.admDepto || !f.admGestor || !f.admVinculo || !f.justificativa.trim()) return { ok: false };
    if (cargoNovoSemDescricaoAprovada(f.admCargo, ctx.cargosCustom, ctx.descricoesCargo)) {
      return { ok: false, error: `O cargo "${f.admCargo.trim()}" ainda não tem uma Descrição de Cargo aprovada — aprove-a antes de abrir uma movimentação para ele.` };
    }
    return { ok: true };
  }
  if (!f.tipo || !f.colab || !f.justificativa.trim()) return { ok: false };

  const colab = ctx.colaboradores.find((c) => c.nome === f.colab);

  if (f.tipo === "PRO") {
    if (!f.proNovoCargo.trim() || !f.proData) return { ok: false };
    if (f.proAltSal === "Sim" && !f.proNovoSalario.trim()) return { ok: false };
    if (cargoNovoSemDescricaoAprovada(f.proNovoCargo, ctx.cargosCustom, ctx.descricoesCargo)) {
      return { ok: false, error: `O cargo "${f.proNovoCargo.trim()}" ainda não tem uma Descrição de Cargo aprovada — aprove-a antes de abrir uma movimentação para ele.` };
    }
    if (f.proMudaDepto === "Sim") {
      if (!f.proNovoDepto) return { ok: false };
      const gestorDestino = gestorDoDepartamento(ctx.colaboradores, f.proNovoDepto);
      if (!gestorDestino) return { ok: false, error: "Não foi possível identificar o gestor do departamento de destino selecionado." };
      if (gestorDestino !== ctx.me) {
        return { ok: false, error: `Somente ${gestorDestino}, gestor(a) de ${f.proNovoDepto}, pode abrir esta movimentação.` };
      }
    } else if (colab && colab.gestor !== ctx.me) {
      return { ok: false, error: `Somente ${colab.gestor}, gestor(a) atual de ${colab.nome}, pode abrir esta promoção.` };
    }
    return { ok: true };
  }

  if (f.tipo === "TRF") {
    if (!f.trfNovoDepto || !f.trfData) return { ok: false };
    const gestorDestino = gestorDoDepartamento(ctx.colaboradores, f.trfNovoDepto);
    if (!gestorDestino) return { ok: false, error: "Não foi possível identificar o gestor do departamento de destino selecionado." };
    if (gestorDestino !== ctx.me) {
      return { ok: false, error: `Somente ${gestorDestino}, gestor(a) de ${f.trfNovoDepto}, pode abrir esta movimentação.` };
    }
    return { ok: true };
  }

  return { ok: true };
}

/** Builds a new Movimentacao from the wizard form. */
export function construirMovimentacao(f: NovaMovimentacaoForm, ctx: FormContext): Movimentacao {
  const { me, tipos, colaboradores, movimentacoes } = ctx;
  const id = nextId(movimentacoes);
  const dataSolicitacao = formatarDataAtual();

  const base = (extra: Partial<Movimentacao> & Pick<Movimentacao, "tipo" | "tipoCod" | "colaborador" | "depto" | "resumo" | "etapas">): Movimentacao => ({
    id,
    dataSolicitacao,
    prioridade: f.prioridade,
    status: "Em Aprovação",
    solicitante: me || "—",
    justificativa: f.justificativa.trim(),
    ...extra,
  });

  if (f.tipo === "ADM") {
    const tipo = tipos.find((t) => t.cod === "ADM")!;
    const etapas = montarEtapas(tipo, f.admGestor, me, colaboradores);
    const dados: DadoField[] = [
      { label: "Motivo da contratação", value: f.admMotivo || "—" },
      { label: "Cargo solicitado", value: f.admCargo.trim() },
      { label: "Vínculo", value: f.admVinculo || "A definir" },
      { label: "Quantidade de vagas", value: f.admVagas || "1" },
      { label: "Data prevista de admissão", value: f.admData ? formatarDataIso(f.admData) : "A definir" },
      { label: "Faixa salarial", value: f.admFaixa || "A definir" },
      { label: "Candidato", value: f.admCandidato || "A definir" },
    ];
    return base({
      tipo: tipo.nome,
      tipoCod: "ADM",
      colaborador: f.admCandidato.trim() || f.admCargo.trim() + " (admissão)",
      depto: f.admDepto,
      resumo: "Admissão — " + f.admCargo.trim() + " · " + (f.admVagas || "1") + " vaga(s)",
      etapas,
      dados,
      admissaoInfo: {
        candidato: f.admCandidato.trim(),
        cargo: f.admCargo.trim(),
        depto: f.admDepto,
        gestor: f.admGestor,
        vinculo: f.admVinculo,
        admissaoIso: f.admData,
      },
    });
  }

  const tipo = tipos.find((t) => t.cod === f.tipo)!;
  const colab = colaboradores.find((c) => c.nome === f.colab);
  const cargoAtual = colab ? colab.cargo : "—";
  const deptoAtual = colab ? colab.depto : "—";
  let resumo = "";
  let dados: DadoField[] = [];
  let depto = deptoAtual;
  // "Gestor Solicitante" nunca é o gestor atual quando a movimentação muda o
  // colaborador de departamento — nesses casos, validarForm() já garantiu que
  // `me` É o gestor do departamento de destino, então ele mesmo vira o
  // aprovador dessa etapa (ver montarEtapas() em workflow.ts — a etapa
  // continua existindo, só muda quem a resolve).
  let solic = colab ? colab.gestor : "A definir";

  if (f.tipo === "PRO") {
    if (f.proMudaDepto === "Sim") {
      solic = me;
      depto = f.proNovoDepto;
    }
    resumo = cargoAtual + " → " + (f.proNovoCargo || "novo cargo") + (f.proMudaDepto === "Sim" ? " (" + f.proNovoDepto + ")" : "");
    dados = [
      { label: "Cargo atual", value: cargoAtual },
      { label: "Novo cargo", value: f.proNovoCargo || "—" },
      { label: "Salário atual", value: f.proSalarioAtual || "—" },
      ...(f.proMudaDepto === "Sim"
        ? ([
            { label: "Departamento de origem", value: deptoAtual },
            { label: "Departamento de destino", value: f.proNovoDepto },
            { label: "Gestor de destino", value: me },
          ] as DadoField[])
        : []),
      { label: "Alteração salarial", value: f.proAltSal || "Não" },
      { label: "Novo salário", value: f.proAltSal === "Sim" ? f.proNovoSalario || "A definir" : "—" },
      { label: "Data prevista", value: f.proData ? formatarDataIso(f.proData) : "A definir" },
    ];
  } else if (f.tipo === "SAL") {
    resumo = "Reajuste salarial — " + cargoAtual;
    dados = [
      { label: "Salário atual", value: f.salAtual || "—" },
      { label: "Novo salário", value: f.salNovo || "—" },
      { label: "Percentual de alteração", value: calcularPercentual(f.salAtual, f.salNovo) },
    ];
  } else if (f.tipo === "TRF") {
    solic = me;
    depto = f.trfNovoDepto;
    resumo = deptoAtual + " → " + (f.trfNovoDepto || "novo depto");
    dados = [
      { label: "Departamento atual", value: deptoAtual },
      { label: "Novo departamento", value: f.trfNovoDepto || "—" },
      { label: "Gestor de destino", value: me },
      { label: "Data prevista", value: f.trfData ? formatarDataIso(f.trfData) : "A definir" },
    ];
  } else if (f.tipo === "DES") {
    resumo = "Desligamento — " + (f.desMotivo || "") + " · " + cargoAtual;
    dados = [
      { label: "Motivo do desligamento", value: f.desMotivo || "—" },
      { label: "Data prevista", value: f.desData ? formatarDataIso(f.desData) : "A definir" },
      { label: "Último dia trabalhado", value: f.desUltimoDia ? formatarDataIso(f.desUltimoDia) : "A definir" },
      { label: "Substituição", value: f.desSubst || "Não" },
      { label: "Observações", value: f.desObs || "—" },
    ];
  }

  const etapas = montarEtapas(tipo, solic, me, colaboradores);

  let atualizacaoInfo: Movimentacao["atualizacaoInfo"];
  let desligamentoInfo: Movimentacao["desligamentoInfo"];

  if (f.tipo === "PRO" && f.proNovoCargo.trim()) {
    atualizacaoInfo = {
      nome: f.colab,
      novoCargo: f.proNovoCargo.trim(),
      novoDepto: f.proMudaDepto === "Sim" ? f.proNovoDepto : undefined,
      novoGestor: f.proMudaDepto === "Sim" ? me : undefined,
      dataPrevistaIso: f.proData || undefined,
    };
  } else if (f.tipo === "TRF" && f.trfNovoDepto) {
    atualizacaoInfo = { nome: f.colab, novoDepto: f.trfNovoDepto, novoGestor: me, dataPrevistaIso: f.trfData || undefined };
  } else if (f.tipo === "DES") {
    desligamentoInfo = { nome: f.colab, motivo: f.desMotivo.trim(), dataIso: f.desUltimoDia || f.desData };
  }

  return base({
    tipo: tipo.nome,
    tipoCod: tipo.cod,
    colaborador: f.colab,
    depto,
    resumo,
    etapas,
    dados,
    atualizacaoInfo,
    desligamentoInfo,
  });
}
