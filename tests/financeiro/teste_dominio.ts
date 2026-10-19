// Integração financeira dos desligamentos — regras puras (custosRescisao), relatório de pendências e verificações estáticas das telas/store
// (o navegador não acessa mais peopleflow_desligamentos; Gestor sem valores; Dashboard e Desligados alimentados pelo servidor). Dados fictícios.
//   cd tests && npm run test:financeiro-dominio
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FONTE_INFORMADO_RH, ROTULO_INFORMADO_RH, agregarCustosPorMes, apurarSaidas, coberturaDe, listarConversoes, type FechamentoFinanceiro, type RubricaFinanceira } from "../../src/domain/custosRescisao.ts";
import { pendenciasFrontDeDesligados } from "../../src/domain/pendenciasDesligados.ts";
import { prepararHistorico, type RescisaoHistorica } from "../../src/domain/rescisoesHistorico.ts";
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

const col = (id: number, nome: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id, nome, cargo: "Aux", depto: "Produção", gestor: "G", admissaoIso: "2025-01-01", desligado: false, dataDesligamento: "", empresaAfiliada: false, ...extra }) as Colaborador;
const hist = (id: number, nome: string, dem: string, natureza: RescisaoHistorica["natureza"], colaboradorId: number | null, adm = "2025-01-01"): RescisaoHistorica => ({
  id, codigoFolha: id, nome, nomeNormalizado: nome.toLowerCase(), admissaoIso: adm, demissaoIso: dem, tipoRescisao: "x", departamento: "Produção", natureza, efetivacaoEmIso: natureza === "conversao_estagio_clt" ? dem : null, colaboradorId,
});
const rub = (id: number, liquido: number, extra: Partial<RubricaFinanceira> = {}): RubricaFinanceira => ({
  rescisaoId: id, liquido, fgtsRescisorio: 50, saldoFgts: 0, rescisaoStatus: "proposto", rescisaoDecisao: null, rescisaoValorValidado: null, rescisaoValidadaEm: null, rescisaoValidadaPor: null, zeroConferido: false, modalidadeConfirmada: null,
  grrfStatus: "pendente", grrfDeposito: null, grrfMulta: null, grrfTotal: null, grrfFonte: null, grrfValidadaEm: null, grrfValidadaPor: null, ...extra,
});
const fech = (nome: string, r: number | null, g: number | null, extra: Partial<FechamentoFinanceiro> = {}): FechamentoFinanceiro => ({ colaboradorNome: nome, valorRescisao: r, valorGrrf: g, origem: "manual", rescisaoHistoricoId: null, rescisaoValidadaEm: null, rescisaoValidadaPor: null, rescisaoFonte: null, grrfValidadaEm: null, grrfValidadaPor: null, grrfFonte: null, grrfNaoAplicavel: false, grrfJustificativa: null, updatedAt: "", updatedBy: "RH", ...extra });
const manualValidado: Partial<FechamentoFinanceiro> = { rescisaoValidadaEm: "2026-10-01T00:00:00Z", rescisaoValidadaPor: "RH", rescisaoFonte: "informado_rh", grrfValidadaEm: "2026-10-01T00:00:00Z", grrfValidadaPor: "RH", grrfNaoAplicavel: true, grrfJustificativa: "pedido de demissão: sem GRRF" };
const validada = (v: number): Partial<RubricaFinanceira> => ({ rescisaoStatus: "validado", rescisaoValorValidado: v, rescisaoValidadaEm: "2026-10-19T12:00:00Z", rescisaoValidadaPor: "RH" });
const grrfOk = (t: number): Partial<RubricaFinanceira> => ({ grrfStatus: "validado", grrfTotal: t, grrfFonte: "guia_grrf", grrfValidadaEm: "2026-10-19T12:00:00Z", grrfValidadaPor: "RH" });

const colaboradores = [
  col(1, "Ana", { desligado: true, dataDesligamento: "13/jul/2026" }),
  col(2, "Beto", { desligado: true, dataDesligamento: "21/jul/2026" }),
  col(3, "Caio Sem Id", { desligado: true, dataDesligamento: "10/ago/2026", admissaoIso: "2025-05-05" }),
  col(4, "Dora Afiliada", { desligado: true, dataDesligamento: "10/ago/2026", empresaAfiliada: true }),
  col(5, "Edu Ativo"),
  col(6, "Fabi Manual", { desligado: true, dataDesligamento: "10/set/2026" }),
  col(7, "Gil Sem Data", { desligado: true, dataDesligamento: "" }),
];
const historicoCompleto = [
  hist(11, "Ana", "2026-07-13", "saida_efetiva", 1),
  hist(12, "Beto", "2026-07-21", "saida_efetiva", 2),
  hist(13, "Caio Sem Id", "2026-08-10", "saida_efetiva", null, "2025-05-05"),
  hist(21, "Hist Um", "2026-01-12", "saida_efetiva", null),
  hist(22, "Hist Dois", "2026-01-30", "saida_efetiva", null),
  hist(31, "Edu Ativo", "2026-07-31", "conversao_estagio_clt", 5),
];
const rubricas = [rub(11, 1000, validada(1000)), rub(12, 2000), rub(13, 900, { ...validada(900), ...grrfOk(0), grrfStatus: "nao_aplicavel" }), rub(21, 4000, { ...validada(4000), ...grrfOk(500) }), rub(22, 1500), rub(31, 3647.25)];
const fechamentos = [fech("Ana", 1000, 0), fech("Beto", 3500, 0), fech("Fabi Manual", 2500.5, 0, manualValidado)];
const preparado = prepararHistorico(historicoCompleto, colaboradores);
const saidas = apurarSaidas({ colaboradores, historicoCompleto, historicoPreparado: preparado, rubricas, fechamentos });
const por = (nome: string) => saidas.find((s) => s.nome === nome)!;

// ── população e deduplicação ──
check("saídas efetivas: cadastro (Ana, Beto, Caio, Fabi) + histórico sem cadastro (2); afiliada, sem data e ativo ficam de fora; conversão não entra", saidas.length === 6 && !saidas.some((s) => ["Dora Afiliada", "Gil Sem Data", "Edu Ativo"].includes(s.nome)), saidas.map((s) => s.nome).join());
check("cada pessoa uma vez: Caio (histórico sem id, ligado por nome + admissão) não duplica", saidas.filter((s) => s.nome === "Caio Sem Id").length === 1 && por("Caio Sem Id").origem === "cadastro");
check("conversão de estágio listada à parte e sem status financeiro", listarConversoes(historicoCompleto, rubricas).length === 1 && listarConversoes(historicoCompleto, rubricas)[0].rescisao.status === "pendente");
check("mês pela data efetiva (cadastro e histórico)", por("Ana").mes === "2026-07" && por("Hist Um").mes === "2026-01" && por("Fabi Manual").mes === "2026-09");

// ── status por componente ──
check("Ana: lançado = líquido e validado → Rescisão validada 1000; GRRF pendente (lançada 0 não conta)", por("Ana").rescisao.status === "validado" && por("Ana").rescisao.valor === 1000 && por("Ana").grrf.status === "pendente" && por("Ana").grrf.lancado === 0);
check("Beto: lançado 3500 × líquido 2000, não validado → DIVERGENTE (não soma nada)", por("Beto").rescisao.status === "divergente" && por("Beto").rescisao.valor === null && por("Beto").rescisao.lancado === 3500);
check("Caio: GRRF 'não aplicável' vale 0 e conta como resolvida", por("Caio Sem Id").grrf.status === "nao_aplicavel" && por("Caio Sem Id").grrf.total === 0);
check("Fabi (sem folha): lançamento manual VALIDADO (fonte, responsável, data) vale; GRRF não aplicável justificada = resolvida com R$ 0,00", por("Fabi Manual").rescisao.status === "validado" && por("Fabi Manual").rescisao.valor === 2500.5 && por("Fabi Manual").rescisao.fonte === "informado_rh" && por("Fabi Manual").grrf.status === "nao_aplicavel" && por("Fabi Manual").grrf.total === 0);
{
  // lançar NÃO valida: valor lançado, sem confirmação, fica pendente (e GRRF lançada 0 não é GRRF resolvida)
  const so = apurarSaidas({ colaboradores: [col(20, "Lia Lançada", { desligado: true, dataDesligamento: "01/out/2026" })], historicoCompleto: [], historicoPreparado: prepararHistorico([], []), rubricas: [], fechamentos: [fech("Lia Lançada", 500, 0)] })[0];
  check("lançamento manual SEM validação: rescisão e GRRF pendentes (nada soma; 0 lançado não resolve a GRRF)", so.rescisao.status === "pendente" && so.rescisao.lancado === 500 && so.rescisao.valor === null && so.grrf.status === "pendente" && so.grrf.lancado === 0 && agregarCustosPorMes([so])[0].total === 0);
  const naoConf = apurarSaidas({ colaboradores: [col(21, "Mia Incompleta", { desligado: true, dataDesligamento: "01/out/2026" })], historicoCompleto: [], historicoPreparado: prepararHistorico([], []), rubricas: [], fechamentos: [fech("Mia Incompleta", 500, 0, { grrfNaoAplicavel: true })] })[0];
  check("'não aplicável' sem a confirmação registrada (data/responsável) NÃO resolve a GRRF", naoConf.grrf.status === "pendente");
}
check("Hist Dois: nada validado → pendente nos dois componentes", por("Hist Dois").rescisao.status === "pendente" && por("Hist Dois").grrf.status === "pendente");
check("manter o lançado: validado com o valor lançado, não com o líquido", apurarSaidas({ colaboradores, historicoCompleto, historicoPreparado: preparado, rubricas: rubricas.map((r) => (r.rescisaoId === 12 ? { ...r, ...validada(3500), rescisaoDecisao: "manter_lancado" as const } : r)), fechamentos }).find((s) => s.nome === "Beto")!.rescisao.valor === 3500);

// ── agregação (Dashboard) ──
const meses = agregarCustosPorMes(saidas);
const m = Object.fromEntries(meses.map((x) => [x.mes, x]));
check("só valores validados somam; quantidade sempre inteira", meses.reduce((a, x) => a + x.quantidade, 0) === 6 && m["2026-07"].rescisao === 1000 && m["2026-07"].quantidade === 2);
check("julho parcial (Beto divergente e GRRF pendente); janeiro parcial (Hist Dois pendente)", m["2026-07"].parcial && m["2026-01"].parcial && m["2026-01"].rescisao === 4000 && m["2026-01"].grrf === 500 && m["2026-01"].total === 4500);
check("agosto: rescisão validada 900 + GRRF não aplicável 0 → completo (não parcial)", m["2026-08"].rescisao === 900 && m["2026-08"].grrf === 0 && m["2026-08"].parcial === false);
check("setembro (manual validado): rescisão 2500,50; GRRF lançada 0 validada junto → completo", m["2026-09"].rescisao === 2500.5 && m["2026-09"].parcial === false);
const cob = coberturaDe(saidas);
check("cobertura: 5 de 6 rescisões validadas (Beto não); GRRF resolvida em 3 (Caio, Hist Um, Fabi); incompleta", cob.saidas === 6 && cob.rescisaoValidadas === 4 && cob.grrfResolvidas === 3 && cob.completa === false, JSON.stringify(cob));
check("período: filtra pela data efetiva", apurarSaidas({ colaboradores, historicoCompleto, historicoPreparado: preparado, rubricas, fechamentos, inicioIso: "2026-07-01", fimIso: "2026-07-31" }).length === 2);
check("arredonda em centavos (sem erro de ponto flutuante)", agregarCustosPorMes(apurarSaidas({ colaboradores: [col(8, "Z", { desligado: true, dataDesligamento: "01/jun/2026" }), col(9, "Y", { desligado: true, dataDesligamento: "02/jun/2026" })], historicoCompleto: [], historicoPreparado: prepararHistorico([], []), rubricas: [], fechamentos: [fech("Z", 0.1, 0, manualValidado), fech("Y", 0.2, 0, manualValidado)] }))[0].rescisao === 0.3);

// ── pendências dos desligados com a conferência ──
const conferencia = { instalado: true, saidas, conversoes: [], cobertura: cob };
const pend = pendenciasFrontDeDesligados({
  colaboradores, ciclos: [], avaliacoesDesempenho: [], avaliacoesPotencial: [], pdi: [], movimentacoes: [], desligamentosFinanceiros: [], conferencia, hoje: "2026-10-19",
} as never).filter((p) => p.modulo === "Desligados");
const nomes = pend.map((p) => p.colaborador).sort();
check("pendência financeira = pessoas ÚNICAS com componente por validar: Ana (GRRF), Beto (divergente) e Hist Dois (rescisão E GRRF → conta uma vez); completos ficam de fora", nomes.join() === "Ana,Beto,Hist Dois", nomes.join());
check("Hist Dois (rescisão e GRRF pendentes) aparece UMA vez, com os dois componentes no detalhe", pend.filter((p) => p.colaborador === "Hist Dois").length === 1 && /rescisão.*GRRF/.test(pend.find((p) => p.colaborador === "Hist Dois")!.detalhe));
check("o detalhe diz o que falta (GRRF a registrar / rescisão divergente)", pend.find((p) => p.colaborador === "Ana")!.detalhe.includes("GRRF a registrar") && pend.find((p) => p.colaborador === "Beto")!.detalhe.includes("divergente"));

// ── verificações estáticas ──
const varre = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(raiz, rel)).isDirectory()) varre(rel, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
};
const usam = varre("src").filter((f) => /from\("peopleflow_desligamentos"\)/.test(src(f)));
check("o navegador NÃO acessa mais a tabela peopleflow_desligamentos direto (nenhum arquivo em src/)", usam.length === 0, usam.join());
const repo = src("src/repositories/financeiroRepository.ts");
check("o repositório financeiro só fala com o servidor (ações financeiro_*), sem cliente Supabase direto", /gravar</.test(repo) && !/supabase\.from\(/.test(repo));
const dash = src("src/features/dashboard/DashboardPage.tsx");
check("Dashboard: valores financeiros SÓ para o RH (decisão do RH); Diretoria e Gestor recebem apenas quantidades e nem chamam o servidor", /veValoresFinanceiros = perfil === "RH";/.test(dash) && !/veValoresFinanceiros = perfil === "RH" \|\|/.test(dash) && /if \(!veValoresFinanceiros\) return;/.test(dash) && /restritos ao RH;/.test(dash) && !/restritos ao RH e à Diretoria/.test(dash));
check("Dashboard: colunas Rescisão, GRRF e Custo Total, com total parcial (*) e cobertura 'x de y'", /<th>Rescisão<\/th>/.test(dash) && /<th>GRRF<\/th>/.test(dash) && /<th>Custo Total<\/th>/.test(dash) && /Total parcial/.test(dash) && /rescisaoValidadas\} de \{coberturaCustos\.saidas\}/.test(dash) && /grrfResolvidas\} de \{coberturaCustos\.saidas\}/.test(dash));
const paginaDesl = src("src/features/desligados/DesligadosPage.tsx");
check("Desligados: nem o status financeiro nem a seção de fechamento aparecem para quem não é RH", /perfil === "RH" && <th>Status financeiro<\/th>/.test(paginaDesl) && /ehRH && \(/.test(paginaDesl) && /ehRH=\{perfil === "RH"\}/.test(paginaDesl));
check("Dashboard: total parcial identificado e cobertura exibida", /Total parcial/.test(dash) && /Cobertura: rescisão validada em/.test(dash) && /\(parcial\)/.test(dash));
check("Dashboard: conversões de estágio não entram nos custos (aviso e filtro no servidor)", /Conversões de estágio para CLT não entram/.test(dash));
const page = src("src/features/desligados/DesligadosPage.tsx");
const hook = src("src/store/usePortalData.ts");
check("contador de pendências financeiras: pessoas únicas (cadastro e histórico), sem duplicar rescisão + GRRF pendentes", /conf\.saidas\.filter\(\(l\) => l\.rescisao\.status !== "validado" \|\| l\.grrf\.status === "pendente"\)\.length/.test(hook));
check("Dashboard: alerta de desligamentos pendentes inclui o histórico da folha do recorte, uma vez por pessoa", /idsHistorico\.has\(l\.chave\)/.test(dash));
const confTsx = src("src/features/desligados/ConferenciaFinanceira.tsx");
check("Desligados: UM diálogo 'Lançar e confirmar' (gaveta e conferência), sem 'Salvar lançamento' nem validação em duas etapas", /Lançar e confirmar valores/.test(page) && /DialogoLancarConfirmar/.test(page) && !/Salvar lançamento|Validar rescisão…|Validar GRRF…|DialogoValidarManual|DialogoGrrf/.test(page + confTsx));
check("diálogo: sem seletor de fonte documental, anexo, TRCT, guia ou campos de depósito/multa", !/Fonte documental|Fonte do valor|type="file"|TRCT|Depósito rescisório|Multa rescisória/.test(confTsx.slice(confTsx.indexOf("export function DialogoLancarConfirmar"))));
const dlg = confTsx.slice(confTsx.indexOf("export function DialogoLancarConfirmar"));
check("diálogo: campos 'Valor da Rescisão' (líquido a pagar ao colaborador) e 'Valor da GRRF' (total da guia de FGTS rescisório a pagar pela empresa)", /Valor da Rescisão/.test(dlg) && /Líquido a pagar ao colaborador/.test(dlg) && /Valor da GRRF/.test(dlg) && /Total da guia de FGTS rescisório a pagar pela empresa/.test(dlg));
check("diálogo: GRRF pendente, 'não aplicável' com justificativa obrigatória e confirmação expressa antes de salvar", /Ainda pendente/.test(dlg) && /Não aplicável/.test(dlg) && /justificativa\.trim\(\)\.length > 0/.test(dlg) && /confirmacao_rh: true/.test(dlg) && /disabled=\{!podeEnviar\}/.test(dlg));
check("diálogo: alterar valor já confirmado exige motivo (e a trilha preserva o anterior no servidor)", /Motivo da alteração/.test(dlg) && /pedeMotivo/.test(dlg) && /\(!pedeMotivo \|\| motivo\.trim\(\)\.length > 0\)/.test(dlg));
// ── fechamento do acesso direto: o navegador não pode depender mais das tabelas financeiras ──
const arquivos = (dir: string): string[] => readdirSync(join(raiz, dir)).flatMap((n) => { const p = join(dir, n); return statSync(join(raiz, p)).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const tabelasFin = /\.from\(\s*["'`](peopleflow_desligamentos|peopleflow_rescisoes_historico_rubricas|peopleflow_fechamentos_log)["'`]/;
check("NENHUM código do navegador (src/) lê ou grava as tabelas financeiras direto: tudo passa pelo servidor", arquivos("src").filter((f) => tabelasFin.test(src(f))).length === 0, arquivos("src").filter((f) => tabelasFin.test(src(f))).join(","));
check("no servidor, só api/_lib/financeiroDesligamentos.ts acessa o fechamento financeiro", arquivos("api").filter((f) => /peopleflow_desligamentos\b/.test(src(f))).join() === join("api", "_lib", "financeiroDesligamentos.ts"), arquivos("api").filter((f) => /peopleflow_desligamentos\b/.test(src(f))).join());
const repoFin = src("src/repositories/financeiroRepository.ts");
check("o repositório financeiro do navegador só usa o transporte do servidor (sem cliente Supabase de tabelas)", !/supabase\.from|createClient|\.rpc\(/.test(repoFin) && /gravar\(/.test(repoFin));
const msg403 = /Somente o RH acessa e altera os valores financeiros individuais/.exec(src("api/_lib/financeiroDesligamentos.ts"))?.[0] ?? "";
check("a carga do portal trata o 403 de Gestor/Diretoria como esperado (mensagem do servidor casa com a tolerância do repositório) e devolve vazio", msg403 !== "" && new RegExp((/\/(Somente o RH[^/]*)\//.exec(repoFin)?.[1] ?? "$^") + "|Conta n", "i").test(msg403) && /VAZIO/.test(repoFin) && /return VAZIO/.test(repoFin));
check("contadores e alertas de pendência financeira são só do RH (0 para os demais perfis)", /if \(perfil !== "RH"\) return 0;/.test(src("src/store/usePortalData.ts")) && /if \(perfil !== "RH"\) return 0;/.test(src("src/features/dashboard/DashboardPage.tsx")));
check("schema.sql (instalações novas) já nasce com o fechamento: sem política para authenticated e só service_role", !/create policy "authenticated_rw_desligamentos"/.test(src("supabase/schema.sql")) && /revoke all on public\.peopleflow_desligamentos from public, anon, authenticated/.test(src("supabase/schema.sql")));
check("a origem interna é exibida como 'Informado e confirmado pelo RH', não como conferência de documento", /ROTULO_INFORMADO_RH/.test(confTsx) && ROTULO_INFORMADO_RH === "Informado e confirmado pelo RH" && FONTE_INFORMADO_RH === "informado_rh");
check("Desligados: aba Conferência financeira só para o RH; gaveta lê a folha validada, sem digitação dupla", /perfil === "RH" && \(\s*<div className=\{confStyles\.abas\}/.test(page) && /Conferência financeira/.test(page) && /em lote/.test(page));
const srv = src("api/_lib/financeiroDesligamentos.ts");
check("servidor: valores individuais, agregados e gravações só para o RH (nenhuma exceção para Diretoria)", /function exigirRH/.test(srv) && !/perfil !== "RH" && conta\.perfil !== "Diretoria"/.test(srv) && /async function agregado\(conta: Conta, corpo: Corpo\) \{\s*exigirRH\(conta\);/.test(srv));
check("servidor: nada é calculado/presumido a partir de saldo FGTS ou percentuais", !/0\.4|\* 0\.0|multa.*saldo/i.test(srv.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("servidor: trilha em toda gravação e fechamento existente nunca sobrescrito sem confirmação", /registrar\(conta/.test(srv) && /confirmar_substituicao/.test(srv) && /decida entre manter o lançado ou adotar a folha/.test(srv));
check("sem nova Serverless Function: rota dentro de api/desenvolvimento.ts (≤ 11 arquivos em api/)", /executarFinanceiro\(acao, req, res\)/.test(src("api/desenvolvimento.ts")) && readdirSync(join(raiz, "api")).filter((n) => n.endsWith(".ts")).length <= 11);

console.log(`\nFINANCEIRO (domínio/telas): ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
