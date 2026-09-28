// Regras puras de Habilidades e Requisitos (testadas isoladamente).
import type { PessoaDesenvolvimento, Situacao, TipoTreinamento } from "./devRepository";

export const TODOS = "";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function valoresUnicos(pessoas: PessoaDesenvolvimento[], campo: "departamento" | "cargo"): string[] {
  return [...new Set(pessoas.map((p) => p[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Pessoas do escopo que passam nos filtros de Departamento/Setor, Cargo e busca por nome. */
export function filtrarPessoas(pessoas: PessoaDesenvolvimento[], f: { departamento: string; cargo: string; busca: string }): PessoaDesenvolvimento[] {
  const termo = normalizar(f.busca);
  return pessoas.filter(
    (p) => (f.departamento === TODOS || p.departamento === f.departamento) && (f.cargo === TODOS || p.cargo === f.cargo) && (!termo || normalizar(p.nome).includes(termo)),
  );
}

/** GAP = diferença entre o requisito vigente do cargo e a situação atual do colaborador. */
export const SITUACOES_GAP: Situacao[] = ["pendente", "vencido", "revisao_pendente", "a_vencer", "agendado"];

export const FILTROS_GAP: { rotulo: string; situacoes: Situacao[] }[] = [
  { rotulo: "Todos", situacoes: SITUACOES_GAP },
  { rotulo: "Pendentes", situacoes: ["pendente"] },
  { rotulo: "Vencidos", situacoes: ["vencido"] },
  { rotulo: "Nova revisão", situacoes: ["revisao_pendente"] },
  { rotulo: "A vencer", situacoes: ["a_vencer"] },
];

export function ehGap(s: Situacao): boolean {
  return SITUACOES_GAP.includes(s);
}

/** Tipo do treinamento pré-preenchido a partir do gap — só quando é seguro inferir; senão, quem registra escolhe. */
export function tipoSugeridoParaGap(situacao: Situacao, codigoDocumento: string | null): TipoTreinamento | "" {
  const codigo = (codigoDocumento ?? "").toUpperCase();
  const ehInstrucao = /^I(T)?-/.test(codigo); // códigos de Instrução de Trabalho (prefixo I- ou I+T-)
  const ehPOP = /^P(OP)?-/.test(codigo);
  if (ehInstrucao) return "instrucao_trabalho";
  if (situacao === "revisao_pendente" && ehPOP) return "revisao_pop";
  if (situacao === "vencido" || situacao === "a_vencer") return "reciclagem";
  return "";
}
