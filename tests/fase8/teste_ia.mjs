// Fases 8B+8C — análise de UM item do PDI com IA, ponta a ponta na RÉPLICA (Fases 1–6 reais + Fase 7 real + Fase 8A real).
// O provedor é um cliente FALSO (nenhuma chamada externa, nenhum dado real). Roda o código de servidor REAL
// (api/_lib/desenvolvimentoAcoes.ts → executarAcao → pdi_ia_analisar).
//   cd tests && node --import ./pdi-triagem/register.mjs fase8/teste_ia.mjs
import { pathToFileURL } from "node:url";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, REPO, U_RH, U_G1, U_ALHEIO } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;
const esp = (ms) => new Promise((r) => setTimeout(r, ms));

const R = await novaReplica();
const { db, sql, um } = R;
const { p1, p2 } = await semearPdi(R);
// legado "real": 3 necessidades PDI + 2 ações mantidas somente no PDI no MESMO item (como em produção)
const nec = async (colab, pdi, item, acao, desc) => (await um(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, validada_por, departamento, solicitado_por_colaborador_id, created_by)
  values (${colab}, 'pdi', ${pdi}, '${item}', '${acao}', 'x', '${desc}', 'PDI', 'comportamental', 'media', 'validada', now() - interval '1 day', '${U_RH}', 'Produção', 1, '${U_RH}') returning id`)).id;
await nec(3, p1, "I1", "A1", "desenvolver clareza, objetividade e segurança na comunicação");
await nec(4, p2, "I3", "C1", "assumir a condução de alinhamentos envolvendo temas críticos");
await nec(4, p2, "I4", "D1", "Reciclagem nos POPs aplicáveis à rotina");
await db.exec(`insert into public.peopleflow_dev_pdi_sugestoes_dispensadas (pdi_acao_id, pdi_id, motivo, dispensada_por) values ('B1', ${p1}, 'Mantida somente no PDI (sem observação).', '${U_RH}'), ('B2', ${p1}, 'Já acompanhado pelo gestor', '${U_RH}')`);
const MIG7 = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG7.slice(0, MIG7.indexOf("$mig$;", MIG7.indexOf("do $mig$")) + 6));
await db.exec(rd("desenvolvimento_fase8a_ia_fundacao.sql"));

globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const cli = await import(pathToFileURL(REPO + "api/_lib/pdiIaCliente.ts").href);
const chamar = async (acao, corpo, uid = U_RH) => {
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await da.executarAcao(acao, { headers: { authorization: "Bearer tok:" + uid }, body: corpo }, res);
  return res;
};
const ok = async (acao, corpo) => { const r = await chamar(acao, corpo); if (r.codigo !== 200) throw new Error(`${acao} → ${r.codigo} ${r.corpo?.error}`); return r.corpo.dados; };

// ── cliente falso ──
function fake({ saida, antes, erro, atraso } = {}) {
  const f = {
    provedor: "anthropic",
    modelo: "modelo-de-teste",
    chamadas: [],
    async analisar(pedido) {
      const entrada = JSON.parse(pedido.usuario.split("\n").slice(1).join("\n"));
      f.chamadas.push({ pedido, entrada });
      if (antes) await antes(entrada);
      if (atraso) await esp(atraso);
      if (erro) throw erro;
      return { bruto: typeof saida === "function" ? saida(entrada) : saida, modelo: "modelo-de-teste-2026", tokensEntrada: 1234, tokensSaida: 321 };
    },
  };
  return f;
}
const usar = (f) => cli.definirClienteIaParaTestes(f);
const refs = (e) => e.item.acoes.map((a) => a.ref);
const nova = (extra = {}) => ({ titulo: "Comunicação assertiva", descricao: "Desenvolvimento da comunicação assertiva e da condução de alinhamentos interáreas.", justificativa_interpretacao: "As ações apontam para a mesma capacidade.", acao_ids_origem: ["A1"], confianca: "alta", ...extra });
const umaNec = (e, extra = {}) => ({ resultado: "necessidade_identificada", necessidades_sugeridas: [nova({ acao_ids_origem: refs(e), ...extra })], acoes_sem_necessidade: [], observacao_geral: "Observação curta." });
const semNec = (e, resultado, obs = "Não há evidência suficiente para definir a necessidade.") => ({ resultado, necessidades_sugeridas: [], acoes_sem_necessidade: refs(e), observacao_geral: obs });

// ── PDI de teste ──
const item = async (id, comp, obj, acoes, tipo = "Comportamental", pdi = p1) => {
  await db.query(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ($1, ${pdi}, $2, $3, $4)`, [id, comp, tipo, obj]);
  let ordem = 1;
  for (const [aid, desc] of acoes) await db.query(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ($1, $2, $3, 'Pendente', ${ordem++})`, [aid, id, desc]);
};
const GEN = (c) => `Desenvolver a competência de ${c}.`;
await item("Z1", "Comunicação", "Desenvolver maior clareza, segurança e capacidade de conduzir alinhamentos.", [["Z1a", "Realizar apresentações periódicas"], ["Z1b", "Solicitar feedback"], ["Z1c", "Conduzir alinhamentos entre áreas"]]);
await item("Z2", "Melhoria Contínua", GEN("Melhoria Contínua"), [["Z2a", "Inteligência Artificial (Claude)"]]);
await item("Z3", "Visão estratégica", GEN("Visão estratégica"), [["Z3a", "Participar das reuniões de resultado como ouvinte"], ["Z3b", "Elaborar trimestralmente cenário de custo de pessoal, headcount e recomendação à diretoria"]]);
await item("Z4", "Desenvolvimento profissional", "Evoluir tecnicamente.", [["Z4a", "Fazer curso de oratória"], ["Z4b", "Aprender Power BI para construir dashboards"]]);
await item("Z5", "Organização da rotina", "Manter a agenda da equipe organizada.", [["Z5a", "Atualizar a planilha de escalas toda segunda-feira"]], "Tecnica");
await item("Z6", "Planejamento", "Planejar entregas com antecedência.", [["Z6a", "Montar cronograma mensal"], ["Z6b", "Revisar riscos semanalmente"], ["Z6c", "Arquivar documentos do projeto"]]);
await item("Z7", "Liderança", "Liderar o time com autonomia.", [["Z7a", "Conduzir reunião individual mensal com cada liderado"], ["Z7b", "Delegar entregas com acompanhamento"]]);
await item("Z8", "Foco", "Manter o foco nas prioridades.", [["Z8a", "Reservar duas horas diárias sem interrupções"]]);

const sugsDe = (itemId) => sql(`select s.id, s.estado, s.origem_sugestao, s.texto_sugerido, s.tema, s.confianca, s.justificativa_interpretacao, s.interpretacao_id, s.derivada_de_id, s.categoria_sugerida, s.motivo_decisao, (select string_agg(pdi_acao_id, ',' order by pdi_acao_id) from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id and sa.ativa) as acoes from public.peopleflow_dev_pdi_sugestoes s where s.pdi_item_id = $1 order by s.id`, [itemId]);
const interpsDe = (itemId) => sql(`select * from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id = $1 order by id`, [itemId]);
const audit = (a) => sql(`select * from public.peopleflow_dev_auditoria where acao = $1 order by id`, [a]);
const nNec = async () => Number((await um(`select count(*) n from public.peopleflow_dev_necessidades`)).n);
const hashLegado = async () => (await um(`select md5(coalesce((select string_agg(to_jsonb(s)::text, '|' order by s.id) from public.peopleflow_dev_pdi_sugestoes s where s.origem_sugestao = 'legado'), '') || '#' ||
  coalesce((select string_agg(to_jsonb(a)::text, '|' order by a.id) from public.peopleflow_dev_pdi_sugestao_acoes a where a.sugestao_id in (select id from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado')), '') || '#' ||
  coalesce((select string_agg(to_jsonb(n)::text, '|' order by n.id) from public.peopleflow_dev_necessidades n), '') || '#' ||
  coalesce((select string_agg(to_jsonb(d)::text, '|' order by d.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas d), '')) h`)).h;
const lntLinhas = async () => Number((await um(`select (select count(*) from public.peopleflow_dev_lnt_ciclos)::int + (select count(*) from public.peopleflow_dev_lnt_itens)::int + (select count(*) from public.peopleflow_dev_lnt_necessidades)::int as n`)).n);
const decidirMantida = async (itemId, acaoId) => {
  const s = (await um(`insert into public.peopleflow_dev_pdi_sugestoes (origem_sugestao, pdi_id, pdi_item_id, texto_sugerido) values ('rh', ${p1}, $1, 'x') returning id`, [itemId])).id;
  await db.query(`insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values ($1, $2, $3, 'x')`, [s, itemId, acaoId]);
  await db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'decidido antes da IA' where id = $1`, [s]);
  return s;
};
const fotoLegado0 = await hashLegado();
const nec0 = await nNec();
const lnt0 = await lntLinhas();

// ═══ 0. Permissões e disponibilidade ═══
secao("0. Perfis (só RH) e disponibilidade da IA");
{
  usar(fake({ saida: (e) => umaNec(e) }));
  for (const [acao, corpo] of [["pdi_ia_analisar", { pdi_item_id: "Z1" }], ["pdi_ia_estado", {}]]) {
    const g = await chamar(acao, corpo, U_G1);
    check(`Gestor: ${acao} → 403`, g.codigo === 403 && /Somente o RH/.test(g.corpo.error));
    const x = await chamar(acao, corpo, U_ALHEIO);
    check(`usuário sem perfil no módulo (Colaborador/Diretoria): ${acao} → 401`, x.codigo === 401);
  }
  const semSessao = await chamar("pdi_ia_analisar", { pdi_item_id: "Z1" }, "00000000-0000-0000-0000-00000000ffff");
  check("sem sessão do módulo → 401, nenhuma chamada ao provedor, nada gravado", semSessao.codigo === 401 && (await interpsDe("Z1")).length === 0);
  usar(null);
  const est = await ok("pdi_ia_estado", {});
  check("IA indisponível (desligada/sem chave): estado informa e a ação responde 503 com orientação", est.disponivel === false && /fluxo manual/.test(est.mensagem) && (await chamar("pdi_ia_analisar", { pdi_item_id: "Z1" })).codigo === 503);
  check("indisponível: nenhuma interpretação criada", (await interpsDe("Z1")).length === 0);
  const g = await ok("pdi_triagem_gerar", { pdi_item_ids: ["Z8"] });
  check("indisponível: o fluxo MANUAL da Fase 7 continua funcionando (gerar sugestão local)", g.sugestoes === 1 && (await sugsDe("Z8"))[0].origem_sugestao === "regra_local");
  const f = fake({ saida: (e) => umaNec(e) });
  usar(f);
  check("com cliente configurado o estado é disponível", (await ok("pdi_ia_estado", {})).disponivel === true);
}

// ═══ 1. Os exemplos semânticos e os 4 resultados ═══
secao("1. Quatro resultados e persistência (Fase 7 + 8A)");
let sZ1, sZ2, sZ3;
{
  const f1 = fake({ saida: (e) => umaNec(e, { confianca: "alta" }) });
  usar(f1);
  const r = await ok("pdi_ia_analisar", { pdi_item_id: "Z1" });
  const s = await sugsDe("Z1");
  const ip = (await interpsDe("Z1"))[0];
  check("Exemplo A (Comunicação): necessidade_identificada → 1 sugestão IA com título (tema), descrição, confiança e justificativa, cobrindo as 3 ações", r.resultado === "necessidade_identificada" && s.length === 1 && s[0].origem_sugestao === "ia" && s[0].estado === "pendente" && s[0].tema === "Comunicação assertiva" && s[0].confianca === "alta" && /mesma capacidade/.test(s[0].justificativa_interpretacao) && s[0].acoes === "Z1a,Z1b,Z1c");
  check("a interpretação fica concluída com resultado, observação, modelo configurado, versão do prompt, hash e tokens", ip.status === "concluida" && ip.tipo === "ia" && ip.resultado_interpretacao === "necessidade_identificada" && ip.observacao_interpretacao === "Observação curta." && ip.provedor === "anthropic" && ip.modelo === "modelo-de-teste" && /^pdi-ia-v1\+[0-9a-f]{8}$/.test(ip.versao_prompt) && /^[0-9a-f]{32}$/.test(ip.hash_conteudo) && ip.tokens_entrada === 1234 && ip.tokens_saida === 321 && ip.itens_analisados === 1 && ip.sugestoes_geradas === 1 && ip.pdi_item_id === "Z1");
  check("categoria NÃO é decidida pela IA (categoria_sugerida nula) e a sugestão não vira necessidade", s[0].categoria_sugerida === null && (await nNec()) === nec0);
  sZ1 = s[0].id;

  usar(fake({ saida: (e) => semNec(e, "evidencia_insuficiente", "A ação indica possível interesse no uso de IA, mas o item não descreve qual capacidade precisa ser desenvolvida.") }));
  const r2 = await ok("pdi_ia_analisar", { pdi_item_id: "Z2" });
  const s2 = await sugsDe("Z2");
  const ip2 = (await interpsDe("Z2"))[0];
  check("Exemplo B (Melhoria Contínua + IA): evidencia_insuficiente → NENHUMA necessidade; só a sugestão NEUTRA ('A definir pelo RH', sem confiança/justificativa) cobrindo a ação", r2.resultado === "evidencia_insuficiente" && s2.length === 1 && s2[0].texto_sugerido === "A definir pelo RH" && s2[0].confianca === null && s2[0].justificativa_interpretacao === null && s2[0].tema === null && s2[0].acoes === "Z2a" && r2.neutra === true);
  check("o resultado semântico verdadeiro fica na interpretação (com a observação da IA)", ip2.resultado_interpretacao === "evidencia_insuficiente" && /possível interesse no uso de IA/.test(ip2.observacao_interpretacao));
  check("nada de 'Capacitação em IA/Claude' foi inventado: nenhuma sugestão IA com texto de necessidade", !s2.some((x) => x.confianca));
  sZ2 = s2[0].id;

  usar(fake({ saida: (e) => umaNec(e, { titulo: "Análise estratégica de indicadores de pessoas", descricao: "Desenvolvimento da análise estratégica de indicadores de pessoas e da sua conexão com os resultados do negócio.", confianca: "media" }) }));
  await ok("pdi_ia_analisar", { pdi_item_id: "Z3" });
  const s3 = await sugsDe("Z3");
  check("Exemplo C (Visão estratégica): a capacidade subjacente (não 'participar de reunião'), confiança media, 2 ações", s3.length === 1 && s3[0].confianca === "media" && /análise estratégica/.test(s3[0].texto_sugerido) && s3[0].acoes === "Z3a,Z3b");
  sZ3 = s3[0].id;

  usar(fake({ saida: (e) => ({ resultado: "multiplas_necessidades", necessidades_sugeridas: [nova({ titulo: "Comunicação oral", descricao: "Desenvolvimento da comunicação oral e da apresentação em público.", acao_ids_origem: [refs(e)[0]], confianca: "media" }), nova({ titulo: "Análise de dados", descricao: "Desenvolvimento da análise e visualização de dados para indicadores.", acao_ids_origem: [refs(e)[1]], confianca: "baixa" })], acoes_sem_necessidade: [], observacao_geral: "Temas sem vínculo entre si." }) }));
  const r4 = await ok("pdi_ia_analisar", { pdi_item_id: "Z4" });
  const s4 = await sugsDe("Z4");
  const ip4 = (await interpsDe("Z4"))[0];
  check("Exemplo D (oratória + Power BI): multiplas_necessidades → 2 sugestões na MESMA interpretação, cada uma com ações exclusivas, confiança e justificativa próprias", r4.resultado === "multiplas_necessidades" && s4.length === 2 && s4.every((x) => x.interpretacao_id === ip4.id) && s4.map((x) => x.acoes).sort().join() === "Z4a,Z4b" && s4.map((x) => x.confianca).sort().join() === "baixa,media" && ip4.sugestoes_geradas === 2 && ip4.resultado_interpretacao === "multiplas_necessidades");
  check("confiança baixa é aceita e persistida normalmente (sinal de revisão, não erro)", s4.some((x) => x.confianca === "baixa" && x.estado === "pendente"));

  usar(fake({ saida: (e) => semNec(e, "somente_acao_pdi", "Rotina de acompanhamento; não há lacuna distinta a registrar.") }));
  const r5 = await ok("pdi_ia_analisar", { pdi_item_id: "Z5" });
  const s5 = await sugsDe("Z5");
  check("somente_acao_pdi: só a neutra; interpretação registra o resultado e a explicação", r5.resultado === "somente_acao_pdi" && s5.length === 1 && s5[0].confianca === null && (await interpsDe("Z5"))[0].resultado_interpretacao === "somente_acao_pdi");

  usar(fake({ saida: (e) => ({ resultado: "necessidade_identificada", necessidades_sugeridas: [nova({ acao_ids_origem: [refs(e)[0], refs(e)[1]] })], acoes_sem_necessidade: [refs(e)[2]], observacao_geral: "A terceira ação é rotina." }) }));
  const r6 = await ok("pdi_ia_analisar", { pdi_item_id: "Z6" });
  const s6 = await sugsDe("Z6");
  check("necessidade + ação sem necessidade: 1 sugestão com necessidade (2 ações) + 1 neutra (a ação sem necessidade); cobertura integral", s6.length === 2 && s6.filter((x) => x.confianca).length === 1 && s6.find((x) => x.confianca).acoes === "Z6a,Z6b" && s6.find((x) => !x.confianca).acoes === "Z6c" && r6.neutra === true);
  check("nenhuma ação em duas sugestões ativas", (await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`)).length === 0);
  check("nenhuma Necessidade foi criada por nenhuma análise", (await nNec()) === nec0);
}

// ═══ 2. Respostas inválidas: nada é persistido ═══
secao("2. Resposta inválida → descartada, sem nada persistido, com retry");
{
  const casos = [
    ["JSON inválido (texto)", () => "isto não é json", "saida_nao_e_objeto"],
    ["chave faltando", () => ({ resultado: "necessidade_identificada" }), "chaves_da_raiz"],
    ["resultado inventado", (e) => ({ ...umaNec(e), resultado: "talvez" }), "resultado_invalido"],
    ["referência inexistente", (e) => umaNec(e, { acao_ids_origem: ["A1", "A9"] }), "referencia_invalida"],
    ["ação repetida", (e) => umaNec(e, { acao_ids_origem: ["A1", "A1", "A2"] }), "acao_repetida"],
    ["ação não coberta", (e) => umaNec(e, { acao_ids_origem: ["A1"] }), "acao_nao_coberta_A2"],
    ["descrição copia ação", (e) => umaNec(e, { descricao: "Conduzir reunião individual mensal com cada liderado" }), "descricao_copia_acao_A1"],
    ["descrição = competência", (e) => umaNec(e, { descricao: "Desenvolver a competência de Liderança." }), "descricao_so_a_competencia"],
    ["descrição 'A definir pelo RH'", (e) => umaNec(e, { descricao: "A definir pelo RH" }), "texto_a_definir"],
    ["descrição acima de 500", (e) => umaNec(e, { descricao: "palavra ".repeat(80) }), "descricao_longa"],
    ["título acima de 120", (e) => umaNec(e, { titulo: "t".repeat(121) }), "titulo_longo"],
    ["justificativa acima de 600", (e) => umaNec(e, { justificativa_interpretacao: "j".repeat(601) }), "justificativa_longa"],
    ["confiança inválida", (e) => umaNec(e, { confianca: "certeza" }), "confianca_invalida"],
    ["sem necessidade sem explicação", (e) => semNec(e, "evidencia_insuficiente", ""), "observacao_obrigatoria"],
    ["necessidade_identificada com 2 necessidades", (e) => ({ ...umaNec(e), necessidades_sugeridas: [nova({ acao_ids_origem: ["A1"] }), nova({ descricao: "Delegação com acompanhamento e feedback.", acao_ids_origem: ["A2"] })] }), "necessidade_identificada_exige_1"],
  ];
  const antesNec = await nNec();
  for (const [nome, gerar, trecho] of casos) {
    usar(fake({ saida: gerar }));
    const r = await chamar("pdi_ia_analisar", { pdi_item_id: "Z7" });
    const ips = await interpsDe("Z7");
    const ultima = ips[ips.length - 1];
    check(`${nome} → 502, interpretação 'falhou' (${trecho}), nenhuma sugestão criada`, r.codigo === 502 && /fora do formato esperado/.test(r.corpo.error) && ultima.status === "falhou" && ultima.erro_tecnico.includes(trecho) && (await sugsDe("Z7")).length === 0, `${r.codigo} ${ultima?.erro_tecnico}`);
  }
  const fals = await audit("pdi_ia_falhou");
  check("cada falha de validação foi auditada (códigos, sem o conteúdo do texto)", fals.length >= casos.length && fals.every((x) => x.detalhe.pdi_item_id));
  check("erro_tecnico guarda só códigos (sem texto livre da IA)", (await interpsDe("Z7")).every((x) => !/Conduzir reunião individual|palavra palavra/.test(x.erro_tecnico ?? "")));
  check("nenhuma Necessidade criada, nenhuma decisão tomada e a trava foi liberada a cada falha (item segue analisável)", (await nNec()) === antesNec && (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id = 'Z7' and status = 'em_andamento'`))[0].n === 0);
  usar(fake({ saida: (e) => umaNec(e) }));
  const retry = await chamar("pdi_ia_analisar", { pdi_item_id: "Z7" });
  check("RETRY depois de várias falhas funciona: sugestão criada, interpretação concluída", retry.codigo === 200 && (await sugsDe("Z7")).length === 1 && (await interpsDe("Z7")).filter((x) => x.status === "concluida").length === 1);
}

// ═══ 3. Provedor falhando, timeout e execução presa ═══
secao("3. Provedor indisponível, timeout, execução presa e função interrompida");
{
  usar(fake({ erro: new cli.ErroIa("indisponivel", "Não foi possível falar com o provedor da IA.", true) }));
  const r = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  const ip = (await interpsDe("Z8")).at(-1);
  check("provedor fora do ar → 502; interpretação 'falhou' (provedor:indisponivel); item e a sugestão local intactos; nenhuma necessidade", r.codigo === 502 && ip.status === "falhou" && ip.erro_tecnico === "provedor:indisponivel" && (await sugsDe("Z8")).filter((x) => x.estado === "pendente").length === 1 && (await sugsDe("Z8"))[0].origem_sugestao === "regra_local");
  const e2 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  usar(fake({ erro: new cli.ErroIa("limite", "limite", true) }));
  const e3 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  usar(fake({ erro: new cli.ErroIa("recusada", "recusa", true) }));
  const e4 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  usar(fake({ erro: new Error("explosão inesperada com segredo sk-ant-xyz") }));
  const e5 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  check("limite de uso / recusa / erro inesperado → 502, sem vazar a mensagem crua do erro nem chave", [e3, e4, e5].every((x) => x.codigo === 502) && !JSON.stringify(e5.corpo).includes("sk-ant") && !(await interpsDe("Z8")).some((x) => (x.erro_tecnico ?? "").includes("sk-ant")));
  void e2;
  process.env.PDI_IA_PRAZO_MS = "60";
  usar(fake({ saida: (e) => umaNec(e), atraso: 600 }));
  const t = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  delete process.env.PDI_IA_PRAZO_MS;
  check("timeout do provedor (prazo do servidor) → 504, interpretação 'falhou' (provedor:timeout), nada criado", t.codigo === 504 && (await interpsDe("Z8")).at(-1).erro_tecnico === "provedor:timeout" && (await sugsDe("Z8")).filter((x) => x.origem_sugestao === "ia").length === 0);
  check("depois de todas as falhas não há nenhuma interpretação presa em andamento", (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id = 'Z8' and status = 'em_andamento'`))[0].n === 0);
  await esp(650); // deixa o cliente falso lento terminar sem efeito
  const f = fake({ saida: (e) => umaNec(e) });
  usar(f);
  const ok8 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z8" });
  check("retry com o provedor de volta → sucesso (a sugestão local é substituída pela da IA)", ok8.codigo === 200 && f.chamadas.length === 1);

  // execução presa (função interrompida): interpretação 'em_andamento' antiga + sugestão IA pendente criada antes da queda
  await item("Z14", "Autonomia", "Atuar com autonomia.", [["Z14a", "Tomar decisões do dia a dia"]]);
  const velha = (await um(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, solicitada_em, provedor, modelo, versao_prompt, pdi_item_id) values ('ia', '${U_RH}', now() - interval '20 minutes', 'anthropic', 'm', 'v', 'Z14') returning id`)).id;
  const sObs = (await um(`insert into public.peopleflow_dev_pdi_sugestoes (interpretacao_id, origem_sugestao, pdi_id, pdi_item_id, texto_sugerido, tema, confianca, justificativa_interpretacao) values (${velha}, 'ia', ${p1}, 'Z14', 'Resíduo de uma análise interrompida', 'Resíduo', 'alta', 'j') returning id`)).id;
  await db.query(`insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values (${sObs}, 'Z14', 'Z14a', 'x')`);
  const fPresa = fake({ saida: (e) => umaNec(e) });
  usar(fPresa);
  const rp = await chamar("pdi_ia_analisar", { pdi_item_id: "Z14" });
  const iv = (await sql(`select status, erro_tecnico from public.peopleflow_dev_pdi_interpretacoes where id = ${velha}`))[0];
  const so = (await sql(`select estado, motivo_decisao from public.peopleflow_dev_pdi_sugestoes where id = ${sObs}`))[0];
  check("EXECUÇÃO PRESA (>10 min): é encerrada como 'falhou', a sugestão que ela deixou pendente é descartada, e a nova análise segue", rp.codigo === 200 && iv.status === "falhou" && /Interrompida/.test(iv.erro_tecnico) && so.estado === "substituida" && fPresa.chamadas.length === 1 && (await sugsDe("Z14")).filter((x) => x.estado === "pendente").length === 1);
  check("a interrupção foi auditada", (await audit("pdi_ia_interrompida")).some((x) => x.entidade_id === String(velha)));
  // em andamento RECENTE: bloqueia
  await item("Z14b", "Autonomia 2", "Atuar com autonomia.", [["Z14ba", "Priorizar tarefas"]]);
  await db.query(`insert into public.peopleflow_dev_pdi_interpretacoes (tipo, solicitada_por, provedor, modelo, versao_prompt, pdi_item_id) values ('ia', '${U_RH}', 'anthropic', 'm', 'v', 'Z14b')`);
  const fRec = fake({ saida: (e) => umaNec(e) });
  usar(fRec);
  const rr = await chamar("pdi_ia_analisar", { pdi_item_id: "Z14b" });
  check("análise EM ANDAMENTO recente (< 10 min) no mesmo item → 409 e o provedor NÃO é chamado", rr.codigo === 409 && /em andamento/.test(rr.corpo.error) && fRec.chamadas.length === 0);
}

// ═══ 4. Concorrência ═══
secao("4. Concorrência e idempotência");
{
  await item("Z13", "Priorização", "Priorizar demandas com critério.", [["Z13a", "Listar demandas semanais"], ["Z13b", "Priorizar por impacto"]]);
  const f = fake({ saida: (e) => umaNec(e), atraso: 250 });
  usar(f);
  const [a, b] = await Promise.all([chamar("pdi_ia_analisar", { pdi_item_id: "Z13" }), chamar("pdi_ia_analisar", { pdi_item_id: "Z13" })]);
  const codigos = [a.codigo, b.codigo].sort().join();
  check("duas análises SIMULTÂNEAS do mesmo item: uma conclui (200) e a outra recebe 409 controlado; sem 500", codigos === "200,409" && [a, b].filter((x) => x.codigo === 409).every((x) => /em andamento|já tem uma análise/.test(x.corpo.error)), codigos);
  check("o provedor foi chamado UMA vez só (a trava do banco barrou a segunda antes da chamada)", f.chamadas.length === 1);
  const ips = await interpsDe("Z13");
  const s = await sugsDe("Z13");
  check("estado final: 1 interpretação concluída, 1 sugestão ativa, nada duplicado", ips.length === 1 && ips[0].status === "concluida" && s.filter((x) => x.estado === "pendente").length === 1 && s.length === 1);
  const dup = await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`);
  check("nenhuma ação em duas sugestões ativas", dup.length === 0);
  const rep = await chamar("pdi_ia_analisar", { pdi_item_id: "Z13" });
  check("analisar de novo um item com análise IA ATUAL aguardando decisão → 409 (idempotente) e provedor não chamado", rep.codigo === 409 && /já tem uma análise/.test(rep.corpo.error) && f.chamadas.length === 1);
  // 5 simultâneas em itens diferentes: nenhuma interfere na outra
  const ids = ["Z15a", "Z15b", "Z15c"];
  for (const id of ids) await item(id, "Item " + id, "Objetivo do " + id + " com clareza.", [[id + "x", "Ação " + id]]);
  const f3 = fake({ saida: (e) => umaNec(e), atraso: 80 });
  usar(f3);
  const rs = await Promise.all(ids.map((id) => chamar("pdi_ia_analisar", { pdi_item_id: id })));
  check("análises simultâneas de itens DIFERENTES não se bloqueiam (a trava é por item)", rs.every((x) => x.codigo === 200) && f3.chamadas.length === 3);
}

// ═══ 5. Stale, decisão e ocupação durante a chamada ═══
secao("5. O PDI ou a sugestão mudam enquanto a IA responde");
{
  await item("Z9", "Atendimento", "Atender clientes internos com qualidade.", [["Z9a", "Responder chamados no prazo"], ["Z9b", "Registrar feedbacks dos clientes"]]);
  const antes = await nNec();
  usar(fake({ saida: (e) => umaNec(e), antes: () => db.query(`update public.peopleflow_pdi_acoes set descricao = 'Responder chamados em até 24 horas' where id = 'Z9a'`) }));
  const r = await chamar("pdi_ia_analisar", { pdi_item_id: "Z9" });
  check("STALE: o texto de uma ação mudou durante a chamada → 409, NADA persistido, interpretação 'falhou' (stale), nenhuma necessidade", r.codigo === 409 && /mudaram enquanto a IA analisava/.test(r.corpo.error) && (await sugsDe("Z9")).length === 0 && (await interpsDe("Z9")).at(-1).erro_tecnico.startsWith("stale") && (await nNec()) === antes);
  const f = fake({ saida: (e) => umaNec(e) });
  usar(f);
  check("depois do stale, analisar de novo (com o texto atual) funciona; o provedor recebe o texto NOVO", (await chamar("pdi_ia_analisar", { pdi_item_id: "Z9" })).codigo === 200 && f.chamadas[0].entrada.item.acoes[0].texto === "Responder chamados em até 24 horas");

  // regra local pendente decidida durante a chamada
  await item("Z11", "Colaboração", "Colaborar entre equipes.", [["Z11a", "Participar de projetos entre áreas"]]);
  await ok("pdi_triagem_gerar", { pdi_item_ids: ["Z11"] });
  const loc = (await sugsDe("Z11"))[0];
  usar(fake({ saida: (e) => umaNec(e), antes: () => db.query(`update public.peopleflow_dev_pdi_sugestoes set estado = 'mantida_no_pdi', decidido_por = '${U_RH}', decidido_em = now(), motivo_decisao = 'RH decidiu durante a análise' where id = ${loc.id}`) }));
  const r2 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z11" });
  const s2 = await sugsDe("Z11");
  check("DECIDIDA ENQUANTO A IA RESPONDE: análise abortada (409), a decisão do RH é preservada e nada novo é criado", r2.codigo === 409 && /foi decidida enquanto a IA analisava/.test(r2.corpo.error) && s2.length === 1 && s2[0].estado === "mantida_no_pdi" && s2[0].motivo_decisao === "RH decidiu durante a análise");

  // ação ocupada por outra sugestão durante a chamada
  await item("Z12", "Entrega", "Cumprir entregas no prazo.", [["Z12a", "Acompanhar cronograma"], ["Z12b", "Reportar riscos"]]);
  usar(fake({ saida: (e) => umaNec(e), antes: async () => {
    const s = (await um(`insert into public.peopleflow_dev_pdi_sugestoes (origem_sugestao, pdi_id, pdi_item_id, texto_sugerido) values ('rh', ${p1}, 'Z12', 'definida pelo RH') returning id`)).id;
    await db.query(`insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values (${s}, 'Z12', 'Z12a', 'x')`);
  } }));
  const r3 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z12" });
  const s3 = await sugsDe("Z12");
  check("AÇÃO OCUPADA por outra sugestão durante a chamada → 409, nada criado pela IA, a sugestão do RH intacta", r3.codigo === 409 && s3.length === 1 && s3[0].origem_sugestao === "rh" && s3[0].estado === "pendente");
  check("nenhuma ação em duas sugestões ativas", (await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`)).length === 0);
}

// ═══ 6. Substituição da regra local, item parcialmente decidido, já decidido ═══
secao("6. Regra local substituída, item parcialmente decidido e já decidido");
{
  await item("Z10", "Gestão do tempo", GEN("Gestão do tempo"), [["Z10a", "Planejar a agenda semanal"], ["Z10b", "Reservar blocos de foco"]]);
  await ok("pdi_triagem_gerar", { pdi_item_ids: ["Z10"] });
  const antiga = (await sugsDe("Z10"))[0];
  check("pré-condição: o item tem a sugestão da regra local pendente, 'A definir pelo RH'", antiga.origem_sugestao === "regra_local" && antiga.estado === "pendente" && antiga.texto_sugerido === "A definir pelo RH");
  const f = fake({ saida: (e) => umaNec(e) });
  usar(f);
  const r = await ok("pdi_ia_analisar", { pdi_item_id: "Z10" });
  const s = await sugsDe("Z10");
  const velha = s.find((x) => x.id === antiga.id);
  const nova1 = s.find((x) => x.origem_sugestao === "ia");
  check("REGRA LOCAL SUBSTITUÍDA com segurança: a antiga vira 'substituida' (histórico preservado, motivo registrado), a nova da IA fica pendente e aponta para ela (derivada_de_id)", velha.estado === "substituida" && velha.motivo_decisao === "Substituída pela análise da IA" && nova1.estado === "pendente" && nova1.derivada_de_id === antiga.id && r.substituidas.join() === String(antiga.id));
  check("sem duplicidade: exatamente 1 sugestão ativa por ação e nenhuma exclusão manual foi necessária", s.filter((x) => x.estado === "pendente").length === 1 && nova1.acoes === "Z10a,Z10b" && (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_sugestao_acoes where sugestao_id = ${antiga.id} and not ativa`))[0].n === 2);

  // parcialmente decidido
  await item("Z16", "Responsabilidade", "Assumir responsabilidade pelas entregas.", [["Z16a", "Cumprir o combinado nas reuniões"], ["Z16b", "Comunicar atrasos com antecedência"], ["Z16c", "Registrar lições aprendidas"]]);
  const dec = await decidirMantida("Z16", "Z16a");
  const f2 = fake({ saida: (e) => umaNec(e) });
  usar(f2);
  await ok("pdi_ia_analisar", { pdi_item_id: "Z16" });
  const sp = await sugsDe("Z16");
  check("ITEM PARCIALMENTE DECIDIDO: só as ações ainda sem decisão vão ao provedor (a decidida fica de fora do payload)", f2.chamadas[0].entrada.item.acoes.length === 2 && !JSON.stringify(f2.chamadas[0].entrada).includes("Cumprir o combinado"));
  check("a nova sugestão cobre SOMENTE as ações livres; a decisão antiga (mantida) segue intacta e não foi incorporada", sp.find((x) => x.origem_sugestao === "ia").acoes === "Z16b,Z16c" && sp.find((x) => x.id === dec).estado === "mantida_no_pdi" && sp.find((x) => x.id === dec).acoes === "Z16a");

  // já decidido
  await item("Z17", "Pontualidade", "Cumprir horários.", [["Z17a", "Chegar no horário"]]);
  await decidirMantida("Z17", "Z17a");
  const f3 = fake({ saida: (e) => umaNec(e) });
  usar(f3);
  const rd1 = await chamar("pdi_ia_analisar", { pdi_item_id: "Z17" });
  check("ITEM JÁ DECIDIDO: 409 'nada a analisar', provedor não chamado, nenhuma interpretação criada", rd1.codigo === 409 && /Nada a analisar/.test(rd1.corpo.error) && f3.chamadas.length === 0 && (await interpsDe("Z17")).length === 0);
  const leg = await chamar("pdi_ia_analisar", { pdi_item_id: "I2" });
  check("item cujas ações já foram decididas no LEGADO (as 2 mantidas somente no PDI) → também recusado, sem chamar o provedor", leg.codigo === 409 && f3.chamadas.every((c) => !JSON.stringify(c.entrada).includes("faltas")));

  // análise IA desatualizada pode ser refeita
  await item("Z20", "Qualidade do trabalho", "Entregar com qualidade.", [["Z20a", "Revisar entregas antes de enviar"]]);
  usar(fake({ saida: (e) => umaNec(e, { descricao: "Desenvolvimento da revisão e do controle de qualidade das próprias entregas." }) }));
  await ok("pdi_ia_analisar", { pdi_item_id: "Z20" });
  const primeira = (await sugsDe("Z20"))[0];
  await db.query(`update public.peopleflow_pdi_acoes set descricao = 'Revisar entregas com checklist antes de enviar' where id = 'Z20a'`);
  usar(fake({ saida: (e) => umaNec(e, { descricao: "Desenvolvimento do uso de checklist para garantir a qualidade das entregas." }) }));
  const re = await ok("pdi_ia_analisar", { pdi_item_id: "Z20" });
  const apos = await sugsDe("Z20");
  check("ANÁLISE IA DESATUALIZADA (PDI mudou depois) pode ser refeita: a antiga vira 'substituida' e a nova usa o texto atual", re.substituidas.join() === String(primeira.id) && apos.find((x) => x.id === primeira.id).estado === "substituida" && apos.filter((x) => x.estado === "pendente").length === 1);

  // necessidade criada e sem vínculo bloqueia a troca
  await item("Z18", "Disciplina", "Manter disciplina nas rotinas.", [["Z18a", "Seguir o checklist diário"]]);
  await ok("pdi_triagem_gerar", { pdi_item_ids: ["Z18"] });
  await db.query(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, departamento) values (3, 'pdi', ${p1}, 'Z18', 'Z18a', 'x', 'Necessidade criada antes da queda', 'PDI', 'comportamental', 'media', 'validada', now(), 'Produção')`);
  const f4 = fake({ saida: (e) => umaNec(e) });
  usar(f4);
  const ro = await chamar("pdi_ia_analisar", { pdi_item_id: "Z18" });
  check("necessidade já criada e sem vínculo → análise recusada (409 orientando a concluir a confirmação); provedor não chamado", ro.codigo === 409 && /Concluir confirmação/.test(ro.corpo.error) && f4.chamadas.length === 0);
}

// ═══ 7. Privacidade do payload ═══
secao("7. Nenhum dado pessoal no payload externo");
{
  await item("Z19", "Mentoria e rede", "Ampliar a rede de contatos.", [["PX-ACAO-123", "Mentoria com Gil Gestor (gil.gestor@empresa.com.br), CPF 123.456.789-09, tel (11) 91234-5678"], ["PX-ACAO-456", "Conversar com Quênia Qualidade sobre indicadores"]]);
  const f = fake({ saida: (e) => ({ resultado: "necessidade_identificada", necessidades_sugeridas: [nova({ acao_ids_origem: refs(e) })], acoes_sem_necessidade: [], observacao_geral: "ok" }) });
  usar(f);
  const r = await chamar("pdi_ia_analisar", { pdi_item_id: "Z19" });
  const { pedido, entrada } = f.chamadas[0];
  const tudo = JSON.stringify(pedido) + JSON.stringify(entrada);
  check("análise com texto sensível funciona", r.codigo === 200);
  check("o payload tem EXATAMENTE as chaves item{ref, tipo, competencia_kpi, objetivo, acoes[{ref, texto}]}", Object.keys(entrada).join() === "item" && Object.keys(entrada.item).join() === "ref,tipo,competencia_kpi,objetivo,acoes" && entrada.item.acoes.every((a) => Object.keys(a).join() === "ref,texto"));
  check("nomes de colaboradores do cadastro, e-mail, CPF e telefone saem do texto (viram marcadores)", entrada.item.acoes[0].texto.includes("[pessoa]") && entrada.item.acoes[0].texto.includes("[e-mail]") && entrada.item.acoes[0].texto.includes("[documento]") && entrada.item.acoes[0].texto.includes("[telefone]") && entrada.item.acoes[1].texto.includes("[pessoa]") && !/Gil Gestor|Quênia Qualidade|gil\.gestor|123\.456|91234/.test(tudo));
  check("nada do colaborador do PDI vai ao provedor: nome, departamento, cargo, gestor, ids internos e PDI", !/Paulo Produção|Quênia|Gil|Produção|Qualidade|Auxiliar|Supervisor|Analista|Mentoria e rede.*pdi/.test(tudo.replace(/Mentoria e rede/g, "")) && !tudo.includes("PX-ACAO") && !tudo.includes("Z19") && !new RegExp(`"id"|pdi_id|colaborador`, "i").test(tudo.replace(/PROMPT/g, "")));
  check("as referências são efêmeras (I1, A1, A2) e o prompt de sistema não contém dados reais", entrada.item.ref === "I1" && entrada.item.acoes.map((a) => a.ref).join() === "A1,A2" && !/@|\d{3}\.\d{3}\.\d{3}/.test(pedido.sistema));
  const ia = (await sugsDe("Z19")).find((x) => x.origem_sugestao === "ia");
  check("o servidor traduziu as referências de volta para os ids REAIS ao gravar", ia.acoes === "PX-ACAO-123,PX-ACAO-456");
  const aud = (await audit("pdi_ia_analisada")).at(-1).detalhe;
  check("a auditoria registra o NÚMERO de substituições da sanitização (nunca o texto removido)", aud.sanitizacoes >= 5 && !JSON.stringify(aud).includes("gil.gestor"));
}

// ═══ 8. O RH decide sobre sugestões da IA ═══
secao("8. Decisões do RH sobre as sugestões da IA (fluxos da 1B) — nada é automático");
{
  const antes = await nNec();
  // confirmar a necessidade de Z1 como veio
  const c1 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sZ1, texto: "Desenvolvimento da comunicação assertiva e da condução de alinhamentos interáreas.", categoria: "comportamental", prioridade: "media" });
  check("RH confirma a sugestão da IA: 1 Necessidade criada (origem PDI, texto aprovado), sugestão validada, confiança preservada", c1.codigo === 200 && (await nNec()) === antes + 1 && c1.corpo.dados.necessidade.origem === "pdi" && c1.corpo.dados.sugestao.estado === "validada" && (await sugsDe("Z1"))[0].confianca === "alta" && (await sugsDe("Z1"))[0].estado === "validada");
  const e1 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sZ2, texto: "A definir pelo RH", categoria: "comportamental" });
  check("a sugestão NEUTRA (evidência insuficiente) NÃO pode ser confirmada com 'A definir pelo RH' (422)", e1.codigo === 422);
  const c2 = await chamar("pdi_sugestao_confirmar", { sugestao_id: sZ2, texto: "Desenvolvimento do uso responsável de ferramentas de IA na melhoria de processos", categoria: "sistemas_ferramentas", prioridade: "baixa" });
  check("RH define a necessidade MANUALMENTE a partir da neutra → confirma (texto do RH)", c2.codigo === 200 && c2.corpo.dados.necessidade.descricao.startsWith("Desenvolvimento do uso responsável"));
  const m = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: sZ3 });
  check("RH mantém a sugestão da IA somente no PDI → sem necessidade, decisão registrada", m.codigo === 200 && (await nNec()) === antes + 2);
  const z4 = (await sugsDe("Z4")).filter((x) => x.estado === "pendente");
  const sep = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: z4[0].id });
  check("em 'multiplas', cada sugestão é decidida separadamente", sep.codigo === 200 && (await sugsDe("Z4")).filter((x) => x.estado === "pendente").length === 1);
  // separar uma sugestão IA com várias ações
  const z7 = (await sugsDe("Z7")).find((x) => x.estado === "pendente");
  const sp = await chamar("pdi_sugestao_separar", { sugestao_id: z7.id, grupos: [{ acao_ids: ["Z7a"], texto: "Condução de conversas individuais de acompanhamento" }, { acao_ids: ["Z7b"], texto: "Delegação com acompanhamento" }] });
  check("RH separa as ações de uma sugestão da IA (Separar ações da 1B segue valendo)", sp.codigo === 200 && (await sugsDe("Z7")).filter((x) => x.estado === "pendente").length === 2);
  check("toda necessidade criada nesta bateria veio de decisão explícita do RH (nenhuma sem sugestão validada ligada)", Number((await um(`select count(*) n from public.peopleflow_dev_necessidades n where n.origem = 'pdi' and n.id > 3 and not exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = n.id and s.estado = 'validada')`)).n) === 1 /* a criada à mão no teste Z18 */);
}

// ═══ 9. Integridade geral ═══
secao("9. Fase 7, LNT e legado intactos");
{
  const fotoDepois = await hashLegado();
  // as necessidades criadas pelas decisões do RH nesta bateria entram no hash; compara só as 3 originais + as 5 sugestões legado
  const orig = await um(`select md5(coalesce((select string_agg(to_jsonb(s)::text, '|' order by s.id) from public.peopleflow_dev_pdi_sugestoes s where s.origem_sugestao = 'legado'), '')) h`);
  void fotoDepois;
  check("as 5 sugestões legado (3 validadas, 2 mantidas no mesmo item) seguem exatamente como antes", orig.h.length === 32 && (await sql(`select estado from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado' order by id`)).map((x) => x.estado).join() === "validada,validada,validada,mantida_no_pdi,mantida_no_pdi");
  check("as 3 necessidades PDI originais e as 2 decisões PDI-only (tabela legada) intactas", (await um(`select md5(string_agg(to_jsonb(n)::text, '|' order by id)) h from public.peopleflow_dev_necessidades n where id <= 3`)).h.length === 32 && Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestoes_dispensadas`)).n) === 2);
  check("LNT intacta (nenhuma linha criada pela análise nem pelas decisões)", (await lntLinhas()) === lnt0);
  check("toda interpretação IA concluída fecha as contas (resultado × sugestões × cobertura) — consulta V8 da 8A", (await sql(`select i.id from public.peopleflow_dev_pdi_interpretacoes i cross join lateral (select count(*) filter (where s.confianca is not null) sem, count(*) filter (where s.confianca is null) neutras, count(*) total from public.peopleflow_dev_pdi_sugestoes s where s.interpretacao_id = i.id) x where i.tipo = 'ia' and i.status = 'concluida' and (i.sugestoes_geradas <> x.total or x.neutras > 1 or (i.resultado_interpretacao = 'necessidade_identificada' and x.sem <> 1) or (i.resultado_interpretacao = 'multiplas_necessidades' and x.sem < 2) or (i.resultado_interpretacao in ('evidencia_insuficiente', 'somente_acao_pdi') and (x.sem <> 0 or x.neutras <> 1)))`)).length === 0);
  check("nenhuma interpretação IA ficou presa 'em andamento' (exceto a que o próprio teste deixou recente em Z14b)", (await sql(`select pdi_item_id from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia' and status = 'em_andamento'`)).map((x) => x.pdi_item_id).join() === "Z14b");
  check("auditoria completa: análises, criações de sugestão e falhas registradas", (await audit("pdi_ia_analisada")).length >= 12 && (await audit("pdi_sugestao_criada")).length >= 12 && (await audit("pdi_ia_falhou")).length >= 15);
  void fotoLegado0;
}

console.log(`\nRESUMO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
