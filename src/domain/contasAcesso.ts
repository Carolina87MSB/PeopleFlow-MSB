// Lista da tela Acessos: quem pode receber acesso (buildAccess) + quem JÁ SAIU da empresa mas ainda tem conta de login (ativa ou revogada), para o RH
// acompanhar. Somente consulta: nada aqui concede, revoga ou altera acesso.
//
// Estado do acesso (derivado do Supabase Auth):  "Provisionado" = conta existe e pode entrar · "Sem acesso" = não há conta · "Revogado" = a conta existe,
// mas está banida (não consegue entrar nem renovar a sessão).

import { buildAccess, emailOf, perfilOf } from "./hierarquia.js";
import { estaAtivoHoje } from "./situacaoFuncional.js";
import type { Colaborador, Perfil } from "../types/domain.js";

export interface ContaAcessoLinha {
  nome: string;
  cargo: string;
  depto: string;
  email: string;
  perfil: Perfil;
  /** Conta existe e NÃO está banida (consegue entrar). Conta banida é `revogado`, nunca `provisionado`. */
  provisionado: boolean;
  /** Conta existe, mas está banida no Supabase Auth. */
  revogado: boolean;
  /** Situação do colaborador no cadastro hoje (mesma regra central: desligamento com data futura continua ativo até o dia). */
  situacao: "ativo" | "desligado";
  /** Data de desligamento "dd/mmm/aaaa" quando desligado. */
  dataDesligamento: string | null;
}

export type SituacaoAcesso = "provisionado" | "sem_acesso" | "revogado";
export const situacaoDoAcesso = (c: Pick<ContaAcessoLinha, "provisionado" | "revogado">): SituacaoAcesso => (c.revogado ? "revogado" : c.provisionado ? "provisionado" : "sem_acesso");

/**
 * @param emailsComConta   e-mails que TÊM conta no Supabase Auth (ativa ou banida)
 * @param emailsRevogados  subconjunto de `emailsComConta` cuja conta está banida
 */
export function montarContasAcesso(colaboradores: Colaborador[], emailsComConta: Set<string>, emailsRevogados: Set<string> = new Set()): ContaAcessoLinha[] {
  const revogado = (email: string) => emailsComConta.has(email) && emailsRevogados.has(email);
  const ativas: ContaAcessoLinha[] = buildAccess(colaboradores).map((conta) => ({
    ...conta,
    provisionado: emailsComConta.has(conta.email) && !revogado(conta.email),
    revogado: revogado(conta.email),
    situacao: "ativo" as const,
    dataDesligamento: null,
  }));
  // Quem saiu e ainda tem conta de login (ativa ou já revogada): aparece para o RH acompanhar. E-mail que também pertence a alguém ativo (homônimo) não é
  // listado como desligado.
  const gestoresImediatos = new Set(colaboradores.map((c) => c.gestor));
  const emailsAtivos = new Set(colaboradores.filter((c) => estaAtivoHoje(c, "acesso")).map((c) => emailOf(c.nome).toLowerCase()));
  const vistos = new Set<string>();
  const desligadas: ContaAcessoLinha[] = [];
  for (const c of colaboradores) {
    if (estaAtivoHoje(c, "acesso")) continue;
    const email = emailOf(c.nome).toLowerCase();
    if (!emailsComConta.has(email) || emailsAtivos.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    desligadas.push({
      nome: c.nome,
      cargo: c.cargo,
      depto: c.depto,
      email,
      perfil: perfilOf(c, gestoresImediatos),
      provisionado: !revogado(email),
      revogado: revogado(email),
      situacao: "desligado",
      dataDesligamento: c.dataDesligamento || null,
    });
  }
  return [...ativas, ...desligadas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))];
}

export interface FiltrosAcesso {
  perfil: string;
  acesso: string;
  colaborador: string;
}

/** Filtros da tela Acessos: perfil (Todos|RH|Gestor|Diretoria), acesso (Todos|Provisionado|Sem acesso|Revogado) e colaborador (Todos|Ativo|Desligado). */
export function filtrarContasAcesso<T extends Pick<ContaAcessoLinha, "perfil" | "provisionado" | "revogado"> & { situacao?: "ativo" | "desligado" }>(contas: T[], f: FiltrosAcesso): T[] {
  return contas.filter((c) => {
    const situacao = c.situacao ?? "ativo";
    if (f.perfil !== "Todos" && c.perfil !== f.perfil) return false;
    const acesso = situacaoDoAcesso(c);
    if (f.acesso === "Provisionado" && acesso !== "provisionado") return false;
    if (f.acesso === "Sem acesso" && acesso !== "sem_acesso") return false;
    if (f.acesso === "Revogado" && acesso !== "revogado") return false;
    if (f.colaborador === "Ativo" && situacao !== "ativo") return false;
    if (f.colaborador === "Desligado" && situacao !== "desligado") return false;
    return true;
  });
}
