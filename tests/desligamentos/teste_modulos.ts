// Módulos que passaram a usar a regra central de situação funcional: acessos, seletores, hierarquia, AVD/potencial, dashboards de desempenho,
// feedback, reajuste, notificações, atualização por nome e relatório de pendências — mais a PROTEÇÃO das MPs de efetivação.
// Funções puras e bancos falsos em memória; dados fictícios.
//   cd tests && npx tsx desligamentos/teste_modulos.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gestoresSelecionaveis } from "../../src/domain/agregados.ts";
import { elegivelParaCicloAvaliacaoDesempenho } from "../../src/domain/avaliacaoDesempenho.ts";
import { populacaoDashboard } from "../../src/domain/dashboardDesempenho.ts";
import { colaboradoresDesligados } from "../../src/domain/desligados.ts";
import { foraDaExperiencia } from "../../src/domain/experienciaDatas.ts";
import { colaboradoresParaFeedbackDe } from "../../src/domain/feedback.ts";
import { buildAccess, buildAccessAvd, ehGestorDoDepartamento, gestorAtivoDe, gestorDesligado, gestorDoDepartamento } from "../../src/domain/hierarquia.ts";
import { nomesDeDesligados, pendenciasFrontDeDesligados } from "../../src/domain/pendenciasDesligados.ts";
import { validarLinhaReajuste } from "../../src/domain/reajusteSalarial.ts";
import { efetivarDesligamentos } from "../../api/_lib/desligamentos.ts";
import { pendenciasDesenvolvimentoDeDesligados } from "../../api/_lib/pendenciasDesligados.ts";
import { alvoPorNome, emailDeColaboradorDesligado, linhaAtiva } from "../../api/_lib/situacaoColaboradores.ts";
import { criarResolvedorDeEmail } from "../../api/_lib/notificacoesEmail.ts";
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
const HOJE = "2026-10-16";

let seq = 0;
const col = (nome: string, extra: Partial<Colaborador> = {}): Colaborador =>
  ({ id: ++seq, vinculo: "CLT", nome, cargo: "Analista", depto: "Produção", deptoCode: "P", nivel: "Analista", gestor: "", admissao: "", admissaoIso: "2024-01-10", tempoDeEmpresa: "", desligado: false, dataDesligamento: "", motivoDesligamento: "", desligadoBy: "", matriz9BoxVisaoCompleta: false, empresaAfiliada: false, ...extra }) as Colaborador;

// ═══ Acessos (buildAccess) ═══
{
  const rh = col("Rita RH", { depto: "Recursos Humanos", cargo: "Analista de RH", gestor: "Yuri Diretor" });
  const yuri = col("Yuri Diretor", { cargo: "Diretor Industrial" });
  const gil = col("Gil Gestor", { gestor: "Yuri Diretor" });
  const lia = col("Lia Liderada", { gestor: "Gil Gestor" });
  const todos = [rh, yuri, gil, lia];
  const nomes = (l: Colaborador[]) => buildAccess(l).map((c) => c.nome).sort().join();
  check("acesso: RH, Diretoria e Gestor ativos entram", nomes(todos) === "Gil Gestor,Rita RH,Yuri Diretor", nomes(todos));
  const gilSaiu = col("Gil Gestor", { gestor: "Yuri Diretor", desligado: true, dataDesligamento: "13/jul/2026" });
  check("acesso: gestor desligado perde o acesso", !nomes([rh, yuri, gilSaiu, lia]).includes("Gil Gestor"));
  const gilFuturo = col("Gil Gestor", { gestor: "Yuri Diretor", desligado: true, dataDesligamento: "30/dez/2026" });
  check("acesso: desligamento com data FUTURA mantém o acesso até o dia", nomes([rh, yuri, gilFuturo, lia]).includes("Gil Gestor"));
  const liaSaiu = col("Lia Liderada", { gestor: "Gil Gestor", desligado: true, dataDesligamento: "13/jul/2026" });
  check("acesso: gestor cujo único liderado saiu CONTINUA gestor (precisa abrir a MP de substituição)", nomes([rh, yuri, gil, liaSaiu]).includes("Gil Gestor"));
  const afil = col("Afiliada Biomedical", { empresaAfiliada: true, gestor: "Yuri Diretor", cargo: "Diretor de TI" });
  check("acesso: afiliada ENTRA (é quem usa o portal)", nomes([...todos, afil]).includes("Afiliada Biomedical"));
  const jovem = col("Jovem Antigo", { gestor: "Gil Gestor", admissaoIso: "2024-01-10" });
  check("acesso AVD: desligado não é candidato", buildAccessAvd([rh, yuri, gil, jovem, col("Saiu Antigo", { gestor: "Gil Gestor", desligado: true, dataDesligamento: "01/jan/2026" })]).map((c) => c.nome).join() === "Jovem Antigo");
}

// ═══ Hierarquia e seletores ═══
{
  const gilSaiu = col("Gil Saiu", { depto: "Logística", gestor: "Yuri", desligado: true, dataDesligamento: "13/jul/2026" });
  const gisele = col("Gisele Gestora", { depto: "Logística", gestor: "Yuri" });
  const l1 = col("Liso Um", { depto: "Logística", gestor: "Gil Saiu" });
  const l2 = col("Liso Dois", { depto: "Logística", gestor: "Gil Saiu" });
  const l3 = col("Liso Tres", { depto: "Logística", gestor: "Gisele Gestora" });
  const todos = [gilSaiu, gisele, l1, l2, l3, col("Yuri")];
  check("gestor do departamento nunca é um desligado (mesmo sendo o mais frequente na coluna)", gestorDoDepartamento(todos, "Logística") === "Gisele Gestora" || gestorDoDepartamento(todos, "Logística") === "Yuri", String(gestorDoDepartamento(todos, "Logística")));
  check("desligado não autoriza abrir transferência para o departamento", ehGestorDoDepartamento(todos, "Logística", "Gil Saiu") === false && ehGestorDoDepartamento(todos, "Logística", "Gisele Gestora") === true);
  check("gestorDesligado: só quem consta no cadastro apenas como desligado", gestorDesligado(todos, "Gil Saiu") && !gestorDesligado(todos, "Gisele Gestora") && !gestorDesligado(todos, "Nome Que Não Existe"));
  check("gestor ativo de quem reportava a um desligado = primeiro ancestral ativo", gestorAtivoDe(todos, l1) === "Yuri", String(gestorAtivoDe(todos, l1)));
  check("gestor ativo: gestor atual ativo é mantido", gestorAtivoDe(todos, l3) === "Gisele Gestora");
  const ciclo1 = col("Ciclo A", { gestor: "Ciclo B" });
  const ciclo2 = col("Ciclo B", { gestor: "Ciclo A", desligado: true, dataDesligamento: "01/jan/2026" });
  check("gestor ativo: laço na hierarquia não trava (devolve null)", gestorAtivoDe([ciclo1, ciclo2], ciclo1) === null);
  check("seletor de gestores exclui desligados, mantém gestor de desligados", gestoresSelecionaveis(todos).join() === "Gisele Gestora,Yuri", gestoresSelecionaveis(todos).join());
}

// ═══ AVD / potencial: elegibilidade pela regra central ═══
{
  const base = { admissaoIso: "2024-01-10" };
  check("ciclo: ativo e admitido antes do corte é elegível", elegivelParaCicloAvaliacaoDesempenho(col("A", base), "2026-06-30", HOJE).elegivel);
  check("ciclo: desligado NÃO é elegível", !elegivelParaCicloAvaliacaoDesempenho(col("B", { ...base, desligado: true, dataDesligamento: "13/jul/2026" }), "2026-06-30", HOJE).elegivel);
  check("ciclo: desligamento FUTURO ainda é elegível (sai só na data)", elegivelParaCicloAvaliacaoDesempenho(col("C", { ...base, desligado: true, dataDesligamento: "30/dez/2026" }), "2026-06-30", HOJE).elegivel);
  const afil = elegivelParaCicloAvaliacaoDesempenho(col("D", { ...base, empresaAfiliada: true }), "2026-06-30", HOJE);
  check("ciclo: afiliada nunca é elegível", !afil.elegivel && /afiliada/i.test(afil.motivo ?? ""));
  check("ciclo: PJ e admissão após o corte continuam recusados", !elegivelParaCicloAvaliacaoDesempenho(col("E", { ...base, vinculo: "PJ" }), "2026-06-30", HOJE).elegivel && !elegivelParaCicloAvaliacaoDesempenho(col("F", { admissaoIso: "2026-08-01" }), "2026-06-30", HOJE).elegivel);
}

// ═══ Dashboards de desempenho: histórico preservado ═══
{
  type Ficha = { colaboradorNome: string; status: string };
  const fichas: Ficha[] = [
    { colaboradorNome: "Ativa Ana", status: "Em andamento" },
    { colaboradorNome: "Saiu Concluida", status: "Concluída" },
    { colaboradorNome: "Saiu Pendente", status: "Em andamento" },
    { colaboradorNome: "Afiliada", status: "Concluída" },
  ];
  const r = populacaoDashboard(fichas, new Set(["Ativa Ana"]), new Set(["Saiu Concluida", "Saiu Pendente"]), (f) => f.status === "Concluída").map((f) => f.colaboradorNome);
  check("dashboard: ativo entra; desligado só com item CONCLUÍDO (histórico não some); pendente de desligado fica de fora", r.join() === "Ativa Ana,Saiu Concluida", r.join());
}

// ═══ Experiência, feedback, desligados, reajuste ═══
{
  check("experiência: desligado está fora; futuro ainda dentro", foraDaExperiencia(col("X", { desligado: true, dataDesligamento: "13/jul/2026" }), new Set()) && !foraDaExperiencia(col("Y", { desligado: true, dataDesligamento: "30/dez/2026" }), new Set()) && foraDaExperiencia(col("Z", { vinculo: "PJ" }), new Set()));
  const eq = col("Eq", { gestor: "Rita" });
  const eqSaiu = col("EqSaiu", { gestor: "Rita", desligado: true, dataDesligamento: "13/jul/2026" });
  check("feedback: só ativos (desligamento futuro conta como ativo)", colaboradoresParaFeedbackDe({ perfil: "Gestor", me: "Rita", todos: [eq, eqSaiu, col("Fut", { gestor: "Rita", desligado: true, dataDesligamento: "30/dez/2026" })], populacaoMatriz9Box: [] }).map((c) => c.nome).sort().join() === "Eq,Fut");
  const hoje = HOJE;
  const lista = [col("Ativo Um"), col("Saiu Antes", { desligado: true, dataDesligamento: "13/jul/2026" }), col("Saira Depois", { desligado: true, dataDesligamento: "30/dez/2026" })];
  check("lista de Desligados: só quem já passou da data efetiva", colaboradoresDesligados(lista, hoje).map((c) => c.nome).join() === "Saiu Antes");
  const linha = (nome: string) => ({ vinculo: "CLT", colaborador: nome, salario: 1000, reajusteBase: 5, fatorial: 0, novoSalario: 1050 }) as never;
  const v = validarLinhaReajuste(linha("Saiu Antes"), lista, [], [], [], "2026-08-01", "x");
  check("reajuste: desligado antes da competência é recusado", v.status === "invalido" && /desligado/i.test(v.motivo ?? ""), JSON.stringify(v));
  const v2 = validarLinhaReajuste(linha("Saiu Antes"), lista, [], [], [], "2026-05-01", "x");
  check("reajuste: na competência em que ainda estava ativo NÃO é recusado por desligamento", !(v2.status === "invalido" && /desligado/i.test(v2.motivo ?? "")));
}

// ═══ Servidor: e-mail, acessos, nome repetido ═══
{
  const linhas = [
    { nome: "Fulano da Silva", desligado: true, data_desligamento: "2026-07-13", admissao: "2024-01-01", empresa_afiliada: false },
    { nome: "Beltrana Souza", desligado: false, data_desligamento: null, admissao: "2024-01-01", empresa_afiliada: false },
  ];
  check("e-mail de desligado é identificado (conta de quem saiu)", emailDeColaboradorDesligado("fulano.silva@msbbrasil.com", linhas, HOJE));
  check("e-mail de ativo não é bloqueado; e-mail fora do cadastro também não", !emailDeColaboradorDesligado("beltrana.souza@msbbrasil.com", linhas, HOJE) && !emailDeColaboradorDesligado("externo@parceiro.com", linhas, HOJE));
  check("homônimo ativo com o mesmo e-mail impede o bloqueio", !emailDeColaboradorDesligado("fulano.silva@msbbrasil.com", [...linhas, { nome: "Fulano Pereira da Silva", desligado: false, data_desligamento: null, admissao: "2025-01-01", empresa_afiliada: false }], HOJE));
  check("linhaAtiva: futuro ativo, sem data desligado", linhaAtiva({ desligado: true, data_desligamento: "2026-12-30" }, "acesso", HOJE) && !linhaAtiva({ desligado: true, data_desligamento: null }, "acesso", HOJE) && !linhaAtiva({ desligado: true, data_desligamento: "2026-07-13" }, "acesso", HOJE));
  const admin = {
    auth: { admin: { listUsers: async () => ({ data: { users: [{ email: "fulano.silva@msbbrasil.com" }, { email: "beltrana.souza@msbbrasil.com" }] }, error: null }) } },
    from: () => ({ select: async () => ({ data: linhas, error: null }) }),
  };
  const resolver = criarResolvedorDeEmail(admin as never);
  const rDeslig = await resolver("Fulano da Silva");
  check("notificação operacional NÃO vai para desligado (resolve como erro visível, sem enviar)", Boolean(rDeslig.erro) && /desligad/i.test(rDeslig.erro ?? ""));
  check("notificação continua indo para ativo", (await resolver("Beltrana Souza")).erro === undefined);

  // nome repetido: só o ativo é alvo da atualização
  const bancoNome = (rows: Record<string, unknown>[]) => ({ from: () => ({ select: () => ({ eq: async (_c: string, v: string) => ({ data: rows.filter((r) => r.nome === v), error: null }) }) }) });
  const dois = [{ id: 1, nome: "Maria Souza", desligado: true, data_desligamento: "2026-03-01", admissao: "2023-01-01", empresa_afiliada: false }, { id: 2, nome: "Maria Souza", desligado: false, data_desligamento: null, admissao: "2025-01-01", empresa_afiliada: false }];
  const a1 = await alvoPorNome(bancoNome(dois), "Maria Souza", HOJE);
  check("nome repetido: atualização vai só para o registro ATIVO (nunca o desligado)", a1.ok && a1.ids.join() === "2", JSON.stringify(a1));
  const a2 = await alvoPorNome(bancoNome([dois[1], { ...dois[1], id: 3 }]), "Maria Souza", HOJE);
  check("dois ativos com o mesmo nome: recusa (409)", !a2.ok && a2.status === 409);
  const a3 = await alvoPorNome(bancoNome([dois[0]]), "Maria Souza", HOJE);
  check("registro único vale mesmo desligado (comportamento anterior)", a3.ok && a3.ids.join() === "1");
  const a4 = await alvoPorNome(bancoNome([]), "Ninguém", HOJE);
  check("nome inexistente: 404", !a4.ok && a4.status === 404);
}

// ═══ Relatório de pendências ═══
{
  const colaboradores = [col("Ativa Ana"), col("Gestor Saiu", { desligado: true, dataDesligamento: "13/jul/2026" }), col("Liso Saiu", { desligado: true, dataDesligamento: "13/jul/2026", gestor: "Ativa Ana" })];
  const ciclos = [{ id: "C1", status: "Aberto" }, { id: "C0", status: "Encerrado" }] as never;
  const ficha = (id: string, extra: Record<string, unknown>) => ({ id, cicloId: "C1", ciclo: "Ciclo 1", tipo: "GESTOR", colaboradorNome: "Ativa Ana", avaliado: "Ativa Ana", gestorAvaliador: "Ativa Ana", status: "Em andamento", ...extra });
  const dados = {
    colaboradores,
    ciclos,
    avaliacoesDesempenho: [
      ficha("F1", { colaboradorNome: "Liso Saiu", avaliado: "Liso Saiu" }), // pendente de desligado
      ficha("F2", { gestorAvaliador: "Gestor Saiu" }), // avaliador desligado
      ficha("F3", { colaboradorNome: "Liso Saiu", status: "Concluída" }), // concluída: não é pendência
      ficha("F4", { colaboradorNome: "Liso Saiu", cicloId: "C0" }), // ciclo encerrado: fora
      ficha("F5", { colaboradorNome: "Liso Saiu", status: "Não Elegível" }),
      ficha("F6", { tipo: "LIDERANCA", colaboradorNome: "Ativa Ana", avaliado: "Gestor Saiu" }), // avalia líder que saiu
    ],
    avaliacoesPotencial: [{ id: "P1", cicloId: "C1", ciclo: "Ciclo 1", colaboradorNome: "Liso Saiu", gestorAvaliador: "Ativa Ana", status: "Não iniciada" }],
    pdi: [{ id: 1, colaboradorNome: "Liso Saiu", ciclo: "2025", status: "Em andamento" }, { id: 2, colaboradorNome: "Liso Saiu", ciclo: "2024", status: "Concluído" }],
    movimentacoes: [
      { id: "M1", tipoCod: "PRO", colaborador: "Liso Saiu", solicitante: "Ativa Ana", status: "Em Aprovação", etapas: [{ papel: "Gestor", aprovador: "Ativa Ana", status: "Em análise" }] },
      { id: "M2", tipoCod: "TRF", colaborador: "Ativa Ana", solicitante: "Ativa Ana", status: "Em Aprovação", etapas: [{ papel: "Gestor", aprovador: "Gestor Saiu", status: "Em análise" }] },
      { id: "M3", tipoCod: "DES", colaborador: "Ativa Ana", solicitante: "Ativa Ana", status: "Aprovado", sincronizadoEm: null, desligamentoInfo: { nome: "Ativa Ana", motivo: "x", dataIso: "2026-10-01" }, etapas: [] },
      { id: "M4", tipoCod: "DES", colaborador: "Liso Saiu", solicitante: "Ativa Ana", status: "Aprovado", sincronizadoEm: "2026-07-13T10:00:00Z", desligamentoInfo: { nome: "Liso Saiu", motivo: "x", dataIso: "2026-07-10" }, etapas: [] },
    ],
    desligamentosFinanceiros: [],
    hoje: HOJE,
  } as never;
  const p = pendenciasFrontDeDesligados(dados);
  const refs = (mod: string) => p.filter((x) => x.modulo === mod).map((x) => x.referencia ?? x.colaborador).sort().join();
  check("pendências AVD: só ciclo aberto e não concluído (F1 pessoa desligada, F2 avaliador desligado, F6 líder desligado)", refs("Avaliação de Desempenho") === "F1,F2,F6", refs("Avaliação de Desempenho"));
  check("pendências potencial e PDI em andamento", refs("Avaliação de Potencial") === "P1" && refs("PDI") === "1");
  check("pendências MPs: MP em andamento p/ desligado (M1), aprovador desligado (M2), desligamento aprovado sem efetivar (M3) e data divergente (M4)", refs("Movimentações de Pessoal") === "M1,M2,M3,M4", refs("Movimentações de Pessoal"));
  check("fechamento financeiro pendente aparece para os desligados", p.some((x) => x.modulo === "Desligados" && x.colaborador === "Gestor Saiu"));
  check("toda pendência traz módulo, processo, colaborador e ação recomendada", p.every((x) => x.modulo && x.processo && x.colaborador && x.acaoRecomendada));
  check("nomesDeDesligados exclui quem tem homônimo ativo", !nomesDeDesligados([col("Maria X", { desligado: true, dataDesligamento: "01/jan/2026" }), col("Maria X")], HOJE).has("Maria X"));
}

// pendências do Desenvolvimento (banco falso)
{
  const tabelas: Record<string, Record<string, unknown>[]> = {
    colaboradores: [
      { id: 1, nome: "Ativa Ana", desligado: false, data_desligamento: null, admissao: "2024-01-01", empresa_afiliada: false },
      { id: 2, nome: "Saiu Sam", desligado: true, data_desligamento: "2026-07-13", admissao: "2024-01-01", empresa_afiliada: false },
    ],
    peopleflow_dev_treinamentos: [
      { id: 10, codigo: "T-1", titulo: "TURMA ABERTA", status: "planejado", homologacao: false, responsavel_colaborador_id: 2, instrutor_colaborador_id: 1 },
      { id: 11, codigo: "T-2", titulo: "CONCLUIDO", status: "concluido", homologacao: false, responsavel_colaborador_id: 2, instrutor_colaborador_id: null },
      { id: 12, codigo: "T-3", titulo: "TESTE", status: "planejado", homologacao: true, responsavel_colaborador_id: 2, instrutor_colaborador_id: null },
    ],
    peopleflow_dev_participantes: [
      { treinamento_id: 10, colaborador_id: 2, removido_em: null },
      { treinamento_id: 11, colaborador_id: 2, removido_em: null },
      { treinamento_id: 10, colaborador_id: 1, removido_em: null },
    ],
    peopleflow_dev_necessidades: [{ id: 5, colaborador_id: 2, descricao: "Comunicação", status: "validada", origem: "pdi" }, { id: 6, colaborador_id: 2, descricao: "Antiga", status: "atendida", origem: "pdi" }],
    peopleflow_dev_pdi_sugestoes: [{ id: 7, pdi_id: 99, estado: "pendente" }],
    peopleflow_pdi: [{ id: 99, colaborador_nome: "Saiu Sam" }],
    peopleflow_dev_responsaveis_gestao: [{ id: 3, gestor_colaborador_id: 1, colaborador_id: 2, ativo: true }],
  };
  const db = {
    from: (t: string) => {
      let filtro: ((r: Record<string, unknown>) => boolean) | null = null;
      const q: any = { select: () => q, in: (c: string, v: unknown[]) => ((filtro = (r) => v.includes(r[c])), q), then: (ok2: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: (tabelas[t] ?? []).filter((r) => (filtro ? filtro(r) : true)), error: null }).then(ok2, ko) }; // eslint-disable-line @typescript-eslint/no-explicit-any
      return q;
    },
  };
  const r = await pendenciasDesenvolvimentoDeDesligados(db, HOJE);
  const por = (m: string) => r.filter((x) => x.modulo === m).length;
  check("Desenvolvimento: participante desligado na turma ABERTA (concluída e teste ficam de fora)", r.some((x) => x.processo.startsWith("Turma") && x.referencia === "10") && !r.some((x) => x.referencia === "11" || x.referencia === "12"));
  check("Desenvolvimento: responsável desligado em treinamento aberto; necessidade aberta; sugestão de PDI pendente; indicação vigente", r.some((x) => x.detalhe.includes("Responsável do treinamento")) && r.some((x) => x.modulo === "LNT / Necessidades" && x.referencia === "5") && !r.some((x) => x.referencia === "6") && por("PDI — triagem de necessidades") === 1 && r.some((x) => x.processo.startsWith("Responsável da gestão")));
  check("Desenvolvimento: ativo nunca aparece", r.every((x) => x.colaborador === "Saiu Sam"));
  const vazio = await pendenciasDesenvolvimentoDeDesligados({ from: () => ({ select: () => Promise.resolve({ data: null, error: { message: "tabela inexistente" } }) }) });
  check("tabela do módulo ainda não instalada: lista vazia, sem erro", vazio.length === 0);
}

// ═══ PROTEÇÃO das MPs de promoção/efetivação (Marcelo e Ítalo) ═══
{
  type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const mps: L[] = [
    { id: "M-2026-009", tipo_cod: "PRO", status: "Aprovado", colaborador: "Marcelo Efetivado", colaborador_id: 32, sincronizado_em: "2026-08-03T11:37:02Z", desligamento_info: null, etapas: ["a", "b"], dados: [1], historico: [] },
    { id: "M-2026-008", tipo_cod: "PRO", status: "Reprovado", colaborador: "Marcelo Efetivado", colaborador_id: 32, sincronizado_em: null, desligamento_info: null, etapas: [], dados: [], historico: [] },
    { id: "M-2026-040", tipo_cod: "PRO", status: "Em Aprovação", colaborador: "Italo Efetivado", colaborador_id: 19, sincronizado_em: null, desligamento_info: null, etapas: [], dados: [], historico: [] },
  ];
  const cad: L[] = [
    { id: 32, nome: "Marcelo Efetivado", desligado: false, data_desligamento: null, admissao: "2025-05-07", empresa_afiliada: false },
    { id: 19, nome: "Italo Efetivado", desligado: false, data_desligamento: null, admissao: "2026-02-03", empresa_afiliada: false },
  ];
  const antes = JSON.stringify([mps, cad]);
  const escritas: string[] = [];
  const db = {
    from: (t: string) => {
      const filtros: ((l: L) => boolean)[] = [];
      let op = "select";
      const tabela = t === "peopleflow_movimentacoes" ? mps : cad;
      const q: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
        is: (c: string, v: null) => (filtros.push((l) => (l[c] ?? null) === v), q),
        update: () => ((op = "update"), q),
        then: (ok2: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          if (op === "update") escritas.push(t);
          return Promise.resolve({ data: tabela.filter((l) => filtros.every((f) => f(l))), error: null }).then(ok2, ko);
        },
      };
      return q;
    },
  };
  const r = await efetivarDesligamentos(db, { hojeIso: HOJE });
  check("MPs de promoção/efetivação (aprovada, reprovada e em andamento) não são lidas como desligamento nem alteradas", r.length === 0 && escritas.length === 0 && JSON.stringify([mps, cad]) === antes, JSON.stringify(escritas));
  const r2 = await efetivarDesligamentos(db, { hojeIso: HOJE, movimentacaoId: "M-2026-009" });
  check("mesmo pedindo a MP M-2026-009 diretamente, nada é efetivado nem gravado", r2.length === 0 && escritas.length === 0);
  check("Marcelo e Ítalo continuam ativos e com as datas do cadastro intactas", cad.every((c) => c.desligado === false && c.data_desligamento === null) && cad[0].admissao === "2025-05-07" && cad[1].admissao === "2026-02-03");
  check("e continuam na lista de acessos/quadro (não vão para Desligados)", colaboradoresDesligados([col("Marcelo Efetivado", { admissaoIso: "2025-05-07" }), col("Italo Efetivado", { admissaoIso: "2026-02-03" })], HOJE).length === 0);
}

// ═══ Garantias estáticas: quem escreve em MPs e colaboradores ═══
{
  const raiz = join(import.meta.dirname, "..", "..");
  const varrer = (dir: string, acc: string[] = []) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "dist") continue;
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) varrer(p, acc);
      else if (/\.(ts|tsx)$/.test(nome)) acc.push(p);
    }
    return acc;
  };
  const arquivos = [...varrer(join(raiz, "api")), ...varrer(join(raiz, "src"))];
  const escrevemMp = arquivos.filter((f) => /from\(["']peopleflow_movimentacoes["']\)\s*\.(update|insert|upsert|delete)/.test(readFileSync(f, "utf8").replace(/\s+/g, " ")));
  const esperados = ["api\\_lib\\desligamentos.ts", "src\\repositories\\movimentacoesRepository.ts"].map((x) => x.replace(/\\/g, "/"));
  const rel = escrevemMp.map((f) => f.slice(raiz.length + 1).replace(/\\/g, "/")).sort();
  check("só movimentacoesRepository (fluxo normal) e desligamentos.ts (apenas sincronizado_em de DES aprovada) escrevem em peopleflow_movimentacoes", rel.every((f) => esperados.includes(f) || f === "src/repositories/movimentacoesRepository.ts"), rel.join(" | "));
  const desl = readFileSync(join(raiz, "api", "_lib", "desligamentos.ts"), "utf8");
  check("desligamentos.ts só altera nas MPs a coluna sincronizado_em, e só filtra tipo DES aprovada", /update\(\{ sincronizado_em:/.test(desl) && /eq\("tipo_cod", "DES"\)/.test(desl) && /eq\("status", "Aprovado"\)/.test(desl));
  const historicoRepo = readFileSync(join(raiz, "src", "repositories", "rescisoesHistoricoRepository.ts"), "utf8");
  check("o histórico de rescisões é só leitura no front (sem insert/update/delete)", !/\.(insert|update|upsert|delete)\(/.test(historicoRepo));
}

console.log(`\nMÓDULOS / DESLIGADOS: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
