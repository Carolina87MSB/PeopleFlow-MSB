// Lista da tela Acessos: quem pode receber acesso (buildAccess) + quem JÁ SAIU da empresa mas ainda tem conta de login provisionada (para o RH
// decidir a revogação). Somente consulta: nada aqui concede, revoga ou altera acesso.

import { buildAccess, emailOf, perfilOf } from "./hierarquia.js";
import { estaAtivoHoje } from "./situacaoFuncional.js";
import type { Colaborador, Perfil } from "../types/domain.js";

export interface ContaAcessoLinha {
  nome: string;
  cargo: string;
  depto: string;
  email: string;
  perfil: Perfil;
  provisionado: boolean;
  /** Situação do colaborador no cadastro hoje (mesma regra central: desligamento com data futura continua ativo até o dia). */
  situacao: "ativo" | "desligado";
  /** Data de desligamento "dd/mmm/aaaa" quando desligado. */
  dataDesligamento: string | null;
}

export function montarContasAcesso(colaboradores: Colaborador[], emailsComConta: Set<string>): ContaAcessoLinha[] {
  const ativas: ContaAcessoLinha[] = buildAccess(colaboradores).map((conta) => ({
    ...conta,
    provisionado: emailsComConta.has(conta.email),
    situacao: "ativo" as const,
    dataDesligamento: null,
  }));
  // Quem saiu e ainda tem conta de login: aparece para decisão do RH. E-mail que também pertence a alguém ativo (homônimo) não é listado como desligado.
  const gestoresImediatos = new Set(colaboradores.map((c) => c.gestor));
  const emailsAtivos = new Set(colaboradores.filter((c) => estaAtivoHoje(c, "acesso")).map((c) => emailOf(c.nome).toLowerCase()));
  const vistos = new Set<string>();
  const desligadas: ContaAcessoLinha[] = [];
  for (const c of colaboradores) {
    if (estaAtivoHoje(c, "acesso")) continue;
    const email = emailOf(c.nome).toLowerCase();
    if (!emailsComConta.has(email) || emailsAtivos.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    desligadas.push({ nome: c.nome, cargo: c.cargo, depto: c.depto, email, perfil: perfilOf(c, gestoresImediatos), provisionado: true, situacao: "desligado", dataDesligamento: c.dataDesligamento || null });
  }
  return [...ativas, ...desligadas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))];
}
