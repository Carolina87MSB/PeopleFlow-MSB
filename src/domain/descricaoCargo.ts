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
  /** Lista fixa de opções pra virar campo de seleção em vez de texto livre.
   * Subordinação não tem lista fixa aqui — usa lista dinâmica de cargos
   * existentes, montada em DescricaoCargoModal.tsx (opcoesOverride). */
  opcoes?: string[];
  /** Além das opções fixas, mostra "Outro" pra digitar um valor livre. */
  permiteOutro?: boolean;
}

/** Nível de senioridade dentro do cargo (não confundir com colaboradores.nivel,
 * que é o nível hierárquico — Diretoria/Gerência/etc.). */
export const NIVEIS_DESCRICAO_CARGO = ["Júnior", "Pleno", "Sênior"];

/** Únicas localidades da MSB hoje — "Outro" cobre exceções (ex.: colaborador remoto). */
export const LOCALIDADES_DESCRICAO_CARGO = ["Lauro de Freitas"];

/** Ordem e agrupamento espelham as seções do formulário POP-RH-001 (Descrição de Cargo). */
export const CAMPOS_DESCRICAO_CARGO: CampoMeta[] = [
  { key: "codigoFormulario", label: "Código do formulário", grupo: "Dados do formulário (auditoria)" },
  { key: "revisaoFormulario", label: "Revisão", grupo: "Dados do formulário (auditoria)" },
  { key: "dataFormulario", label: "Data do formulário", grupo: "Dados do formulário (auditoria)" },
  { key: "dataRevisaoCargo", label: "Data de revisão deste cargo", grupo: "Dados do formulário (auditoria)" },
  { key: "subordinacao", label: "Subordinação", grupo: "Informações do cargo" },
  { key: "localidade", label: "Localidade", grupo: "Informações do cargo", opcoes: LOCALIDADES_DESCRICAO_CARGO, permiteOutro: true },
  { key: "nivelDocumento", label: "Nível", grupo: "Informações do cargo", opcoes: NIVEIS_DESCRICAO_CARGO },
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

/** "Data do formulário" é a data de CRIAÇÃO do documento — nunca deve mudar
 * depois (só um RH corrigindo um erro de digitação, editando o campo
 * diretamente). "Data de revisão deste cargo" é quem marca "o conteúdo
 * mudou nesta data" — deve atualizar sozinha toda vez que algum campo de
 * conteúdo (não os 4 de "Dados do formulário (auditoria)" em si) é editado
 * ou uma proposta de Gestor é aprovada, sem depender de alguém lembrar de
 * editá-la manualmente. Formato "dd/mm/aaaa" pra bater com o que já está
 * cadastrado nesses dois campos (texto livre, nunca ISO). */
export function dataRevisaoHoje(): string {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${hoje.getFullYear()}`;
}

/** Campos que nunca disparam a atualização automática de `dataRevisaoCargo`
 * — são os próprios dados de controle do formulário, editados só quando o
 * RH está corrigindo o registro em si, não o conteúdo do cargo. */
const CAMPOS_SEM_AUTO_REVISAO = new Set<CampoDescricaoCargo>(["codigoFormulario", "revisaoFormulario", "dataFormulario", "dataRevisaoCargo"]);

export function disparaAutoRevisao(campo: CampoDescricaoCargo): boolean {
  return !CAMPOS_SEM_AUTO_REVISAO.has(campo);
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
    status: "Sem descrição",
    pendente: null,
    elaboradoPor: "",
    elaboradoEm: "",
    aprovadoPor: "",
    aprovadoEm: "",
  };
}
