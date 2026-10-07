// Etapa 1B — ações do servidor da triagem do PDI por ITEM, testadas na RÉPLICA (Fases 1–6 reais + Fase 7 real + PDI).
// Nada vai ao banco de produção. Roda o código de servidor REAL (api/_lib/desenvolvimentoAcoes.ts → executarAcao).
import { pathToFileURL } from "node:url";
import { criarCliente } from "./shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, REPO, U_RH, U_G1 } from "./base.mjs";

const C = criarContador();
const { check, secao } = C;

const R = await novaReplica();
const { db, sql, um, como } = R;
const { p1, p2 } = await semearPdi(R);

// ── legado "real": 3 necessidades PDI (1 ação cada) + 2 ações mantidas somente no PDI NO MESMO item (I2) ──
const nec = async (colab, pdi, item, acao, desc) => (await um(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, validada_por, departamento, solicitado_por_colaborador_id, created_by)
  values (${colab}, 'pdi', ${pdi}, '${item}', '${acao}', 'x', '${desc}', 'PDI', 'comportamental', 'media', 'validada', now() - interval '1 day', '${U_RH}', 'Produção', 1, '${U_RH}') returning id`)).id;
const N1 = await nec(3, p1, "I1", "A1", "desenvolver clareza, objetividade e segurança na comunicação");
const N2 = await nec(4, p2, "I3", "C1", "assumir a condução de alinhamentos envolvendo temas críticos");
const N3 = await nec(4, p2, "I4", "D1", "Reciclagem nos POPs aplicáveis à rotina. ".repeat(14).slice(0, 500));
await db.exec(`insert into public.peopleflow_dev_pdi_sugestoes_dispensadas (pdi_acao_id, pdi_id, motivo, dispensada_por) values ('B1', ${p1}, 'Mantida somente no PDI (sem observação).', '${U_RH}'), ('B2', ${p1}, 'Já acompanhado pelo gestor', '${U_RH}')`);
// Fase 7 (1A) real + backfill, exatamente como em produção
const MIG = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG.slice(0, MIG.indexOf("$mig$;", MIG.indexOf("do $mig$")) + 6));
// APLICAR_8A=1: roda a mesma suíte com a migration da Fase 8A por cima (prova que a 1B não depende de a 8A estar ausente)
if (process.env.APLICAR_8A) await db.exec(rd("desenvolvimento_fase8a_ia_fundacao.sql"));

// itens extras para os cenários (PDI: nada disso é alterado pela triagem)
await db.exec(`
  insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values
    ('I6', ${p2}, 'Organização', 'Comportamental', 'Desenvolver a competência de Organização.'),
    ('I7', ${p1}, 'ABSETEÍSMO (individual)', 'Tecnica', 'Desenvolver a competência de ABSETEÍSMO (individual).'),
    ('I8', ${p2}, 'Visão de negócio', 'Comportamental', 'Desenvolver visão de negócio e capacidade de conduzir alinhamentos entre áreas.'),
    ('I9', ${p1}, 'Excel', 'Tecnica', 'Dominar planilhas para controles do setor.');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values
    ('F1', 'I6', 'organizar a agenda semanal da equipe', 'Pendente', 1),
    ('G1', 'I7', 'Identificar os principais motivos das faltas e atrasos', 'Pendente', 1),
    ('G2', 'I7', 'Acompanhar mensalmente faltas e atrasos', 'Pendente', 2),
    ('H1', 'I8', 'participar das reuniões de resultado como ouvinte', 'Pendente', 1),
    ('H2', 'I8', 'fazer curso de oratória', 'Pendente', 2),
    ('B3', 'I2', 'registrar semanalmente as ausências do time', 'Pendente', 3),
    ('J1', 'I9', 'curso de tabelas dinâmicas', 'Pendente', 1);
`);

// ── chamada ao servidor real ─────────────────────────────────────────
globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const chamar = async (acao, corpo, uid = U_RH) => {
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await da.executarAcao(acao, { headers: { authorization: "Bearer tok:" + uid }, body: corpo }, res);
  return res;
};
const ok = async (acao, corpo) => { const r = await chamar(acao, corpo); if (r.codigo !== 200) throw new Error(`${acao} → ${r.codigo} ${r.corpo?.error}`); return r.corpo.dados; };
const hashTab = async (t, chave = "id") => (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.${chave}), '')) h from public.${t} x`)).h;
const sugDoItem = (item) => sql(`select s.id, s.estado, s.origem_sugestao, s.derivada_de_id, s.texto_sugerido, s.texto_final, s.editada, s.necessidade_id, s.interpretacao_id, (select string_agg(pdi_acao_id, ',' order by pdi_acao_id) from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id and sa.ativa) as acoes_ativas from public.peopleflow_dev_pdi_sugestoes s where s.pdi_item_id = '${item}' order by s.id`);
const audit = (a) => sql(`select * from public.peopleflow_dev_auditoria where acao = $1 order by id`, [a]);

// Fotografias para provar "nada real mudou"
const fotoLegado = {
  nec123: await um(`select md5(string_agg(to_jsonb(n)::text, '|' order by id)) h from public.peopleflow_dev_necessidades n where id in (${N1}, ${N2}, ${N3})`),
  disp: await hashTab("peopleflow_dev_pdi_sugestoes_dispensadas", "pdi_acao_id"),
  sug12345: await um(`select md5(string_agg(to_jsonb(s)::text, '|' order by id)) h from public.peopleflow_dev_pdi_sugestoes s where origem_sugestao = 'legado'`),
  acoes12345: await um(`select md5(string_agg(to_jsonb(a)::text, '|' order by id)) h from public.peopleflow_dev_pdi_sugestao_acoes a where sugestao_id in (select id from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado')`),
  lnt: await um(`select (select count(*) from public.peopleflow_dev_lnt_ciclos)::int + (select count(*) from public.peopleflow_dev_lnt_itens)::int + (select count(*) from public.peopleflow_dev_lnt_necessidades)::int as n`),
};
const hashItens = async () => (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) h from public.peopleflow_pdi_itens x where x.id <> 'I10'`)).h;
const fotoPdi = { pdi: await hashTab("peopleflow_pdi"), itens: await hashItens() };

// ═══ 0. Permissões ═══
secao("0. Perfis: só o RH");
const acoesNovas = [["pdi_triagem_gerar", {}], ["pdi_sugestao_confirmar", { sugestao_id: 1, texto: "x", categoria: "comportamental" }], ["pdi_sugestao_manter_no_pdi", { sugestao_id: 1 }], ["pdi_sugestao_separar", { sugestao_id: 1, grupos: [] }], ["pdi_sugestao_regenerar", { sugestao_id: 1 }], ["pdi_sugestao_aceitar", { pdi_acao_id: "A2", categoria: "comportamental" }], ["pdi_sugestao_dispensar", { pdi_acao_id: "A2" }]];
for (const [acao, corpo] of acoesNovas) {
  const g = await chamar(acao, corpo, U_G1);
  check(`Gestor: ${acao} → 403`, g.codigo === 403 && /Somente o RH/.test(g.corpo.error));
}
const sem = await chamar("pdi_triagem_gerar", {}, "00000000-0000-0000-0000-00000000ffff");
check("sem sessão do módulo (ex.: Colaborador/Diretoria, que não têm conta no módulo) → 401", sem.codigo === 401);
check("nada foi gravado pelas tentativas negadas", Number((await um(`select count(*) n from public.peopleflow_dev_pdi_interpretacoes`)).n) === 0);

// ═══ 1. Estado inicial: decisões legadas na nova leitura ═══
secao("1. As 5 decisões legadas aparecem corretamente na fonte de verdade nova (view)");
const dest = Object.fromEntries((await como("authenticated", U_RH, async () => (await db.query(`select pdi_acao_id, destino from public.peopleflow_dev_v_pdi_acoes_triagem`)).rows)).map((r) => [r.pdi_acao_id, r.destino]));
check("3 necessidades legadas → confirmada (A1, C1, D1)", dest.A1 === "confirmada" && dest.C1 === "confirmada" && dest.D1 === "confirmada");
check("2 mantidas legadas, NO MESMO item (I2) → mantida_no_pdi (B1, B2); B3 (ação nova do mesmo item) → sem decisão", dest.B1 === "mantida_no_pdi" && dest.B2 === "mantida_no_pdi" && dest.B3 === "sem_decisao");
check("as 2 mantidas são 2 sugestões legado separadas, no mesmo item (não foram fundidas)", (await sugDoItem("I2")).filter((s) => s.estado === "mantida_no_pdi").length === 2);

// ═══ 2. Gerar sugestões locais ═══
secao("2. Sugestão local por item (regra pdi-item-v1, sem IA)");
const g1 = await ok("pdi_triagem_gerar", {});
console.log("   gerar →", JSON.stringify(g1));
const exe = await um(`select * from public.peopleflow_dev_pdi_interpretacoes where id = ${g1.interpretacao_id}`);
check("execução registrada: tipo regra_local, versão pdi-item-v1, concluída, sem provedor/modelo, com hash e contagens", exe.tipo === "regra_local" && exe.versao_regra === "pdi-item-v1" && exe.status === "concluida" && exe.provedor === null && exe.modelo === null && exe.itens_analisados === g1.itens && exe.sugestoes_geradas === g1.sugestoes && exe.hash_conteudo.length === 32);
check("itens com ação sem decisão geraram sugestão (I1 A2/A3, I2 B3, I5, I6, I7, I8, I9); itens já decididos não", g1.itens === 7 && g1.sugestoes === 7, JSON.stringify(g1));
const s_i6 = (await sugDoItem("I6"))[0], s_i5 = (await sugDoItem("I5"))[0], s_i7 = (await sugDoItem("I7"))[0], s_i8 = (await sugDoItem("I8"))[0], s_i2 = (await sugDoItem("I2")).find((s) => s.estado === "pendente"), s_i1 = (await sugDoItem("I1")).find((s) => s.estado === "pendente");
check("1) item com 1 ação → uma sugestão com 1 ação", s_i6.acoes_ativas === "F1");
check("2) item com várias ações relacionadas → UMA sugestão com todas (I5: E1,E2,E3)", s_i5.acoes_ativas === "E1,E2,E3" && s_i5.origem_sugestao === "regra_local" && s_i5.interpretacao_id === g1.interpretacao_id);
check("13) item parcialmente decidido: I1 (A1 já confirmada) → sugestão só com A2,A3; I2 (B1,B2 mantidas) → só com a ação pendente B3", s_i1.acoes_ativas === "A2,A3" && s_i2.acoes_ativas === "B3");
check("objetivo específico vira o texto da sugestão, sem mudar uma palavra (I8)", s_i8.texto_sugerido === "Desenvolver visão de negócio e capacidade de conduzir alinhamentos entre áreas.");
check("objetivo genérico → a regra NÃO sintetiza: texto neutro 'A definir pelo RH', sem colar as ações (I7)", s_i7.texto_sugerido === "A definir pelo RH" && !/faltas|atrasos/i.test(s_i7.texto_sugerido));
const sI5 = await um(`select item_competencia_nome, item_tipo_competencia, item_objetivo from public.peopleflow_dev_pdi_sugestoes where id = ${s_i5.id}`);
check("Competência/KPI e objetivo preservados exatamente como vieram do PDI (fotografia do banco)", sI5.item_competencia_nome === "Comunicação" && sI5.item_tipo_competencia === "Comportamental" && sI5.item_objetivo === "Comunicar com clareza e segurança.");
const g2 = await ok("pdi_triagem_gerar", {});
check("15) repetir 'gerar' (duplo clique) não cria nada de novo: 0 itens, nenhuma execução extra", g2.itens === 0 && g2.sugestoes === 0 && Number((await um(`select count(*) n from public.peopleflow_dev_pdi_interpretacoes`)).n) === 1);
const dup = await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`);
check("8) nenhuma ação em duas sugestões ativas", dup.length === 0);
const nPend = Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestoes where estado = 'pendente'`)).n);
check("a geração não criou nenhuma Necessidade na Base (só 3 + legado)", Number((await um(`select count(*) n from public.peopleflow_dev_necessidades`)).n) === 3 && nPend === 7);

// ═══ 3. Confirmar ═══
secao("3. Confirmar / editar e confirmar (cria UMA necessidade, ação principal, ações na nova estrutura)");
const c1 = await ok("pdi_sugestao_confirmar", { sugestao_id: s_i5.id, texto: "Fortalecer a comunicação profissional, com foco em clareza e objetividade.", categoria: "comportamental", prioridade: "alta" });
const necNova = c1.necessidade;
check("6) cria UMA necessidade: origem PDI, validada, do colaborador do PDI, com o texto aprovado", necNova.origem === "pdi" && necNova.status === "validada" && necNova.descricao === "Fortalecer a comunicação profissional, com foco em clareza e objetividade." && necNova.colaborador_id === 3 && necNova.pdi_id === p1 && necNova.pdi_item_id === "I5");
check("7) ponteiro legado = AÇÃO PRINCIPAL (menor ordem: E1)…", necNova.pdi_acao_id === "E1");
check("7) …e as 3 ações (E1,E2,E3) ficam na nova estrutura, ligadas à sugestão validada", (await sugDoItem("I5"))[0].acoes_ativas === "E1,E2,E3" && c1.sugestao.estado === "validada");
check("5) editar antes de confirmar: texto_sugerido preservado, texto_final = aprovado, editada = true", c1.sugestao.texto_sugerido === s_i5.texto_sugerido && c1.sugestao.texto_final === necNova.descricao && c1.sugestao.editada === true);
check("a sugestão fica ligada à necessidade criada", Number(c1.sugestao.necessidade_id) === necNova.id);
const c1b = await chamar("pdi_sugestao_confirmar", { sugestao_id: s_i5.id, texto: "outro texto", categoria: "comportamental" });
check("15) confirmar de novo a mesma sugestão (duplo clique) → 409 e NENHUMA necessidade a mais", c1b.codigo === 409 && Number((await um(`select count(*) n from public.peopleflow_dev_necessidades where pdi_item_id = 'I5'`)).n) === 1);
const c2 = await ok("pdi_sugestao_confirmar", { sugestao_id: s_i6.id, texto: "Organizar a rotina e a agenda da equipe de forma planejada", categoria: "comportamental", prioridade: "media" });
check("sugestão 'a definir' (I6) confirmada com texto escrito pelo RH", c2.sugestao.estado === "validada" && c2.necessidade.pdi_acao_id === "F1" && c2.necessidade.descricao === "Organizar a rotina e a agenda da equipe de forma planejada" && c2.sugestao.texto_sugerido === "A definir pelo RH");
const ev = await audit("pdi_sugestao_editada_e_confirmada");
const ev2 = await audit("pdi_sugestao_confirmada");
check("auditoria: editada_e_confirmada (texto sugerido × final, ações, principal, necessidade) e confirmada sem edição", ev.length === 1 && ev[0].detalhe.editada === true && ev[0].detalhe.acao_principal === "E1" && ev[0].detalhe.acoes.length === 3 && ev[0].detalhe.necessidade_id === necNova.id && ev[0].detalhe.texto_final === necNova.descricao && ev2.length === 1 && ev2[0].detalhe.editada === false);
const cInv = await chamar("pdi_sugestao_confirmar", { sugestao_id: s_i7.id, texto: "x", categoria: "inventada" });
check("categoria inválida → 422; texto vazio → 422", cInv.codigo === 422 && (await chamar("pdi_sugestao_confirmar", { sugestao_id: s_i7.id, texto: "  ", categoria: "comportamental" })).codigo === 422);
check("recuperação: necessidade igual e sem vínculo (queda entre criar e vincular) é reaproveitada, sem duplicar", await (async () => {
  const ctxTexto = "Necessidade já criada, mas sem vínculo à sugestão";
  await db.exec(`insert into public.peopleflow_dev_necessidades (colaborador_id, origem, pdi_id, pdi_item_id, pdi_acao_id, pdi_item_nome, descricao, justificativa, categoria, prioridade, status, validada_em, departamento) values (3, 'pdi', ${p1}, 'I9', 'J1', 'Excel', '${ctxTexto}', 'PDI', 'tecnica', 'media', 'validada', now(), 'Produção')`);
  // a guarda legada recusa decidir de novo pela via antiga ação com decisão — mas J1 só tem sugestão PENDENTE, então a necessidade acima pôde ser criada
  const sj = (await sugDoItem("I9"))[0];
  const r = await chamar("pdi_sugestao_confirmar", { sugestao_id: sj.id, texto: ctxTexto, categoria: "tecnica" });
  return r.codigo === 200 && Number((await um(`select count(*) n from public.peopleflow_dev_necessidades where pdi_item_id = 'I9'`)).n) === 1 && (await sugDoItem("I9"))[0].estado === "validada";
})());

// ═══ 4. Manter somente no PDI ═══
secao("4. Manter somente no PDI (item puramente operacional)");
const m1 = await ok("pdi_sugestao_manter_no_pdi", { sugestao_id: s_i7.id });
const nBase = Number((await um(`select count(*) n from public.peopleflow_dev_necessidades`)).n);
check("4) mantida: estado mantida_no_pdi, texto padrão, nenhuma necessidade criada", m1.sugestao.estado === "mantida_no_pdi" && m1.motivo.startsWith("Mantida somente no PDI") && nBase === 3 + 3);
check("a decisão cobre as 2 ações do item (G1, G2) e elas não voltam à fila", (await sugDoItem("I7"))[0].acoes_ativas === "G1,G2");
const m1b = await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: s_i7.id });
check("15) repetir → 409 e nada novo", m1b.codigo === 409 && (await audit("pdi_sugestao_mantida_no_pdi")).length === 1);
const dispAntes = Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestoes_dispensadas`)).n);
check("a tabela legada de 'dispensadas' NÃO recebe a nova decisão (a fonte de verdade é a nova estrutura)", dispAntes === 2);

// ═══ 5. Separar ações ═══
secao("5. Separar ações (item com 2 ações de temas diferentes)");
const sep = await ok("pdi_sugestao_separar", { sugestao_id: s_i8.id, grupos: [{ acao_ids: ["H1"], texto: "Ampliar a visão de negócio do RH" }, { acao_ids: ["H2"] }] });
check("3) 2 sugestões novas, uma por grupo; a original vira 'substituida'", sep.novas.length === 2 && (await sugDoItem("I8")).find((s) => s.id === s_i8.id).estado === "substituida");
const novasI8 = (await sugDoItem("I8")).filter((s) => s.derivada_de_id === s_i8.id);
check("derivada_de_id aponta a original; origem 'rh'; sem execução; texto do RH no 1º grupo; ações distribuídas", novasI8.length === 2 && novasI8.every((s) => s.origem_sugestao === "rh" && s.interpretacao_id === null && s.estado === "pendente") && novasI8.find((s) => s.acoes_ativas === "H1").texto_sugerido === "Ampliar a visão de negócio do RH" && novasI8.find((s) => s.acoes_ativas === "H2"));
check("a original NÃO foi apagada e guarda as ações (histórico), agora inativas", Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestao_acoes where sugestao_id = ${s_i8.id} and not ativa`)).n) === 2);
const textosOriginais = await sql(`select id, descricao from public.peopleflow_pdi_acoes where id in ('H1','H2') order by id`);
check("os textos originais das ações no PDI continuam idênticos", textosOriginais[0].descricao === "participar das reuniões de resultado como ouvinte" && textosOriginais[1].descricao === "fazer curso de oratória");
check("8) continua sem ação em duas sugestões ativas", (await sql(`select pdi_acao_id from public.peopleflow_dev_pdi_sugestao_acoes where ativa group by 1 having count(*) > 1`)).length === 0);
const sepX = await chamar("pdi_sugestao_separar", { sugestao_id: s_i8.id, grupos: [{ acao_ids: ["H1"] }, { acao_ids: ["H2"] }] });
check("15) separar de novo a mesma (já substituída) → 409, nada duplicado", sepX.codigo === 409 && (await sugDoItem("I8")).length === 3);
const sepIn = await chamar("pdi_sugestao_separar", { sugestao_id: novasI8[0].id, grupos: [{ acao_ids: [novasI8[0].acoes_ativas] }] });
check("menos de 2 grupos → 422", sepIn.codigo === 422);
const sepIn2 = await chamar("pdi_sugestao_separar", { sugestao_id: s_i1.id, grupos: [{ acao_ids: ["A2"] }, { acao_ids: ["A2", "A3"] }] });
check("ação em dois grupos → 422; ação de fora da sugestão → 422", sepIn2.codigo === 422 && (await chamar("pdi_sugestao_separar", { sugestao_id: s_i1.id, grupos: [{ acao_ids: ["A2"] }, { acao_ids: ["E1"] }] })).codigo === 422);
check("separação auditada (original, novas e ações) e cada nova sugestão registrada como criada", (await audit("pdi_sugestao_separada")).length === 1 && (await audit("pdi_sugestao_separada"))[0].detalhe.novas.length === 2 && (await audit("pdi_sugestao_criada")).length >= 9);
// uma das novas ainda pode ser confirmada e a outra mantida
const cH = await ok("pdi_sugestao_confirmar", { sugestao_id: novasI8.find((s) => s.acoes_ativas === "H1").id, texto: "Ampliar a visão de negócio do RH", categoria: "comportamental" });
const mH = await ok("pdi_sugestao_manter_no_pdi", { sugestao_id: novasI8.find((s) => s.acoes_ativas === "H2").id, motivo: "Curso já previsto na trilha" });
check("depois de separar: um grupo vira necessidade e o outro fica só no PDI (com a observação do RH)", cH.necessidade.pdi_acao_id === "H1" && mH.sugestao.estado === "mantida_no_pdi" && mH.motivo === "Curso já previsto na trilha");

// ═══ 6. Origem alterada ═══
secao("6. PDI alterado depois: sugestão pendente não é confirmada em silêncio; decisão tomada não é reescrita");
const snapDecidida = await um(`select md5(to_jsonb(s)::text) h from public.peopleflow_dev_pdi_sugestoes s where id = ${c1.sugestao.id}`);
const snapNec = await um(`select md5(to_jsonb(n)::text) h from public.peopleflow_dev_necessidades n where id = ${necNova.id}`);
await db.query(`update public.peopleflow_pdi_acoes set descricao = 'registrar semanalmente as ausências e os motivos do time' where id = 'B3'`); // o gestor edita o PDI
await db.query(`update public.peopleflow_pdi_acoes set descricao = 'aprimorar clareza e objetividade (editada depois da decisão)' where id = 'E1'`); // ação de uma decisão já tomada
const stale = await chamar("pdi_sugestao_confirmar", { sugestao_id: s_i2.id, texto: "x", categoria: "comportamental" });
check("9) confirmar sugestão desatualizada → 409 'O PDI foi alterado após esta sugestão'", stale.codigo === 409 && /O PDI foi alterado/.test(stale.corpo.error));
check("9) manter somente no PDI numa sugestão desatualizada também é bloqueado (409)", (await chamar("pdi_sugestao_manter_no_pdi", { sugestao_id: s_i2.id })).codigo === 409);
check("10) a decisão JÁ tomada (E1) não foi reescrita: sugestão, texto_final, snapshot e necessidade idênticos", (await um(`select md5(to_jsonb(s)::text) h from public.peopleflow_dev_pdi_sugestoes s where id = ${c1.sugestao.id}`)).h === snapDecidida.h && (await um(`select md5(to_jsonb(n)::text) h from public.peopleflow_dev_necessidades n where id = ${necNova.id}`)).h === snapNec.h);
const vis = await como("authenticated", U_RH, async () => (await db.query(`select id, estado_exibicao, origem_alterada, origem_alterada_apos_decisao, contexto_do_item_alterado from public.peopleflow_dev_v_pdi_sugestoes where id in (${c1.sugestao.id}, ${s_i2.id})`)).rows);
const vDec = vis.find((v) => v.id === c1.sugestao.id), vPend = vis.find((v) => v.id === s_i2.id);
check("10) decisão tomada: só o aviso histórico 'origem alterada após decisão' (estado continua editada_validada)", vDec.origem_alterada_apos_decisao === true && vDec.estado_exibicao === "editada_validada");
check("pendente: a view marca 'desatualizada'", vPend.estado_exibicao === "desatualizada" && vPend.origem_alterada === true);
const reg = await ok("pdi_sugestao_regenerar", { sugestao_id: s_i2.id });
check("regenerar: a antiga vira 'substituida' (não é apagada) e nasce uma nova, com o texto ATUAL da ação", (await sugDoItem("I2")).find((s) => s.id === s_i2.id).estado === "substituida" && reg.nova && reg.nova.derivada_de_id === s_i2.id && reg.nova.estado === "pendente");
check("a nova sugestão regenerada nasce atualizada (confirmável) e usa uma execução regra_local", (await chamar("pdi_sugestao_regenerar", { sugestao_id: reg.nova.id })).codigo === 409 && Number((await um(`select count(*) n from public.peopleflow_dev_pdi_interpretacoes where id = ${reg.nova.interpretacao_id} and tipo = 'regra_local'`)).n) === 1);
check("regenerar auditado", (await audit("pdi_sugestao_regenerada")).length === 1);
const cNova = await ok("pdi_sugestao_confirmar", { sugestao_id: reg.nova.id, texto: reg.nova.texto_sugerido, categoria: "comportamental" });
check("a regenerada pode ser confirmada normalmente", cNova.sugestao.estado === "validada" && cNova.necessidade.pdi_acao_id === "B3");

// ═══ 7. Ações antigas delegam ═══
secao("7. pdi_sugestao_aceitar / pdi_sugestao_dispensar agora delegam ao novo fluxo");
// I1: A2,A3 sugeridas juntas (pendente). A tela antiga decide só A2.
const nAntes = Number((await um(`select count(*) n from public.peopleflow_dev_necessidades`)).n);
const velho = await chamar("pdi_sugestao_aceitar", { pdi_acao_id: "A2", categoria: "comportamental", prioridade: "alta" });
check("14) aceitar (ação antiga) → 200 e devolve a necessidade como antes", velho.codigo === 200 && velho.corpo.dados.origem === "pdi" && velho.corpo.dados.pdi_acao_id === "A2" && velho.corpo.dados.descricao === "realizar apresentações periódicas de resultados, solicitando feedback");
const sA2 = (await sugDoItem("I1")).filter((s) => s.estado === "validada" && s.acoes_ativas === "A2");
check("14) delegou: a sugestão de 2 ações foi separada; A2 virou sugestão de 1 ação VALIDADA na nova estrutura, ligada à necessidade", sA2.length === 1 && Number(sA2[0].necessidade_id) === velho.corpo.dados.id && (await sugDoItem("I1")).some((s) => s.estado === "pendente" && s.acoes_ativas === "A3"));
check("14) o restante (A3) continua pendente em outra sugestão; 1 necessidade a mais, só", Number((await um(`select count(*) n from public.peopleflow_dev_necessidades`)).n) === nAntes + 1);
const velho2 = await chamar("pdi_sugestao_aceitar", { pdi_acao_id: "A2", categoria: "comportamental" });
check("15) aceitar A2 de novo → 409 com a mensagem de sempre, sem duplicar", velho2.codigo === 409 && /já está na Base/.test(velho2.corpo.error) && Number((await um(`select count(*) n from public.peopleflow_dev_necessidades where pdi_acao_id = 'A2'`)).n) === 1);
const dv = await chamar("pdi_sugestao_dispensar", { pdi_acao_id: "A3", motivo: "Só execução do PDI" });
check("14) dispensar (ação antiga) → 200, formato antigo {pdi_acao_id, motivo, dispensada_em}; vira mantida_no_pdi na nova estrutura", dv.codigo === 200 && dv.corpo.dados.pdi_acao_id === "A3" && dv.corpo.dados.motivo === "Só execução do PDI" && Boolean(dv.corpo.dados.dispensada_em) && (await sugDoItem("I1")).some((s) => s.estado === "mantida_no_pdi" && s.acoes_ativas === "A3"));
check("14) …e a tabela legada de dispensadas continua com as 2 originais (sem decisão nova só no legado)", Number((await um(`select count(*) n from public.peopleflow_dev_pdi_sugestoes_dispensadas`)).n) === 2);
const dv2 = await chamar("pdi_sugestao_dispensar", { pdi_acao_id: "A3" });
check("15) dispensar de novo → 409 'já foi mantida somente no PDI'", dv2.codigo === 409 && /mantida somente no PDI/.test(dv2.corpo.error));
check("aceitar ação já mantida (B1, legado) → 422 como antes; dispensar ação já confirmada (A1, legado) → 409 como antes", (await chamar("pdi_sugestao_aceitar", { pdi_acao_id: "B1", categoria: "comportamental" })).codigo === 422 && (await chamar("pdi_sugestao_dispensar", { pdi_acao_id: "A1" })).codigo === 409);
// ação sem nenhuma sugestão (ex.: item novo no PDI): a via antiga cria sugestão de 1 ação
await db.exec(`insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('K1', 'I9', 'tutorial interno de fórmulas', 'Pendente', 2)`);
const velho3 = await chamar("pdi_sugestao_aceitar", { pdi_acao_id: "K1", categoria: "tecnica" });
check("ação sem sugestão: a via antiga cria a sugestão de 1 ação (origem 'rh') e confirma", velho3.codigo === 200 && (await sugDoItem("I9")).some((s) => s.origem_sugestao === "rh" && s.estado === "validada" && s.acoes_ativas === "K1"));

// ═══ 8. Recuperação: separação interrompida ═══
secao("8. Recuperação: ações livres (original já substituída, sem novas) voltam à fila e podem receber sugestão");
await db.exec(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ('I10', ${p2}, 'Planejamento', 'Comportamental', 'Planejar entregas com antecedência e comunicar riscos ao time.');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('L1', 'I10', 'montar cronograma', 'Pendente', 1), ('L2', 'I10', 'reunião semanal de riscos', 'Pendente', 2)`);
const gI10 = await ok("pdi_triagem_gerar", { pdi_item_ids: ["I10"] });
const sI10 = (await sugDoItem("I10"))[0];
check("gerar só para o item pedido", gI10.itens === 1 && gI10.sugestoes === 1 && sI10.acoes_ativas === "L1,L2");
await db.query(`update public.peopleflow_dev_pdi_sugestoes set estado='substituida', decidido_por='${U_RH}', decidido_em=now(), motivo_decisao='simulando queda no meio da separação' where id = ${sI10.id}`);
const dI10 = Object.fromEntries((await como("authenticated", U_RH, async () => (await db.query(`select pdi_acao_id, destino from public.peopleflow_dev_v_pdi_acoes_triagem where pdi_item_id = 'I10'`)).rows)).map((r) => [r.pdi_acao_id, r.destino]));
check("as ações ficam 'sem_decisao' (voltam à fila, nada se perdeu)", dI10.L1 === "sem_decisao" && dI10.L2 === "sem_decisao");
const gI10b = await ok("pdi_triagem_gerar", { pdi_item_ids: ["I10"] });
check("'Gerar sugestão' de novo cria a sugestão das ações livres", gI10b.sugestoes === 1 && (await sugDoItem("I10")).filter((s) => s.estado === "pendente").length === 1);

// ═══ 9. Nada real mudou ═══
secao("9. Nada real foi alterado");
check("18) as 3 necessidades legadas (linhas completas) idênticas", (await um(`select md5(string_agg(to_jsonb(n)::text, '|' order by id)) h from public.peopleflow_dev_necessidades n where id in (${N1}, ${N2}, ${N3})`)).h === fotoLegado.nec123.h);
check("19) as 2 decisões legadas 'mantidas somente no PDI' (tabela legada) idênticas", (await hashTab("peopleflow_dev_pdi_sugestoes_dispensadas", "pdi_acao_id")) === fotoLegado.disp);
check("19) as 5 sugestões legado e suas ações de origem idênticas (inclusive as 2 no mesmo item)", (await um(`select md5(string_agg(to_jsonb(s)::text, '|' order by id)) h from public.peopleflow_dev_pdi_sugestoes s where origem_sugestao = 'legado'`)).h === fotoLegado.sug12345.h && (await um(`select md5(string_agg(to_jsonb(a)::text, '|' order by id)) h from public.peopleflow_dev_pdi_sugestao_acoes a where sugestao_id in (select id from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado')`)).h === fotoLegado.acoes12345.h);
check("17) LNT: nenhuma linha criada nas tabelas da LNT", Number((await um(`select (select count(*) from public.peopleflow_dev_lnt_ciclos)::int + (select count(*) from public.peopleflow_dev_lnt_itens)::int + (select count(*) from public.peopleflow_dev_lnt_necessidades)::int as n`)).n) === fotoLegado.lnt.n);
const hojePdi = { pdi: await hashTab("peopleflow_pdi"), itens: await hashItens() };
check("o PDI (cabeçalhos e itens) idêntico ao do início: a triagem nunca grava no PDI (as ações só mudaram onde o TESTE simulou o gestor editando/criando ações)", hojePdi.pdi === fotoPdi.pdi && hojePdi.itens === fotoPdi.itens);
check("nenhuma necessidade criada sem decisão do RH: toda necessidade de origem PDI nova está ligada a uma sugestão validada", Number((await um(`select count(*) n from public.peopleflow_dev_necessidades n where origem = 'pdi' and id not in (${N1}, ${N2}, ${N3}) and not exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = n.id)`)).n) === 0);
const aud = await sql(`select acao, count(*)::int n from public.peopleflow_dev_auditoria where acao like 'pdi_%' or acao = 'necessidade_do_pdi' group by 1 order by 1`);
console.log("   eventos de auditoria:", aud.map((a) => `${a.acao}=${a.n}`).join(", "));
check("eventos de auditoria previstos existem: interpretação executada, sugestão criada, confirmada, editada e confirmada, mantida, separada, regenerada", ["pdi_interpretacao_executada", "pdi_sugestao_criada", "pdi_sugestao_confirmada", "pdi_sugestao_editada_e_confirmada", "pdi_sugestao_mantida_no_pdi", "pdi_sugestao_separada", "pdi_sugestao_regenerada"].every((e) => aud.some((a) => a.acao === e)));

console.log(`\nRESUMO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
