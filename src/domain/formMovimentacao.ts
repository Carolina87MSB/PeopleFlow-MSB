import { formatarDataAtual } from "./dates";
import { calcularPercentual, montarEtapas, nextId } from "./workflow";
import type { Colaborador, DadoField, Movimentacao, NovaMovimentacaoForm, Perfil, TipoMovimentacao } from "../types/domain";

export function blankForm(): NovaMovimentacaoForm {
  return {
    tipo: "",
    colab: "",
    destino: "",
    prioridade: "Média",
    justificativa: "",
    cargoNome: "",
    cargoDepto: "",
    cargoGestor: "",
    cargoVagas: "",
    cargoFaixa: "",
    cargoData: "",
    cargoObs: "",
    admMotivo: "",
    admCandidato: "",
    admCargo: "",
    admDepto: "",
    admGestor: "",
    admVagas: "",
    admData: "",
    admFaixa: "",
    proNovoCargo: "",
    proJustProg: "",
    proAltSal: "Não",
    proNovoSalario: "",
    proData: "",
    salAtual: "",
    salNovo: "",
    trfNovoDepto: "",
    trfNovoCargo: "",
    funNova: "",
    funMotivo: "",
    funTreinos: "",
    desMotivo: "",
    desData: "",
    desUltimoDia: "",
    desSubst: "Não",
    desObs: "",
  };
}

export interface FormContext {
  perfil: Perfil;
  me: string;
  tipos: TipoMovimentacao[];
  colaboradores: Colaborador[];
  movimentacoes: Movimentacao[];
}

export type FormValidation = { ok: true } | { ok: false };

/** Validates required fields per movement type, mirroring the prototype's per-type guard clauses. */
export function validarForm(f: NovaMovimentacaoForm): FormValidation {
  if (f.tipo === "NOV") {
    if (!f.cargoNome.trim() || !f.cargoDepto || !f.cargoGestor || !f.justificativa.trim()) return { ok: false };
    return { ok: true };
  }
  if (f.tipo === "ADM") {
    if (!f.admCargo.trim() || !f.admDepto || !f.admGestor || !f.justificativa.trim()) return { ok: false };
    return { ok: true };
  }
  if (!f.tipo || !f.colab || !f.justificativa.trim()) return { ok: false };
  return { ok: true };
}

/** Builds a new Movimentacao from the wizard form, mirroring the prototype's submitNova() branch-per-tipo logic. */
export function construirMovimentacao(f: NovaMovimentacaoForm, ctx: FormContext): Movimentacao {
  const { perfil, me, tipos, colaboradores, movimentacoes } = ctx;
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

  if (f.tipo === "NOV") {
    const tipo = tipos.find((t) => t.cod === "NOV")!;
    const etapas = montarEtapas(tipo, f.cargoGestor);
    const dados: DadoField[] = [
      { label: "Nome do cargo", value: f.cargoNome.trim() },
      { label: "Departamento", value: f.cargoDepto },
      { label: "Gestor responsável", value: f.cargoGestor },
      { label: "Quantidade de vagas", value: f.cargoVagas || "1" },
      { label: "Faixa salarial", value: f.cargoFaixa || "A definir" },
      { label: "Data prevista de implantação", value: f.cargoData || "A definir" },
      { label: "Observações", value: f.cargoObs || "—" },
    ];
    return base({
      tipo: tipo.nome,
      tipoCod: "NOV",
      colaborador: f.cargoNome.trim(),
      depto: f.cargoDepto,
      resumo: "Criação de cargo — " + (f.cargoVagas || "1") + " vaga(s)" + (f.cargoFaixa ? " · " + f.cargoFaixa : ""),
      etapas,
      dados,
      novoCargo: {
        nome: f.cargoNome.trim(),
        depto: f.cargoDepto,
        gestor: f.cargoGestor,
        vagas: f.cargoVagas || "1",
        faixa: f.cargoFaixa || "A definir",
        data: f.cargoData || "",
        obs: f.cargoObs || "",
      },
    });
  }

  if (f.tipo === "ADM") {
    const tipo = tipos.find((t) => t.cod === "ADM")!;
    const etapas = montarEtapas(tipo, f.admGestor);
    const dados: DadoField[] = [
      { label: "Motivo da contratação", value: f.admMotivo || "—" },
      { label: "Cargo solicitado", value: f.admCargo.trim() },
      { label: "Quantidade de vagas", value: f.admVagas || "1" },
      { label: "Data prevista de admissão", value: f.admData || "A definir" },
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
    });
  }

  const tipo = tipos.find((t) => t.cod === f.tipo)!;
  const colab = colaboradores.find((c) => c.nome === f.colab);
  const solic = perfil === "Gestor" ? me : colab ? colab.gestor : "A definir";
  const etapas = montarEtapas(tipo, solic);
  const cargoAtual = colab ? colab.cargo : "—";
  const deptoAtual = colab ? colab.depto : "—";
  let resumo = "";
  let dados: DadoField[] = [];

  if (f.tipo === "PRO") {
    resumo = cargoAtual + " → " + (f.proNovoCargo || "novo cargo");
    dados = [
      { label: "Cargo atual", value: cargoAtual },
      { label: "Novo cargo", value: f.proNovoCargo || "—" },
      { label: "Justificativa de progressão", value: f.proJustProg || "—" },
      { label: "Alteração salarial", value: f.proAltSal || "Não" },
      { label: "Novo salário", value: f.proAltSal === "Sim" ? f.proNovoSalario || "A definir" : "—" },
      { label: "Data prevista", value: f.proData || "A definir" },
    ];
  } else if (f.tipo === "SAL") {
    resumo = "Reajuste salarial — " + cargoAtual;
    dados = [
      { label: "Salário atual", value: f.salAtual || "—" },
      { label: "Novo salário", value: f.salNovo || "—" },
      { label: "Percentual de alteração", value: calcularPercentual(f.salAtual, f.salNovo) },
    ];
  } else if (f.tipo === "TRF") {
    resumo = deptoAtual + " → " + (f.trfNovoDepto || "novo depto") + (f.trfNovoCargo ? " (" + f.trfNovoCargo + ")" : "");
    dados = [
      { label: "Departamento atual", value: deptoAtual },
      { label: "Novo departamento", value: f.trfNovoDepto || "—" },
      { label: "Cargo atual", value: cargoAtual },
      { label: "Novo cargo (se aplicável)", value: f.trfNovoCargo || "—" },
    ];
  } else if (f.tipo === "FUN") {
    resumo = cargoAtual + " → " + (f.funNova || "nova função");
    dados = [
      { label: "Função atual", value: cargoAtual },
      { label: "Nova função", value: f.funNova || "—" },
      { label: "Motivo da alteração", value: f.funMotivo || "—" },
      { label: "Treinamentos obrigatórios", value: f.funTreinos || "—" },
    ];
  } else if (f.tipo === "DES") {
    resumo = "Desligamento — " + (f.desMotivo || "") + " · " + cargoAtual;
    dados = [
      { label: "Motivo do desligamento", value: f.desMotivo || "—" },
      { label: "Data prevista", value: f.desData || "A definir" },
      { label: "Último dia trabalhado", value: f.desUltimoDia || "A definir" },
      { label: "Substituição", value: f.desSubst || "Não" },
      { label: "Observações", value: f.desObs || "—" },
    ];
  }

  return base({
    tipo: tipo.nome,
    tipoCod: tipo.cod,
    colaborador: f.colab,
    depto: deptoAtual,
    resumo,
    etapas,
    dados,
  });
}
