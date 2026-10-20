// Quadro "Permissões por perfil" da tela Acessos. Cada célula é CALCULADA pelas mesmas funções que o menu e as telas usam (permissoes.ts):
// se a regra mudar lá, o quadro muda junto — nada de texto fixo que envelheça. Os qualificadores ("só a equipe", "somente leitura") descrevem
// o escopo já aplicado por usePortalData/colaboradoresListagem/canSeeMov e são o único texto fixo.

import {
  acessaPortalCompleto,
  canCreate,
  navCargos,
  navColab,
  navDesenvolvimento,
  navRegistro,
  podeVerFinanceiroDesligamentos,
  podeVerSalario,
  showEquipes,
} from "./permissoes";
import type { Perfil } from "../types/domain";

export const PERFIS_PORTAL: Perfil[] = ["RH", "Gestor", "Diretoria", "Colaborador"];

export interface LinhaPermissao {
  /** Agrupa as linhas no quadro. */
  grupo: "Consulta" | "Ação" | "Financeiro";
  item: string;
  /** Texto por perfil; "—" = sem acesso. */
  valores: Record<Perfil, string>;
}

const sim = (ok: boolean, texto: string) => (ok ? texto : "—");

export function permissoesPorPerfil(): LinhaPermissao[] {
  const por = (f: (p: Perfil) => string): Record<Perfil, string> => Object.fromEntries(PERFIS_PORTAL.map((p) => [p, f(p)])) as Record<Perfil, string>;
  const completo = acessaPortalCompleto;
  return [
    { grupo: "Consulta", item: "Dashboard gerencial", valores: por((p) => sim(completo(p), p === "Gestor" ? "Sim (recorte da sua equipe)" : "Sim")) },
    { grupo: "Consulta", item: "Colaboradores", valores: por((p) => sim(completo(p) && navColab(p), p === "RH" ? "Vê todos e edita" : p === "Gestor" ? "Somente leitura — sua equipe (direta e indireta)" : "Somente leitura — empresa toda")) },
    { grupo: "Consulta", item: "Departamentos, Desligados e Acessos", valores: por((p) => sim(completo(p) && navRegistro(p), "Sim")) },
    { grupo: "Consulta", item: "Cargos e descrições de cargo", valores: por((p) => sim(completo(p) && navCargos(p), p === "RH" ? "Vê todos e edita" : p === "Gestor" ? "Cargos da sua liderança (edita as seções liberadas)" : "Vê todos; revisa e aprova alterações")) },
    { grupo: "Consulta", item: "Equipes por gestor (Dashboard)", valores: por((p) => sim(completo(p) && showEquipes(p), p === "Gestor" ? "Sua equipe" : "Empresa toda")) },
    { grupo: "Consulta", item: "Movimentações, workflow e histórico", valores: por((p) => sim(completo(p), p === "RH" ? "Todas" : p === "Gestor" ? "Da sua equipe, as que solicitou e as que aprova" : "As que aprova ou solicitou (Diretor Industrial: todas, só leitura)")) },
    { grupo: "Consulta", item: "Salário e custo mensal do colaborador", valores: por((p) => sim(completo(p) && podeVerSalario(p), p === "Gestor" ? "Só da sua equipe" : "Sim")) },
    { grupo: "Consulta", item: "Desenvolvimento (Habilidades, Necessidades, Treinamentos)", valores: por((p) => (p === "Colaborador" ? "Só os treinamentos" : sim(navDesenvolvimento(p), "Sim"))) },
    { grupo: "Consulta", item: "Avaliações de experiência e Gestão de Desempenho", valores: por((p) => (p === "Colaborador" ? "Só a própria avaliação (AVD)" : sim(completo(p), p === "Gestor" ? "Sua equipe" : "Sim"))) },
    { grupo: "Ação", item: "Abrir nova movimentação", valores: por((p) => sim(completo(p) && canCreate(p), p === "Gestor" ? "Para a sua equipe" : "Sim")) },
    { grupo: "Ação", item: "Aprovar ou reprovar etapas do workflow", valores: por((p) => sim(completo(p), "Somente as etapas em que é o aprovador do fluxo")) },
    { grupo: "Ação", item: "Gestão de acessos (liberar acesso ao portal)", valores: por((p) => sim(completo(p) && navRegistro(p), "Sim — nada é liberado ou revogado automaticamente")) },
    { grupo: "Financeiro", item: "Valores financeiros de desligamentos (individuais e totais)", valores: por((p) => sim(podeVerFinanceiroDesligamentos(p), "Visualiza e registra (exclusivo do RH)")) },
  ];
}

/** Orientações de acesso e segurança — o que o portal faz hoje (login por link no e-mail, provisionamento pelo RH, escopo por perfil). */
export const ORIENTACOES_SEGURANCA: { titulo: string; texto: string }[] = [
  { titulo: "Login corporativo", texto: "O acesso é por link enviado ao e-mail corporativo (@msbbrasil.com). Só funciona para quem tem conta provisionada: o portal não cria conta sozinho." },
  { titulo: "Provisionamento", texto: "Quem provisiona é o RH, nesta tela. Candidatos: RH, Diretoria e quem lidera pelo menos um colaborador ativo. Liberar o acesso é uma ação manual do RH; nenhum acesso é concedido ou revogado automaticamente." },
  { titulo: "Acesso por perfil", texto: "O perfil vem do cadastro: cargo de CEO/Diretor → Diretoria; departamento Recursos Humanos → RH; quem aparece como gestor imediato de alguém → Gestor. Colaborador comum só responde a própria Avaliação de Desempenho." },
  { titulo: "Visibilidade de equipes", texto: "O Gestor vê somente a própria equipe (reportes diretos e indiretos). A Diretoria vê o que decide e o que solicitou; o RH vê tudo." },
  { titulo: "Restrições de informação", texto: "Dados financeiros de desligamentos (valores individuais e totais) são exclusivos do RH e protegidos também no servidor. O acesso direto do navegador às tabelas financeiras é bloqueado." },
  { titulo: "Quem saiu da empresa", texto: "Colaborador desligado sai do cadastro de acessos e as ações do servidor o recusam. Se ainda houver conta de login, ela aparece na lista com a situação \"Desligado\" para o RH decidir a revogação; conta banida no Supabase Auth aparece como \"Revogado\" (não consegue entrar)." },
];
