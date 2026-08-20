import type { DescricaoCargo } from "../types/domain";

export type CampoDescricaoCargo = Exclude<
  keyof DescricaoCargo,
  "cargoNome" | "updatedAt" | "updatedBy" | "elaboradoPor" | "elaboradoEm" | "aprovadoPor" | "aprovadoEm" | "status" | "pendente"
>;

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

/** Grupos que um Gestor pode editar nos cargos sob sua liderança (ver
 * cargoSobLiderancaDe() em domain/hierarquia.ts e
 * podeEditarSecaoDescricaoCargo() em usePortalData.ts) — "Dados do
 * formulário (auditoria)", "Informações do cargo" e "EPIs" continuam
 * RH-only, por serem dados de controle/segurança do documento, não conteúdo
 * do dia a dia da liderança. */
const GRUPOS_EDITAVEIS_GESTOR = new Set(["Sumário do cargo", "Principais responsabilidades", "Requisitos do cargo", "Competências e requisitos desejáveis"]);

export function podeGestorEditarGrupo(grupo: string): boolean {
  return GRUPOS_EDITAVEIS_GESTOR.has(grupo);
}

/** Labels de "campo" que não fazem parte do formulário em si (não estão em
 * CAMPOS_DESCRICAO_CARGO) mas ainda passam pelo mesmo histórico
 * append-only — eventos de aprovação/rejeição são logados com
 * `campo = "status"` (ver aprovarDescricaoCargo/rejeitarDescricaoCargo em
 * usePortalData.ts). */
const LABELS_HISTORICO_EXTRA: Record<string, string> = {
  status: "Status da descrição",
};

export function labelForCampoDescricaoCargo(campo: string): string {
  return CAMPOS_DESCRICAO_CARGO.find((c) => c.key === campo)?.label ?? LABELS_HISTORICO_EXTRA[campo] ?? campo;
}

/** Valor "efetivo" de um campo pra exibição/edição: a proposta pendente do
 * Gestor, se houver uma diferente do oficial; senão o próprio valor oficial.
 * NUNCA usado fora desta tela — o resto do sistema só lê os campos oficiais
 * (ver comentário em `pendente` no types/domain.ts). */
export function valorEfetivoDescricaoCargo(descricao: DescricaoCargo, campo: CampoDescricaoCargo): string {
  const pendente = descricao.pendente?.[campo];
  return pendente !== undefined ? pendente : (descricao[campo] as string) ?? "";
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
    status: "Aprovada",
    pendente: null,
    elaboradoPor: "",
    elaboradoEm: "",
    aprovadoPor: "",
    aprovadoEm: "",
  };
}
