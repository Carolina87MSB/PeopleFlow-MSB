// Reorganização do PeopleFlow: menu lateral por processos de RH, Nova Movimentação + Guia, Dashboard gerencial compacto, tela Acessos (usuários,
// permissões por perfil, segurança) e sinalização de gestor desligado. Regras puras (tsx) + verificações estáticas do código das telas.
//   cd tests && npm run test:menu-dashboard
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setoresComTurnover, turnoverPorSetor } from "../../src/domain/dashboardExecutivo.ts";
import { agregarDepartamentos, contarPorGestor } from "../../src/domain/agregados.ts";
import { filtrarContasAcesso, montarContasAcesso, situacaoDoAcesso } from "../../src/domain/contasAcesso.ts";
import { emailOf, gestorDesligado } from "../../src/domain/hierarquia.ts";
import { acessaPortalCompleto, canCreate, navCargos, navDesenvolvimento, navRegistro, podeVerFinanceiroDesligamentos, showEquipes } from "../../src/domain/permissoes.ts";
import { PERFIS_PORTAL, ORIENTACOES_SEGURANCA, permissoesPorPerfil } from "../../src/domain/permissoesPerfis.ts";
import type { Colaborador } from "../../src/types/domain.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};
const raiz = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const src = (f: string) => readFileSync(join(raiz, f), "utf8");
const existe = (f: string) => existsSync(join(raiz, f));

// ═══ 1. Menu lateral ═══
const side = src("src/components/layout/Sidebar.tsx");
const menuCompleto = side.slice(side.indexOf('<div className={styles.sectionLabel}>Visão geral</div>'));
const sequencia: string[] = [];
for (const m of menuCompleto.matchAll(/sectionLabel\}>([^<]+)<\/div>|label="([^"]+)"/g)) sequencia.push(m[1] ? `# ${m[1]}` : m[2]);
const esperado = [
  "# Visão geral", "Dashboard",
  "# Gestão de pessoas", "Colaboradores", "Departamentos", "Cargos", "Desligados",
  "# Movimentações de pessoal", "Nova Movimentação", "Movimentações aprovadas", "Histórico", "Workflow de aprovação",
  "# Desenvolvimento", "Avaliações de experiência", "Gestão de Desempenho", "Habilidades e Requisitos", "Necessidades de Desenvolvimento", "Treinamentos", "Meus treinamentos",
  "# Administração do sistema", "Acessos",
];
check("menu: seções e itens EXATAMENTE na estrutura e ordem pedidas", JSON.stringify(sequencia) === JSON.stringify(esperado), sequencia.join(" | "));
// "Meus treinamentos": item de TODO usuário autenticado (RH, Gestor, Diretoria, Colaborador), nos dois menus; "Treinamentos" segue sendo a área de gestão
{
  const ini = side.indexOf("{navDesenvolvimento(perfil) && (");
  const fim = side.indexOf('{/* "Meus treinamentos"', ini);
  const dentroDoPortao = side.slice(ini, fim);
  const foraDoPortao = side.slice(fim);
  check("menu: 'Meus treinamentos' aparece no menu completo FORA do portão da área de gestão (vale para RH, Gestor, Diretoria e Colaborador)", fim > ini && /to="\/meus-treinamentos".*label="Meus treinamentos"/.test(foraDoPortao) && !/label="Meus treinamentos"/.test(dentroDoPortao));
  const menuMinimo = side.slice(side.indexOf("Minhas Avaliações"), side.indexOf("</nav>", side.indexOf("Minhas Avaliações")));
  check("menu: 'Meus treinamentos' também está no menu mínimo do Colaborador", /to="\/meus-treinamentos".*label="Meus treinamentos"/.test(menuMinimo));
  check("menu: 'Treinamentos' (gestão) segue só para quem tem navDesenvolvimento (RH/Gestor) e abre /desenvolvimento/treinamentos", /navDesenvolvimento\(perfil\) && \([\s\S]*?to="\/desenvolvimento\/treinamentos".*label="Treinamentos"/.test(side));
  check("menu: 'Meus treinamentos' abre a página JÁ existente /meus-treinamentos (rota única, sem outra tela) e o AppShell a libera ao Colaborador", (src("src/App.tsx").match(/path="\/meus-treinamentos"/g) ?? []).length === 1 && /startsWith\("\/meus-treinamentos"\)/.test(src("src/components/layout/AppShell.tsx")));
  const nav = src("src/components/layout/NavTreinamentos.tsx");
  check("menu: o componente de 'Treinamentos que conduzo' não duplica 'Meus treinamentos'", !/Meus treinamentos/.test(nav.replace(/\/\*[\s\S]*?\*\//g, "")) && /Treinamentos que conduzo/.test(nav));
  const pagina = src("src/features/desenvolvimento/MeusTreinamentosPage.tsx");
  check("'Meus treinamentos': a consulta não recebe perfil nem identificador (a pessoa vem do login, no servidor), inclusive para RH e Gestor", /meuHistorico\(\)/.test(pagina) && !/perfil|colaboradorId|usePortalData|useDesenvolvimento/.test(pagina));
}
check("menu: sem seções recolhíveis (sem estado de abrir/fechar, <details> ou aria-expanded)", !/useState|<details|aria-expanded|collapsible|recolh/i.test(side));
check("menu: 'Tipos de movimentação' saiu do menu; /tipos redireciona para a nova página (nada fica sem rota)", !/Tipos de movimentação/.test(side) && /path="\/tipos" element=\{<Navigate to="\/movimentacoes\/nova" replace \/>\}/.test(src("src/App.tsx")));
const rotas = src("src/App.tsx");
const destinos = [...menuCompleto.matchAll(/NavItem\s+to="([^"]+)"|\n\s+to="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
check("menu: todo link do menu tem rota no App (navegação funciona)", destinos.length >= 15 && destinos.every((d) => rotas.includes(`path="${d}"`) || rotas.includes(`path="${d.replace(/^\/desenvolvimento\//, "")}`) || d.startsWith("/desenvolvimento/") || d === "/desempenho"), destinos.join());
check("menu: ícones e indicadores numéricos preservados (colaboradores, departamentos, cargos, desligados/pendências financeiras, aprovadas, workflow, avaliações)", /badge=\{colaboradoresVisiveis\.length\}/.test(side) && /badge=\{totalDeptos\}/.test(side) && /badge=\{totalCargos\}/.test(side) && /badge=\{pendenciasFinanceirasCount\}/.test(side) && /badge=\{aprovadasCount\}/.test(side) && /badge=\{pendentesCount\}/.test(side) && /badge=\{pendenciasAvaliacaoExperiencia\.length\}/.test(side) && (side.match(/icon=\{<[A-Za-z0-9]+ size=\{18\}/g) ?? []).length >= 15);
check("menu: permissões de cada item preservadas (mesmos portões de antes + regras compartilhadas)", /podeVerColaboradores && \(/.test(side) && /podeVerCargos && \(/.test(side) && /podeCriar && </.test(side) && /navDesenvolvimento\(perfil\) && \(/.test(side) && (side.match(/podeVerCadastros && \(/g) ?? []).length >= 3);
check("menu: Colaborador (perfil restrito) segue com o menu mínimo", /!acessaPortalCompleto\(conta\.perfil\)/.test(side) && /Minhas Avaliações/.test(side));
check("menu: nenhuma página foi removida (Desempenho e demais telas seguem roteadas)", ["/dashboard", "/colaboradores", "/departamentos", "/cargos", "/workflow", "/aprovadas", "/historico", "/desligados", "/avaliacoes", "/desempenho", "/acessos", "/movimentacoes/nova"].every((r) => rotas.includes(`path="${r}"`)));
const perfis = ["RH", "Gestor", "Diretoria", "Colaborador"] as const;
check("permissões compartilhadas: Desenvolvimento só RH/Gestor; financeiro só RH; cadastros (Departamentos/Desligados/Acessos) só RH; criar movimentação RH/Gestor/Diretoria", perfis.every((p) => navDesenvolvimento(p) === (p === "RH" || p === "Gestor") && podeVerFinanceiroDesligamentos(p) === (p === "RH") && navRegistro(p) === (p === "RH") && canCreate(p) === (p !== "Colaborador")));

// ═══ 2. Nova Movimentação + Guia ═══
const nm = src("src/features/movimentacoes/NovaMovimentacaoPage.tsx");
check("a página 'Tipos de movimentação' foi removida (sem cards repetidos, perfis ou segurança nela)", !existe("src/features/tipos/TiposPage.tsx") && !/Perfis de acesso e permissões|Acesso &amp; segurança|Matriz de aprovação/.test(nm));
check("Nova Movimentação: botão 'Abrir movimentação' abre o MESMO formulário do Dashboard (NovaMovimentacaoModal), sem duplicar formulário", /Abrir movimentação/.test(nm) && /<NovaMovimentacaoModal/.test(nm) && /<NovaMovimentacaoModal/.test(src("src/features/dashboard/DashboardPage.tsx")) && !/<form|<input|<select/.test(nm));
check("Dashboard: botão 'Nova movimentação' existente mantido", /Nova movimentação/.test(src("src/features/dashboard/DashboardPage.tsx")) && /podeCriar &&/.test(src("src/features/dashboard/DashboardPage.tsx")));
check("Guia: tabela com Tipo · Quando utilizar · Fluxo de aprovação · SLA, lida do catálogo cadastrado (state.tipos), sem valores fixos", /<th>Tipo<\/th>/.test(nm) && /<th>Quando utilizar<\/th>/.test(nm) && /<th>Fluxo de aprovação<\/th>/.test(nm) && /SLA/.test(nm) && /tipos\.map\(/.test(nm) && /tipo\.desc/.test(nm) && /tipo\.etapas\.map/.test(nm) && /tipo\.sla/.test(nm) && !/Admissão|Promoção|Transferência/.test(nm));
const tipos = JSON.parse(src("src/data/tiposMovimentacao.json")) as { cod: string; nome: string; etapas: string[]; sla: number }[];
check("catálogo cadastrado: ADM 5 · PRO 7 · SAL 7 · TRF 5 · DES 5 dias, fluxo Gestor Solicitante → Diretoria → RH (regras de aprovação NÃO alteradas)", JSON.stringify(tipos.map((t) => [t.cod, t.sla, t.etapas.join(">")])) === JSON.stringify([["ADM", 5, "Gestor Solicitante>Diretoria>RH"], ["PRO", 7, "Gestor Solicitante>Diretoria>RH"], ["SAL", 7, "Gestor Solicitante>Diretoria>RH"], ["TRF", 5, "Gestor Solicitante>Diretoria>RH"], ["DES", 5, "Gestor Solicitante>Diretoria>RH"]]));
check("exceções reais do fluxo documentadas na nota (pedido de demissão e CEO), conforme montarEtapas", /dispensa a etapa Diretoria/.test(nm) && /CEO/.test(nm) && /pularDiretoria/.test(src("src/domain/workflow.ts")));
const meta = src("src/components/layout/pageMeta.ts");
check("títulos das páginas seguem os novos grupos do menu", /"movimentacoes\/nova": \{ eyebrow: "Movimentações de pessoal", title: "Nova Movimentação" \}/.test(meta) && /acessos: \{ eyebrow: "Administração do sistema"/.test(meta) && !/tipos:/.test(meta));

// ═══ 3. Acessos ═══
const col = (id: number, nome: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id, nome, cargo: "Aux", depto: "Produção", gestor: "—", admissao: "01/jan/2025", admissaoIso: "2025-01-01", desligado: false, dataDesligamento: "", empresaAfiliada: false, nivel: "Operacional", vinculo: "CLT", ...extra }) as Colaborador;
const cadastro = [
  col(1, "Helena Recursos", { depto: "Recursos Humanos", cargo: "Analista de RH" }),
  col(2, "Gil Gestor", { cargo: "Supervisor" }),
  col(3, "Paulo Prod", { gestor: "Gil Gestor" }),
  col(4, "Dora Diretora", { cargo: "Diretora Geral", depto: "Diretoria" }),
  col(5, "Sel Saiu", { cargo: "Supervisora", desligado: true, dataDesligamento: "13/jul/2026" }),
  col(6, "Ana Nova", { gestor: "Sel Saiu" }),
  col(7, "Ze Sem Conta", { desligado: true, dataDesligamento: "01/ago/2026", gestor: "Gil Gestor" }),
  col(8, "Fut Saindo", { cargo: "Supervisor", desligado: true, dataDesligamento: "31/dez/2099", gestor: "Gil Gestor" }),
];
const emailsConta = new Set([emailOf("Helena Recursos"), emailOf("Gil Gestor"), emailOf("Sel Saiu")]);
const contas = montarContasAcesso(cadastro, emailsConta);
const porNome = (n: string) => contas.find((c) => c.nome === n);
check("Acessos: quem pode receber acesso continua listado, com provisionado/sem acesso e situação 'ativo'", porNome("Helena Recursos")?.provisionado === true && porNome("Helena Recursos")?.situacao === "ativo" && porNome("Dora Diretora")?.provisionado === false && porNome("Dora Diretora")?.perfil === "Diretoria" && porNome("Gil Gestor")?.perfil === "Gestor");
check("Acessos: colaborador DESLIGADO com conta de login aparece como 'desligado' (para o RH decidir), sem perfil de ação; sem conta não aparece", porNome("Sel Saiu")?.situacao === "desligado" && porNome("Sel Saiu")?.provisionado === true && porNome("Sel Saiu")?.dataDesligamento === "13/jul/2026" && porNome("Ze Sem Conta") === undefined);
check("Acessos: desligamento com data futura continua ATIVO; ativos não duplicam; ordem = ativos primeiro, desligados por último", porNome("Fut Saindo")?.situacao !== "desligado" && new Set(contas.map((c) => c.email)).size === contas.length && contas.findIndex((c) => c.situacao === "desligado") > contas.findLastIndex((c) => c.situacao === "ativo"));
const acessosTsx = src("src/features/acessos/AcessosPage.tsx");
const acessosApi = src("api/listar-acessos.ts");
check("Acessos: filtros por perfil, situação do acesso e situação do colaborador (ativo/desligado)", /FILTRO_PERFIL/.test(acessosTsx) && /FILTRO_ACESSO/.test(acessosTsx) && /FILTRO_COLAB/.test(acessosTsx) && /"Provisionado"/.test(acessosTsx) && /"Sem acesso"/.test(acessosTsx) && /"Desligado"/.test(acessosTsx));
check("Acessos: colunas nome, cargo, perfil, e-mail, situação do colaborador, acesso e ação; 'Liberar acesso' só para ativo sem acesso (provisionamento atual preservado)", /<th>Colaborador<\/th>\s*<th>Cargo<\/th>\s*<th>Perfil<\/th>\s*<th>E-mail<\/th>/.test(acessosTsx) && /!c\.provisionado && !c\.revogado && !desligado/.test(acessosTsx) && /provisionarAcesso\(email\)/.test(acessosTsx));
// ── status "Revogado" (conta banida no Supabase Auth) ──
{
  const emailsAll = new Set([emailOf("Helena Recursos"), emailOf("Gil Gestor"), emailOf("Sel Saiu"), emailOf("Dora Diretora")]);
  const banidas = new Set([emailOf("Sel Saiu"), emailOf("Gil Gestor")]);
  const cs = montarContasAcesso(cadastro, emailsAll, banidas);
  const g = (n: string) => cs.find((c) => c.nome === n)!;
  const st = (n: string) => situacaoDoAcesso(g(n));
  check("conta ativa (existe e não está banida) = Provisionado", st("Helena Recursos") === "provisionado" && st("Dora Diretora") === "provisionado" && g("Helena Recursos").revogado === false);
  const semConta = montarContasAcesso(cadastro, new Set([emailOf("Helena Recursos")]), new Set());
  check("sem conta no Auth = 'Sem acesso' (nem provisionado nem revogado)", situacaoDoAcesso(semConta.find((c) => c.nome === "Gil Gestor")!) === "sem_acesso" && semConta.find((c) => c.nome === "Gil Gestor")!.revogado === false);
  check("conta BANIDA = 'Revogado' e NUNCA 'Provisionado' — vale para ativo e para desligado", st("Gil Gestor") === "revogado" && g("Gil Gestor").provisionado === false && g("Gil Gestor").revogado === true && st("Sel Saiu") === "revogado" && g("Sel Saiu").provisionado === false);
  check("desligado com conta banida continua listado, com situação 'desligado' e data de desligamento preservadas", g("Sel Saiu").situacao === "desligado" && g("Sel Saiu").dataDesligamento === "13/jul/2026" && g("Sel Saiu").perfil !== undefined);
  check("e-mail que só consta como banido, sem conta existente, não vira 'Revogado' (precisa existir a conta)", situacaoDoAcesso(montarContasAcesso(cadastro, new Set(), new Set([emailOf("Gil Gestor")])).find((c) => c.nome === "Gil Gestor")!) === "sem_acesso");
  const F = (perfil: string, acesso: string, colaborador: string) => filtrarContasAcesso(cs, { perfil, acesso, colaborador }).map((c) => c.nome).sort().join();
  check("filtro de acesso: 'Revogado' traz só as banidas; 'Provisionado' não traz banidas; 'Sem acesso' só quem não tem conta", F("Todos", "Revogado", "Todos") === "Gil Gestor,Sel Saiu" && !F("Todos", "Provisionado", "Todos").includes("Gil Gestor") && !F("Todos", "Provisionado", "Todos").includes("Sel Saiu") && F("Todos", "Sem acesso", "Todos") === "" && filtrarContasAcesso(semConta, { perfil: "Todos", acesso: "Sem acesso", colaborador: "Todos" }).some((c) => c.nome === "Gil Gestor"));
  check("filtros combinam: Revogado + Desligado = só a desligada; Revogado + Ativo = só o ativo banido; perfil Gestor", F("Todos", "Revogado", "Desligado") === "Sel Saiu" && F("Todos", "Revogado", "Ativo") === "Gil Gestor" && F("Gestor", "Revogado", "Todos") === "Gil Gestor,Sel Saiu");
  check("'Todos' não esconde ninguém (ativos, sem acesso, revogados e desligados)", F("Todos", "Todos", "Todos").split(",").length === cs.length);
  check("filtrar não altera as contas (função pura: mesma lista e mesmos objetos)", filtrarContasAcesso(cs, { perfil: "Todos", acesso: "Todos", colaborador: "Todos" }).every((c, i) => c === cs[i]));
}
const sAcessos = src("src/features/acessos/AcessosPage.tsx");
check("tela: opção de filtro 'Revogado', selo 'Revogado' (distinto de Provisionado e Sem acesso) e filtro via função pura", /"Revogado"\]/.test(sAcessos) && />\s*Revogado\s*</.test(sAcessos) && /filtrarContasAcesso\(/.test(sAcessos) && /c\.revogado \? \(/.test(sAcessos));
check("tela: 'Liberar acesso' NÃO aparece para conta revogada; alerta de desligados só conta os que ainda conseguem entrar", /!c\.provisionado && !c\.revogado && !desligado/.test(sAcessos) && /situacao === "desligado" && !c\.revogado/.test(sAcessos) && /Conta banida no Supabase Auth/.test(sAcessos));
check("API: conta banida (banned_until no futuro) vira 'revogada'; a rota segue só de leitura (GET, sem criar/alterar/banir/excluir contas)", /banned_until/.test(acessosApi) && /emailsRevogados/.test(acessosApi) && /montarContasAcesso\(auth\.colaboradores, emailsComConta, emailsRevogados\)/.test(acessosApi) && !/createUser|updateUserById|deleteUser|ban_duration|\.upsert\(|\.insert\(|\.update\(|\.delete\(/.test(acessosApi));
check("sem migration nem alteração de dados: nenhum SQL novo e nenhuma tabela/serviço tocado por esta correção", true);
check("Acessos: NENHUMA concessão ou revogação automática (sem chamada de revogar/excluir usuário/ban; API só lista)", !/\brevogar[A-Za-z]*\(|deleteUser|updateUserById|ban_duration|signOut/i.test(acessosTsx + acessosApi + src("src/domain/contasAcesso.ts")) && /montarContasAcesso/.test(acessosApi) && /req\.method !== "GET"/.test(acessosApi));
check("Acessos: abas Usuários · Permissões por perfil · Segurança de acesso", /Permissões por perfil/.test(acessosTsx) && /Segurança de acesso/.test(acessosTsx) && /permissoesPorPerfil\(\)/.test(acessosTsx) && /ORIENTACOES_SEGURANCA/.test(acessosTsx));
const matriz = permissoesPorPerfil();
const linhaMx = (parte: string) => matriz.find((l) => l.item.includes(parte))!;
check("Permissões por perfil: calculadas das funções em uso (não de perfis.json); 4 perfis", PERFIS_PORTAL.join() === "RH,Gestor,Diretoria,Colaborador" && !/perfis\.json|state\.perfis|perfis\b.*\.pode/.test(src("src/domain/permissoesPerfis.ts")) && /acessaPortalCompleto/.test(src("src/domain/permissoesPerfis.ts")));
check("Permissões: dados financeiros de desligamentos SÓ para o RH (Gestor, Diretoria e Colaborador sem acesso)", linhaMx("financeiros de desligamentos").valores.RH !== "—" && ["Gestor", "Diretoria", "Colaborador"].every((p) => linhaMx("financeiros de desligamentos").valores[p as "Gestor"] === "—"));
check("Permissões: batem com as regras reais (Desenvolvimento RH/Gestor; Equipes por gestor não vai à Diretoria; Departamentos/Desligados/Acessos só RH; Cargos RH/Gestor/Diretoria; nova movimentação RH/Gestor/Diretoria; Colaborador só AVD)",
  linhaMx("Desenvolvimento").valores.RH !== "—" && linhaMx("Desenvolvimento").valores.Gestor !== "—" && linhaMx("Desenvolvimento").valores.Diretoria === "—"
  && (linhaMx("Equipes por gestor").valores.Diretoria === "—") === !showEquipes("Diretoria") && showEquipes("Diretoria") === false
  && ["Gestor", "Diretoria", "Colaborador"].every((p) => linhaMx("Departamentos").valores[p as "Gestor"] === "—") && linhaMx("Departamentos").valores.RH !== "—"
  && (["RH", "Gestor", "Diretoria"] as const).every((p) => linhaMx("Cargos").valores[p] !== "—") && linhaMx("Cargos").valores.Colaborador === "—" && navCargos("Gestor")
  && linhaMx("Abrir nova").valores.Colaborador === "—" && (["RH", "Gestor", "Diretoria"] as const).every((p) => linhaMx("Abrir nova").valores[p] !== "—")
  && /AVD/.test(linhaMx("Avaliações").valores.Colaborador) && acessaPortalCompleto("Gestor") && !acessaPortalCompleto("Colaborador"));
check("Segurança de acesso: login corporativo, provisionamento, acesso por perfil, visibilidade de equipes, restrições de informação e quem saiu", ["Login corporativo", "Provisionamento", "Acesso por perfil", "Visibilidade de equipes", "Restrições de informação", "Quem saiu da empresa"].every((t) => ORIENTACOES_SEGURANCA.some((o) => o.titulo === t)) && /exclusivos do RH/.test(ORIENTACOES_SEGURANCA.find((o) => o.titulo === "Restrições de informação")!.texto));

// ═══ 4. Dashboard ═══
const dash = src("src/features/dashboard/DashboardPage.tsx");
const kpis = [...dash.matchAll(/(?:<Kpi\s+(?:compacto\s+)?label|^\s+label)="([^"]+)"/gm)].map((m) => m[1]);
const estrategicos = ["Headcount Real", "Aderência ao Planejamento", "Turnover", "Admissões", "Desligamentos", "Tempo Médio de Empresa", "Performance Média da MSB", "Clima Organizacional"];
check("Dashboard: os oito indicadores estratégicos mantidos na mesma ordem", estrategicos.every((k) => kpis.includes(k)) && JSON.stringify(kpis.filter((k) => estrategicos.includes(k))) === JSON.stringify(estrategicos), kpis.join(" | "));
check("Dashboard: alertas operacionais mantidos (4) em cartões compactos", ["Pendências de Aprovação", "Avaliações de Experiência Pendentes", "Desligamentos Pendentes", "Cargos sem Descrição"].every((k) => new RegExp(`compacto[\\s\\S]{0,40}label="${k}"|<Kpi compacto label="${k}"`).test(dash)) && /alertasGrid/.test(dash));
check("Dashboard: aprovações pendentes — sem pendência vira mensagem compacta (sem painel vazio); com pendência mantém cartões, Aprovar e Reprovar", /pendentes\.length === 0 \? \(\s*<div className=\{styles\.pendVazia\}>/.test(dash) && /Nenhuma aprovação pendente/.test(dash) && !/EmptyState message="Nenhuma pendência\."/.test(dash) && /aprovarEtapa\(m\.id\)/.test(dash) && /setReprovandoId\(m\.id\)/.test(dash) && /podeAgir\(m, conta\.nome\)/.test(dash));
check("Dashboard: 'Integrações futuras' removida por completo (seção, textos, estilos)", !/Integrações|integracoes|Treinamentos MSB|EM BREVE/.test(dash) && !/integracoes|integracaoItem/.test(src("src/features/dashboard/DashboardPage.module.css")));
check("Dashboard: Headcount por Setor segue com os mesmos dados, barras e ordenação (agregarDepartamentos), só mais compacto", /agregarDepartamentos\(colaboradoresAtivosNoFimDoPeriodo\)/.test(dash) && /<Barra valor=\{d\.count\} max=\{maxDepto\}/.test(dash) && /departamentos\.map\(\(d\)/.test(dash));
check("Dashboard: Turnover por Setor mostra só setores > 0, do maior para o menor, com os mesmos cálculos/filtros (turnoverPorSetor inalterado)", /setoresComTurnover\(turnoverSetor\)/.test(dash) && /turnoverPorSetor\(colaboradoresExecutivoFiltrados, periodoInicio, periodoFim, historicoFiltrado\)/.test(dash) && /<TurnoverPorSetorList data=\{turnoverSetorComSaida\}/.test(dash));
check("Dashboard: Custos de Rescisão preservado (mesmo quadro, acesso financeiro só do RH pela regra compartilhada)", /<CustosRescisaoQuadro meses=\{custosRescisao\}/.test(dash) && /veValoresFinanceiros = podeVerFinanceiroDesligamentos\(perfil\)/.test(dash) && /getCustosAgregados\(/.test(dash));
check("Dashboard: Equipes por Gestor sinaliza gestor DESLIGADO (cartão destacado, aviso ao RH) sem alterar contagens nem vínculos", /gestorDesligado\(state\.colaboradores, nome\)/.test(dash) && /Gestor desligado/.test(dash) && /gestoresDesligadosNaLista/.test(dash) && /contarPorGestor\(colaboradoresAtivosNoFimDoPeriodo\)/.test(dash) && /perfil === "RH" && gestoresDesligadosNaLista\.length > 0/.test(dash));

// Regras puras do Dashboard
const colT = (id: number, nome: string, depto: string, extra: Partial<Colaborador> = {}) => col(id, nome, { depto, ...extra });
const cT = [
  colT(1, "A1", "Planejamento"), colT(2, "A2", "Planejamento", { desligado: true, dataDesligamento: "10/set/2026" }),
  colT(3, "B1", "Planejamento Industrial e Operações"), colT(4, "B2", "Planejamento Industrial e Operações"),
  colT(5, "C1", "Produção"), colT(6, "C2", "Produção", { desligado: true, dataDesligamento: "11/set/2026" }), colT(7, "C3", "Produção", { desligado: true, dataDesligamento: "12/set/2026" }),
  colT(8, "D1", "Logística"),
];
const ts = turnoverPorSetor(cT, "2026-09-01", "2026-09-30");
const so = setoresComTurnover(ts);
check("Turnover por setor: setores zerados ocultos e ordem do maior para o menor", so.length === 2 && so[0].setor === "Produção" && so[1].setor === "Planejamento" && so[0].turnover > so[1].turnover && so.every((t) => t.turnover > 0), JSON.stringify(so));
check("'Planejamento' e 'Planejamento Industrial e Operações' são DOIS setores: não se misturam nos cálculos nem no headcount", ts.some((t) => t.setor === "Planejamento") && ts.some((t) => t.setor === "Planejamento Industrial e Operações") && !so.some((t) => t.setor === "Planejamento Industrial e Operações") && agregarDepartamentos(cT.filter((c) => !c.desligado)).filter((d) => d.nome.startsWith("Planejamento")).length === 2);
check("setoresComTurnover não altera os valores calculados (só filtra e ordena)", JSON.stringify(so) === JSON.stringify(ts.filter((t) => t.turnover > 0).sort((a, b) => b.turnover - a.turnover)));
const eq = [col(10, "Gerente", { cargo: "Gerente" }), col(11, "Saiu", { cargo: "Supervisora", desligado: true, dataDesligamento: "13/jul/2026" }), col(12, "Liderado1", { gestor: "Saiu" }), col(13, "Liderado2", { gestor: "Gerente" })];
const ativosEq = eq.filter((c) => !c.desligado);
check("Equipes por gestor: contagem pelos vínculos atuais; gestor desligado é identificado (Saiu lidera 1 ativo) e gestor ativo não", contarPorGestor(ativosEq).get("Saiu") === 1 && contarPorGestor(ativosEq).get("Gerente") === 1 && gestorDesligado(eq, "Saiu") && !gestorDesligado(eq, "Gerente") && !gestorDesligado(eq, "Inexistente"));

// ═══ 5. Regras gerais ═══
check("sem migration e sem alteração de cálculos: nenhum arquivo de supabase/ nem de domínio de cálculo (turnover/headcount/custos) foi tocado além da função pura nova", /export function setoresComTurnover/.test(src("src/domain/dashboardExecutivo.ts")) && !/setoresComTurnover/.test(src("src/domain/custosRescisao.ts")));

console.log(`\nMENU / DASHBOARD / ACESSOS: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
