// Regra central de situação funcional (src/domain/situacaoFuncional.ts) e indicadores de quadro de pessoas com histórico de rescisões
// (dashboardExecutivo.ts + rescisoesHistorico.ts). Funções puras, dados fictícios.
//   cd tests && npx tsx desligamentos/teste_quadro.ts
import { estaAtivoEm, estaAtivoHoje, filtrarAtivosEm, hojeBrasilia, normalizarDataIso, situacaoFuncionalEm } from "../../src/domain/situacaoFuncional.ts";
import { admissaoEfetivaPorId, calcularTurnover, colaboradoresAtivosEmData, desligamentosNoPeriodo, headcountEmData, tempoMedioDeEmpresa, turnoverPorSetor } from "../../src/domain/dashboardExecutivo.ts";
import { filtrarHistorico, normalizarNomeHistorico, prepararHistorico, type RescisaoHistorica } from "../../src/domain/rescisoesHistorico.ts";
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
const aprox = (a: number | null, b: number, eps = 0.0001) => a !== null && Math.abs(a - b) < eps;

// ═══ datas ═══
check("normaliza ISO", normalizarDataIso("2026-10-09") === "2026-10-09" && normalizarDataIso("2026-10-09T12:30:00Z") === "2026-10-09");
check("normaliza dd/mmm/aaaa (formato do app)", normalizarDataIso("09/out/2026") === "2026-10-09" && normalizarDataIso("1/jan/2026") === "2026-01-01");
check("normaliza dd/mm/aaaa", normalizarDataIso("09/10/2026") === "2026-10-09");
check("data inválida/vazia vira null", normalizarDataIso("31/02/2026") === null && normalizarDataIso("—") === null && normalizarDataIso("") === null && normalizarDataIso(null) === null && normalizarDataIso("abc") === null);
check("hojeBrasilia no formato ISO e no fuso de Brasília (UTC 02:00 ainda é o dia anterior)", /^\d{4}-\d{2}-\d{2}$/.test(hojeBrasilia()) && hojeBrasilia(new Date("2026-10-17T02:00:00Z")) === "2026-10-16");

// ═══ regra central ═══
const HOJE = "2026-10-16";
const sit = (d: Parameters<typeof situacaoFuncionalEm>[0], ref: string, esc: Parameters<typeof situacaoFuncionalEm>[2]) => situacaoFuncionalEm(d, ref, esc, HOJE).situacao;
check("ativo comum", sit({ admissaoIso: "2024-01-10" }, HOJE, "quadro") === "ativo");
check("desligado: a data efetiva já passou", sit({ admissaoIso: "2024-01-10", desligado: true, dataDesligamentoIso: "2026-07-13" }, HOJE, "quadro") === "desligado");
check("desligado: no próprio dia já está desligado", sit({ admissaoIso: "2024-01-10", desligado: true, dataDesligamento: "16/out/2026" }, HOJE, "quadro") === "desligado");
check("desligamento futuro: continua ativo até a data", sit({ admissaoIso: "2024-01-10", desligado: true, dataDesligamentoIso: "2026-11-30" }, HOJE, "operacional") === "ativo");
check("desligamento futuro: depois da data sai", sit({ admissaoIso: "2024-01-10", desligado: true, dataDesligamentoIso: "2026-11-30" }, "2026-12-01", "operacional") === "desligado");
check("desligado sem data: desligado de hoje em diante", sit({ admissaoIso: "2024-01-10", desligado: true }, HOJE, "operacional") === "desligado");
check("desligado sem data: em datas passadas conta como ativo (não se sabe quando saiu)", sit({ admissaoIso: "2024-01-10", desligado: true }, "2026-03-01", "quadro") === "ativo");
check("desligado sem data gera alerta de qualidade", situacaoFuncionalEm({ desligado: true, admissaoIso: "2024-01-10" }, HOJE, "operacional", HOJE).alerta === "desligado_sem_data");
check("afiliada: fora do quadro e das listas operacionais, mas entra no acesso", sit({ admissaoIso: "2024-01-10", empresaAfiliada: true }, HOJE, "quadro") === "fora_do_quadro" && sit({ admissaoIso: "2024-01-10", empresaAfiliada: true }, HOJE, "operacional") === "fora_do_quadro" && sit({ admissaoIso: "2024-01-10", empresaAfiliada: true }, HOJE, "acesso") === "ativo");
check("quadro: admissão futura ou ausente não conta", sit({ admissaoIso: "2026-12-01" }, HOJE, "quadro") === "nao_iniciado" && sit({}, HOJE, "quadro") === "nao_iniciado");
check("operacional: admissão futura ou ausente NÃO bloqueia (pré-cadastro de quem vai entrar)", sit({ admissaoIso: "2026-12-01" }, HOJE, "operacional") === "ativo" && sit({}, HOJE, "operacional") === "ativo");
check("aceita os campos do banco (admissao/dataDesligamento)", sit({ admissao: "2024-01-10", desligado: true, dataDesligamento: "2026-07-13" }, HOJE, "quadro") === "desligado");
check("estaAtivoEm / estaAtivoHoje / filtrarAtivosEm são a mesma regra", estaAtivoEm({ admissaoIso: "2024-01-10" }, HOJE, "quadro", HOJE) && estaAtivoHoje({ admissaoIso: "2024-01-10" }, "operacional", HOJE) && filtrarAtivosEm([{ admissaoIso: "2024-01-10" }, { admissaoIso: "2024-01-10", desligado: true, dataDesligamentoIso: "2026-01-01" }], HOJE, "quadro", HOJE).length === 1);

// ═══ indicadores com histórico ═══
let seq = 0;
const col = (nome: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id: ++seq, vinculo: "CLT", nome, cargo: "Analista", depto: "Produção", deptoCode: "P", nivel: "Analista", gestor: "Gil", admissao: "", admissaoIso: "2024-01-10", tempoDeEmpresa: "", desligado: false, dataDesligamento: "", motivoDesligamento: "", desligadoBy: "", matriz9BoxVisaoCompleta: false, empresaAfiliada: false, ...extra }) as Colaborador;
const hist = (id: number, nome: string, adm: string, dem: string, natureza: RescisaoHistorica["natureza"], extra: Partial<RescisaoHistorica> = {}): RescisaoHistorica => ({
  id, codigoFolha: id, nome, nomeNormalizado: normalizarNomeHistorico(nome), admissaoIso: adm, demissaoIso: dem, tipoRescisao: "Demitido sem justa causa", departamento: "Produção", natureza, efetivacaoEmIso: null, colaboradorId: null, ...extra,
});

check("normalizarNomeHistorico = regra do SQL (acentos, caixa, espaços)", normalizarNomeHistorico("  Bruna   VALÉRIA  Araújo ") === "bruna valeria araujo");

const INI = "2026-01-01";
const FIM = "2026-10-16";
// cadastro: 10 ativos antigos; 1 desligado no período; 1 admitido no período; 1 afiliada; efetivados Marcelo (adm do estágio) e Italo (adm = efetivação, no período)
const antigos = Array.from({ length: 10 }, (_, i) => col(`Antigo ${i}`, { admissaoIso: "2023-05-01" }));
const saiuCad = col("Saiu Cadastrado", { admissaoIso: "2024-02-01", desligado: true, dataDesligamento: "13/jul/2026" });
const novo = col("Novo Admitido", { admissaoIso: "2026-03-10" });
const afiliada = col("Afiliada Biomedical", { admissaoIso: "2020-01-01", empresaAfiliada: true });
const marcelo = col("Marcelo Efetivado", { admissaoIso: "2025-05-07", depto: "Engenharia" });
const italo = col("Italo Efetivado", { admissaoIso: "2026-02-03", depto: "Engenharia" });
const cadastro = [...antigos, saiuCad, novo, afiliada, marcelo, italo];
const idsAntes = JSON.stringify(cadastro);

const historico: RescisaoHistorica[] = [
  hist(1, "Saiu Cadastrado", "2024-02-01", "2026-07-13", "saida_efetiva", { colaboradorId: saiuCad.id }),
  hist(2, "Ex Um Sem Cadastro", "2022-01-01", "2026-02-02", "saida_efetiva"),
  hist(3, "Ex Dois Sem Cadastro", "2025-12-01", "2026-05-19", "saida_efetiva"),
  hist(4, "Ex Tres Sem Cadastro", "2026-04-01", "2026-09-01", "saida_efetiva", { departamento: "Logística" }),
  hist(5, "Marcelo Efetivado", "2025-05-07", "2026-07-31", "conversao_estagio_clt", { colaboradorId: marcelo.id, efetivacaoEmIso: "2026-08-03", departamento: "Engenharia" }),
  hist(6, "Italo Efetivado", "2025-08-05", "2026-02-02", "conversao_estagio_clt", { colaboradorId: italo.id, efetivacaoEmIso: "2026-02-03", departamento: "Engenharia" }),
];
const prep = prepararHistorico(historico, cadastro);
check("histórico separado: 3 saídas sem cadastro, 1 já no cadastro, 2 conversões", prep.saidasSemCadastro.length === 3 && prep.jaNoCadastro.length === 1 && prep.conversoes.length === 2);

// sem histórico (comportamento anterior, exceto afiliada fora das pontas)
const base = calcularTurnover(cadastro, INI, FIM);
// HC inicial (01/01): 10 antigos + saiuCad + marcelo = 12 ; final: 10 + novo + marcelo + italo = 13
check("sem histórico: HC inicial 12, final 13 e fórmula preservada", base.headcountInicial === 12 && base.headcountFinal === 13 && aprox(base.turnover, ((base.admissoes + base.desligamentos) / 2 / 12.5) * 100));
check("sem histórico: Italo (efetivado em fev) ainda conta como admissão — é o erro que o histórico corrige", base.admissoes === 2 && base.desligamentos === 1);

const t = calcularTurnover(cadastro, INI, FIM, prep);
// HC inicial: 12 + Ex Um + Ex Dois(adm 2025-12-01) + Italo (continuidade desde 2025-08-05) = 15 ; final 13
check("com histórico: HC inicial 15 (inclui ex-colaboradores sem cadastro e a continuidade de Italo), final 13", t.headcountInicial === 15 && t.headcountFinal === 13, JSON.stringify(t));
check("com histórico: admissões = Novo + Ex Tres (Italo NÃO conta: efetivação)", t.admissoes === 2 && t.efetivacoesNaoContadasComoAdmissao === 1, JSON.stringify(t));
check("com histórico: saídas efetivas = 1 cadastrado + 3 sem cadastro = 4 (sem dupla contagem; conversões fora)", t.desligamentos === 4 && t.desligamentosSemCadastro === 3, JSON.stringify(t));
check("conversões do período = 2 e rescisões contratuais = 4 saídas + 2 conversões = 6", t.conversoes === 2 && t.rescisoesContratuais === 6, JSON.stringify(t));
check("fórmula inalterada: (A + D) / 2 / HC médio", aprox(t.turnover, ((2 + 4) / 2 / 14) * 100), String(t.turnover));
check("Marcelo e Italo continuam ATIVOS no quadro e na lista de ativos", colaboradoresAtivosEmData(cadastro, FIM, prep).some((c) => c.id === marcelo.id) && colaboradoresAtivosEmData(cadastro, FIM, prep).some((c) => c.id === italo.id));
check("conversão não gera desligamento do cadastro", !desligamentosNoPeriodo(cadastro, INI, FIM).some((c) => c.id === marcelo.id || c.id === italo.id));
check("admissão efetiva de Italo = início do estágio; Marcelo idem; quem não foi efetivado não aparece", admissaoEfetivaPorId(prep).get(italo.id) === "2025-08-05" && admissaoEfetivaPorId(prep).get(marcelo.id) === "2025-05-07" && admissaoEfetivaPorId(prep).size === 2);
check("tempo médio de empresa usa a admissão efetiva (Italo desde o estágio)", (tempoMedioDeEmpresa([italo], FIM, admissaoEfetivaPorId(prep))?.meses ?? 0) === 14 % 12 + 0 && (tempoMedioDeEmpresa([italo], FIM, admissaoEfetivaPorId(prep))?.anos ?? 0) === 1);
check("a função não altera o cadastro nem o histórico recebido", JSON.stringify(cadastro) === idsAntes);

// ── dupla contagem ──
{
  const evaCadastrada = col("Ex Um Sem Cadastro", { admissaoIso: "2022-01-01", desligado: true, dataDesligamento: "02/fev/2026" });
  const cad2 = [...cadastro, evaCadastrada];
  const p2 = prepararHistorico(historico, cad2);
  check("se um dos sem cadastro for cadastrado depois (mesmo nome e admissão), o histórico deixa de contá-lo", p2.saidasSemCadastro.length === 2 && p2.jaNoCadastro.length === 2);
  const t2 = calcularTurnover(cad2, INI, FIM, p2);
  check("e o total de saídas não muda (continua 4: agora via cadastro)", t2.desligamentos === 4 && t2.desligamentosSemCadastro === 2, JSON.stringify(t2));
  const p3 = prepararHistorico([hist(7, "Fulano Ligado", "2020-01-01", "2026-03-03", "saida_efetiva", { colaboradorId: 9999 })], cadastro);
  check("linha com colaboradorId nunca vira 'sem cadastro' (mesmo se a pessoa não está no recorte)", p3.saidasSemCadastro.length === 0 && p3.jaNoCadastro.length === 1);
}

// ── headcount histórico: o passado não é distorcido por saídas posteriores ──
check("HC em 01/02/2026 inclui quem saiu depois (Ex Um sai em 02/02, ainda estava)", headcountEmData(cadastro, "2026-02-01", prep) === 15);
check("HC em 03/02/2026 já não inclui Ex Um", headcountEmData(cadastro, "2026-02-03", prep) === 14);
check("HC final do período NÃO inclui os ex-colaboradores (todos saíram)", headcountEmData(cadastro, FIM, prep) === 13);

// ── filtros ──
{
  const f = filtrarHistorico(prep, { setor: "Todos", gestor: "Todos", cargo: "Todos" }, cadastro, true);
  check("sem filtros: tudo", f.saidasSemCadastro.length === 3 && f.conversoes.length === 2);
  const fs = filtrarHistorico(prep, { setor: "Logística", gestor: "Todos", cargo: "Todos" }, cadastro.filter((c) => c.depto === "Logística"), true);
  check("filtro de setor: só as saídas do setor; conversões seguem a pessoa filtrada", fs.saidasSemCadastro.length === 1 && fs.saidasSemCadastro[0].id === 4 && fs.conversoes.length === 0);
  const fg = filtrarHistorico(prep, { setor: "Todos", gestor: "Gil", cargo: "Todos" }, cadastro, true);
  check("filtro de gestor/cargo: saídas sem cadastro não podem ser atribuídas → ficam fora", fg.saidasSemCadastro.length === 0);
  const fsem = filtrarHistorico(prep, { setor: "Todos", gestor: "Todos", cargo: "Todos" }, cadastro, false);
  check("perfil sem visão da empresa toda (Gestor): histórico sem cadastro não entra", fsem.saidasSemCadastro.length === 0);
  const tg = calcularTurnover(cadastro.filter((c) => c.depto === "Engenharia"), INI, FIM, filtrarHistorico(prep, { setor: "Engenharia", gestor: "Todos", cargo: "Todos" }, cadastro.filter((c) => c.depto === "Engenharia"), true));
  check("Engenharia: 2 efetivados, nenhuma saída nem admissão de pessoa, 2 conversões", tg.desligamentos === 0 && tg.admissoes === 0 && tg.conversoes === 2 && tg.rescisoesContratuais === 2 && tg.headcountInicial === 2, JSON.stringify(tg));
}

// ── por setor ──
{
  const ps = turnoverPorSetor(cadastro, INI, FIM, prep);
  check("setor com HC médio 0 (Logística: só passou por ali entre abril e setembro) sai do gráfico, como já era", !ps.some((s) => s.setor === "Logística"));
  const ps2 = turnoverPorSetor([], INI, FIM, prepararHistorico([hist(8, "Ex Log", "2022-01-01", "2026-06-01", "saida_efetiva", { departamento: "Logística" })], []));
  check("setor que só existe no histórico aparece (Logística: (0+1)/2/0,5 = 100%)", ps2.length === 1 && ps2[0].setor === "Logística" && aprox(ps2[0].turnover, 100));
  check("Engenharia tem turnover 0 (efetivações não contam)", aprox(ps.find((s) => s.setor === "Engenharia")?.turnover ?? null, 0));
}

// ── afiliada e dados ruins ──
{
  const comAfil = calcularTurnover([...antigos, afiliada, col("Afiliada Saiu", { empresaAfiliada: true, desligado: true, dataDesligamento: "01/mar/2026", admissaoIso: "2021-01-01" })], INI, FIM);
  check("afiliada nunca conta em admissões, desligamentos nem headcount", comAfil.desligamentos === 0 && comAfil.admissoes === 0 && comAfil.headcountInicial === 10);
  const semData = col("Sem Data", { desligado: true, dataDesligamento: "", admissaoIso: "2024-01-01" });
  check("desligado sem data: conta como ativo no passado (HC inicial), nunca como desligamento do período", headcountEmData([semData], "2026-01-01") === 1 && desligamentosNoPeriodo([semData], INI, FIM).length === 0);
  check("desligado sem data NÃO está ativo hoje", colaboradoresAtivosEmData([semData], hojeBrasilia()).length === 0);
  check("data no formato do app ou ISO dá o mesmo resultado", headcountEmData([col("A", { desligado: true, dataDesligamento: "13/jul/2026" })], "2026-07-14") === 0 && headcountEmData([col("A", { desligado: true, dataDesligamento: "2026-07-13" })], "2026-07-14") === 0);
}

console.log(`\nQUADRO DE PESSOAS: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
