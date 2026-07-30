import type { DescricaoCargo } from "../types/domain";

export type CampoDescricaoCargo = Exclude<keyof DescricaoCargo, "cargoNome" | "updatedAt" | "updatedBy">;

export interface CampoMeta {
  key: CampoDescricaoCargo;
  label: string;
  grupo: string;
  multiline?: boolean;
}

/** Ordem e agrupamento espelham as seções do formulário POP-RH-001 (Descrição de Cargo). */
export const CAMPOS_DESCRICAO_CARGO: CampoMeta[] = [
  { key: "codigoFormulario", label: "Código do formulário", grupo: "Dados do formulário (auditoria)" },
  { key: "revisaoFormulario", label: "Revisão", grupo: "Dados do formulário (auditoria)" },
  { key: "dataFormulario", label: "Data do formulário", grupo: "Dados do formulário (auditoria)" },
  { key: "dataRevisaoCargo", label: "Data de revisão deste cargo", grupo: "Dados do formulário (auditoria)" },
  { key: "subordinacao", label: "Subordinação", grupo: "Informações do cargo" },
  { key: "localidade", label: "Localidade", grupo: "Informações do cargo" },
  { key: "nivelDocumento", label: "Nível", grupo: "Informações do cargo" },
  { key: "sumario", label: "Sumário do cargo", grupo: "Sumário do cargo", multiline: true },
  { key: "responsabilidades", label: "Principais responsabilidades", grupo: "Principais responsabilidades", multiline: true },
  { key: "escolaridade", label: "Escolaridade", grupo: "Requisitos do cargo", multiline: true },
  { key: "experiencia", label: "Experiência", grupo: "Requisitos do cargo", multiline: true },
  { key: "habilidadesTecnicas", label: "Habilidades técnicas", grupo: "Competências e requisitos desejáveis", multiline: true },
  { key: "habilidadesComportamentais", label: "Habilidades comportamentais", grupo: "Competências e requisitos desejáveis", multiline: true },
  { key: "epis", label: "EPIs (Equipamentos de Proteção Individual)", grupo: "EPIs", multiline: true },
];

export function labelForCampoDescricaoCargo(campo: string): string {
  return CAMPOS_DESCRICAO_CARGO.find((c) => c.key === campo)?.label ?? campo;
}

export function descricaoCargoVazia(cargoNome: string): DescricaoCargo {
  return {
    cargoNome,
    codigoFormulario: "",
    revisaoFormulario: "",
    dataFormulario: "",
    dataRevisaoCargo: "",
    subordinacao: "",
    localidade: "",
    nivelDocumento: "",
    sumario: "",
    responsabilidades: "",
    escolaridade: "",
    experiencia: "",
    habilidadesTecnicas: "",
    habilidadesComportamentais: "",
    epis: "",
    updatedAt: "",
    updatedBy: "",
  };
}
