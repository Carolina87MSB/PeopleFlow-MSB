// PDI "Encerrado" (encerramento por desligamento) — migration supabase/pdi_encerramento.sql + ação do servidor `pdi_encerrar`,
// testados na RÉPLICA (Fases 1–7 reais + PDI), com dados FICTÍCIOS. Nada vai ao Supabase real.
//   cd tests && npm run test:pdi-encerramento
import { pathToFileURL } from "node:url";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, PDI, REPO, U_RH, U_G1 } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;
const R = await novaReplica();
const { db, sql, um, como } = R;
const { p1 } = await semearPdi(R);
const MIG7 = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG7.slice(0, MIG7.indexOf("$mig$;", MIG7.indexOf("do $mig$")) + 6));

const MIG = rd("pdi_encerramento.sql");
const VAL = rd("pdi_encerramento_validacao.sql").split("-- Informativo")[0].replace(/;\s*$/, "");
const ROLLBACK = rd("pdi_encerramento_rollback.sql");
const falha = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return String(e.message);
  }
};

// ── cenário: Rita (desligada) com PDI aberto; Raul (desligado) com PDI concluído; Zeca: homônimo desligado + homônimo ATIVO; Paulo (ativo) ──
await db.exec(`insert into public.colaboradores (nome, cargo, departamento, gestor, desligado, data_desligamento, admissao) values
  ('Rita Desligada', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-09-30', '2024-01-10'),
  ('Raul Desligado', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-08-30', '2024-01-10'),
  ('Zeca Homônimo', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-08-01', '2023-01-10'),
  ('Zeca Homônimo', 'Auxiliar', 'Produção', 'Gil Gestor', false, null, '2026-09-01')`);
const pRita = (await um(PDI.pdi("Rita Desligada"))).id;
const pRaul = (await um(PDI.pdi("Raul Desligado"))).id;
const pZeca = (await um(PDI.pdi("Zeca Homônimo"))).id;
await db.exec(`update public.peopleflow_pdi set status = 'Em andamento' where id in (${pRita}, ${pZeca}, ${p1}); update public.peopleflow_pdi set status = 'Concluído' where id = ${pRaul};
  insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values
    ('R1', ${pRita}, 'Comunicação', 'Comportamental', 'Comunicar com clareza.'), ('R2', ${pRita}, 'Organização', 'Comportamental', 'Organizar a agenda.'), ('R3', ${pRita}, 'Excel', 'Tecnica', 'Dominar planilhas.'),
    ('U1', ${pRaul}, 'Comunicação', 'Comportamental', 'Comunicar.'), ('Z1', ${pZeca}, 'Comunicação', 'Comportamental', 'Comunicar.');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values
    ('RA1', 'R1', 'apresentações mensais', 'Não iniciada', 1), ('RA2', 'R1', 'curso de oratória', 'Não iniciada', 2), ('RA3', 'R2', 'agenda semanal', 'Não iniciada', 3),
    ('RA4', 'R2', 'revisão de prioridades', 'Não iniciada', 4), ('RA5', 'R3', 'curso de tabelas', 'Não iniciada', 5), ('RA6', 'R3', 'planilha de controle', 'Não iniciada', 6),
    ('RA7', 'R3', 'fórmulas avançadas', 'Não iniciada', 7), ('RA8', 'R3', 'painel mensal', 'Não iniciada', 8),
    ('UA1', 'U1', 'ação concluída', 'Concluída', 1), ('ZA1', 'Z1', 'ação do homônimo', 'Não iniciada', 1)`);

// ═══ A. Migration ═══
secao("A. Migration: aditiva, idempotente e validada");
const antes = await um(`select md5(string_agg(to_jsonb(p)::text, '|' order by id)) h from public.peopleflow_pdi p`);
check("migration roda sem erro", (await falha(() => db.exec(MIG))) === null);
check("migration não altera nenhum dado existente (nem o carimbo updated_at)", (await um(`select md5(string_agg((to_jsonb(p) - 'encerrado_em' - 'encerrado_por' - 'encerrado_motivo')::text, '|' order by id)) h from public.peopleflow_pdi p`)).h === antes.h);
check("reaplicar a migration é inofensivo (idempotente)", (await falha(() => db.exec(MIG))) === null);
const val = await sql(VAL);
check("validação oficial: tudo OK", val.length > 0 && val.every((r) => r.resultado === "OK"), JSON.stringify(val.filter((r) => r.resultado !== "OK")));

// ── chamada ao servidor real ──
globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const chamar = async (acao, corpo, uid = U_RH) => {
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await da.executarAcao(acao, { headers: { authorization: "Bearer tok:" + uid }, body: corpo }, res);
  return res;
};
const hash = async (consulta) => (await um(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) h from (${consulta}) x`)).h;
const foto = async () => ({
  itensRita: await hash(`select * from public.peopleflow_pdi_itens where pdi_id = ${pRita}`),
  acoesRita: await hash(`select * from public.peopleflow_pdi_acoes where item_id in ('R1','R2','R3')`),
  sug: await hash(`select * from public.peopleflow_dev_pdi_sugestoes`),
  nec: await hash(`select * from public.peopleflow_dev_necessidades`),
  outrosPdi: await hash(`select * from public.peopleflow_pdi where id <> ${pRita}`),
  colab: await hash(`select * from public.colaboradores`),
});

// ═══ B. Ação do servidor: regras ═══
secao("B. pdi_encerrar: só RH, só desligado, só PDI aberto, motivo obrigatório");
check("Gestor → 403", (await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "x" }, U_G1)).codigo === 403);
check("sem motivo → 422", (await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "  " })).codigo === 422);
check("motivo > 1000 caracteres → 422", (await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "x".repeat(1001) })).codigo === 422);
check("id inválido → 422; PDI inexistente → 404", (await chamar("pdi_encerrar", { pdi_id: "abc", motivo: "x" })).codigo === 422 && (await chamar("pdi_encerrar", { pdi_id: 99999, motivo: "x" })).codigo === 404);
const rAtivo = await chamar("pdi_encerrar", { pdi_id: p1, motivo: "teste" });
check("colaborador ATIVO → 422 'não consta como desligado'", rAtivo.codigo === 422 && /não consta como desligado/.test(rAtivo.corpo.error));
const rHom = await chamar("pdi_encerrar", { pdi_id: pZeca, motivo: "teste" });
check("homônimo ATIVO impede o encerramento (não confunde pessoas)", rHom.codigo === 422 && /não consta como desligado/.test(rHom.corpo.error));
const rConc = await chamar("pdi_encerrar", { pdi_id: pRaul, motivo: "teste" });
check("PDI concluído não é encerrado → 422", rConc.codigo === 422 && /concluído/.test(rConc.corpo.error));
const f0 = await foto();
check("as recusas não alteram nada", (await um(`select count(*)::int n from public.peopleflow_pdi where status = 'Encerrado'`)).n === 0 && (await um(`select count(*)::int n from public.peopleflow_dev_auditoria where acao = 'pdi_encerrado'`)).n === 0);

// ═══ C. Encerramento do PDI da Rita ═══
secao("C. Encerramento: o cabeçalho muda, tudo o mais é preservado");
const ok = await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "Colaboradora desligada em 30/09/2026." });
check("RH encerra o PDI de desligada → 200", ok.codigo === 200, JSON.stringify(ok.corpo));
const linha = await um(`select status, encerrado_em, encerrado_por, encerrado_motivo from public.peopleflow_pdi where id = ${pRita}`);
check("status Encerrado, com data, responsável (nome do RH) e motivo", linha.status === "Encerrado" && linha.encerrado_em && linha.encerrado_por === "Ana RH" && linha.encerrado_motivo === "Colaboradora desligada em 30/09/2026.");
const f1 = await foto();
check("itens, ações, sugestões, necessidades e cadastro IDÊNTICOS (3 itens, 8 ações)", f1.itensRita === f0.itensRita && f1.acoesRita === f0.acoesRita && f1.sug === f0.sug && f1.nec === f0.nec && f1.colab === f0.colab);
check("as 8 ações seguem 'Não iniciada' (nenhuma concluída nem cancelada)", (await um(`select count(*)::int n from public.peopleflow_pdi_acoes where item_id in ('R1','R2','R3') and status = 'Não iniciada'`)).n === 8);
check("os demais PDIs ficam idênticos", f1.outrosPdi === f0.outrosPdi);
const aud = await sql(`select * from public.peopleflow_dev_auditoria where acao = 'pdi_encerrado'`);
check("auditoria: 1 evento com antes/depois, motivo e fotografia (3 itens / 8 ações)", aud.length === 1 && aud[0].entidade_id === String(pRita) && aud[0].detalhe.antes.status === "Em andamento" && aud[0].detalhe.depois.status === "Encerrado"
  && aud[0].detalhe.preservado.itens === 3 && aud[0].detalhe.preservado.acoes === 8 && aud[0].detalhe.preservado.acoes_por_status["Não iniciada"] === 8 && aud[0].user_id === U_RH);
const de = await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "de novo" });
check("encerrar de novo → 422 'já está encerrado' (sem nova auditoria)", de.codigo === 422 && /já está encerrado/.test(de.corpo.error) && (await sql(`select 1 from public.peopleflow_dev_auditoria where acao = 'pdi_encerrado'`)).length === 1);
check("validação oficial continua OK depois do encerramento", (await sql(VAL)).every((r) => r.resultado === "OK"));

// ═══ D. Imutabilidade no banco ═══
secao("D. Imutabilidade: PDI encerrado não aceita nenhuma alteração (itens, ações, evidências)");
const tentativas = [
  ["reabrir (status → Em andamento)", `update public.peopleflow_pdi set status = 'Em andamento', encerrado_em = null, encerrado_por = null, encerrado_motivo = null where id = ${pRita}`],
  ["alterar o ciclo do cabeçalho", `update public.peopleflow_pdi set ciclo = 'outro' where id = ${pRita}`],
  ["excluir o PDI", `delete from public.peopleflow_pdi where id = ${pRita}`],
  ["editar um item", `update public.peopleflow_pdi_itens set objetivo_desenvolvimento = 'x' where id = 'R1'`],
  ["mover um item para outro PDI", `update public.peopleflow_pdi_itens set pdi_id = ${p1} where id = 'R1'`],
  ["inserir item", `insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia) values ('RX', ${pRita}, 'x', 'Tecnica')`],
  ["excluir item", `delete from public.peopleflow_pdi_itens where id = 'R3'`],
  ["concluir uma ação", `update public.peopleflow_pdi_acoes set status = 'Concluída' where id = 'RA1'`],
  ["gravar evidência/descrição numa ação", `update public.peopleflow_pdi_acoes set descricao = descricao || ' (evidência)' where id = 'RA2'`],
  ["inserir ação", `insert into public.peopleflow_pdi_acoes (id, item_id, descricao) values ('RAX', 'R1', 'nova')`],
  ["excluir ação", `delete from public.peopleflow_pdi_acoes where id = 'RA8'`],
];
for (const [nome, cmd] of tentativas) {
  const e = await falha(() => db.exec(cmd));
  check(`bloqueado (service_role/SQL): ${nome}`, e !== null && /encerrado/i.test(e), String(e));
}
for (const [nome, cmd] of [tentativas[1], tentativas[3], tentativas[7]]) {
  const e = await como("authenticated", U_RH, () => falha(() => db.exec(cmd)));
  check(`bloqueado (navegador, RLS using(true)): ${nome}`, e !== null && /encerrado/i.test(e), String(e));
}
check("após todas as tentativas o PDI continua exatamente como foi encerrado", JSON.stringify(await foto()) === JSON.stringify(f1) && (await um(`select status from public.peopleflow_pdi where id = ${pRita}`)).status === "Encerrado");
check("PDIs abertos de outras pessoas continuam editáveis (itens e ações)", (await falha(() => db.exec(`update public.peopleflow_pdi_itens set observacoes = 'ok' where id = 'I1'; update public.peopleflow_pdi_acoes set status = 'Em andamento' where id = 'A2'`))) === null);

// ═══ E. CHECK de consistência e transição ═══
secao("E. Consistência: o encerramento só nasce completo e só altera o cabeçalho previsto");
check("status Encerrado sem motivo é recusado", /encerramento_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_pdi set status = 'Encerrado', encerrado_em = now(), encerrado_por = 'RH' where id = ${pZeca}`)))));
check("dados de encerramento sem status Encerrado são recusados", /encerramento_chk/.test(String(await falha(() => db.exec(`update public.peopleflow_pdi set encerrado_motivo = 'x' where id = ${pZeca}`)))));
check("encerrar alterando outro campo junto é recusado", /só altera status/.test(String(await falha(() => db.exec(`update public.peopleflow_pdi set status = 'Encerrado', encerrado_em = now(), encerrado_por = 'RH', encerrado_motivo = 'm', ciclo = 'outro' where id = ${pZeca}`)))));
check("PDI concluído não pode ser encerrado direto no banco", /Só um PDI aberto/.test(String(await falha(() => db.exec(`update public.peopleflow_pdi set status = 'Encerrado', encerrado_em = now(), encerrado_por = 'RH', encerrado_motivo = 'm' where id = ${pRaul}`)))));

// ═══ F. Triagem do PDI ignora PDI encerrado ═══
secao("F. Triagem: PDI encerrado nunca gera sugestão nem necessidade");
// PDI de pessoa ATIVA encerrado direto no banco (a ação do servidor recusa ativos): prova o filtro por status, independente do cadastro
await db.exec(`insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values ('Q1', ${p1}, 'Foco', 'Comportamental', 'Manter foco nas entregas.');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('QA1', 'Q1', 'rotina de foco diário', 'Não iniciada', 1);
  update public.peopleflow_pdi set status = 'Encerrado', encerrado_em = now(), encerrado_por = 'RH', encerrado_motivo = 'teste' where id = ${p1}`);
const g = await chamar("pdi_triagem_gerar", {});
const comSug = (await sql(`select count(*)::int n from public.peopleflow_dev_pdi_sugestao_acoes a where a.pdi_acao_id in ('QA1','RA1','RA2','RA3','RA4','RA5','RA6','RA7','RA8') and a.ativa`))[0]?.n ?? 0;
check("gerar sugestões não cria nada para PDI encerrado (de ativo ou de desligado)", g.codigo === 200 && comSug === 0, JSON.stringify(g.corpo));

// ═══ G. Reversão ═══
secao("G. Reversão da migration");
const hRita = async () => (await foto()).itensRita + (await foto()).acoesRita;
const hAntesRb = await hRita();
const recusa = await falha(() => db.exec(ROLLBACK));
check("com PDI encerrado a reversão é RECUSADA (nada apagado)", /REVERSÃO RECUSADA/.test(String(recusa)) && (await um(`select status from public.peopleflow_pdi where id = ${pRita}`)).status === "Encerrado");
check("com a autorização explícita, a reversão devolve 'Em andamento' e remove as estruturas", (await falha(() => db.exec(ROLLBACK.replace("v_permitir_perda constant boolean := false", "v_permitir_perda constant boolean := true")))) === null
  && (await um(`select status from public.peopleflow_pdi where id = ${pRita}`)).status === "Em andamento"
  && (await um(`select count(*)::int n from information_schema.columns where table_name = 'peopleflow_pdi' and column_name like 'encerrado%'`)).n === 0
  && (await um(`select count(*)::int n from pg_trigger where tgname like 'peopleflow_pdi%encerrado_guard'`)).n === 0);
check("itens e ações da Rita seguem intactos depois da reversão", (await hRita()) === hAntesRb);
check("e a migration pode ser reaplicada depois da reversão", (await falha(() => db.exec(MIG))) === null);

console.log(`\nPDI ENCERRAMENTO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
