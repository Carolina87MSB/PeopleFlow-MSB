// Adoção da regra central na view de conformidade (supabase/desligamentos_adocao_conformidade.sql) numa réplica PGlite com as Fases 1–6
// REAIS do módulo Desenvolvimento. Dados fictícios; nunca toca no Supabase de produção.
//   cd tests && npx tsx desligamentos/teste_views.mjs
import { U_RH, criarContador, novaReplica, rd } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { db, sql, um, como, erro } = await novaReplica();

const adocao = rd("desligamentos_adocao_conformidade.sql");
const reversao = rd("desligamentos_adocao_conformidade_rollback.sql");
const base = rd("desligamentos_historico_e_situacao.sql");

// a função de normalização de nomes da Fase 2 já existe na réplica; a migration de situação (pré-requisito) entra agora
await db.exec(base);

// amostra: 1 cargo com 1 requisito obrigatório vigente → cada pessoa ativa aparece na conformidade
await db.exec(`
  insert into public.peopleflow_descricoes_cargo (cargo_nome) values ('Analista Teste');
  insert into public.peopleflow_dev_lista_mestra (codigo, titulo, revisao_atual, periodicidade_meses) values ('POP-TESTE-1', 'Documento de teste', '00', 12);
  insert into public.peopleflow_dev_cargo_requisitos (cargo_nome, tipo_requisito, lista_mestra_codigo, obrigatorio, status, validado_em, validado_por) values ('Analista Teste', 'treinamento', 'POP-TESTE-1', true, 'vigente', now(), '${U_RH}');
  insert into public.colaboradores (nome, cargo, departamento, desligado, data_desligamento, admissao, empresa_afiliada) values
    ('Cat Ativa', 'Analista Teste', 'Produção', false, null, '2024-01-01', false),
    ('Del Desligado Passado', 'Analista Teste', 'Produção', true, current_date - 30, '2024-01-01', false),
    ('Fut Desligamento Futuro', 'Analista Teste', 'Produção', true, current_date + 30, '2024-01-01', false),
    ('Sem Data Desligada', 'Analista Teste', 'Produção', true, null, '2024-01-01', false),
    ('Afil Afiliada', 'Analista Teste', 'Produção', false, null, '2024-01-01', true),
    ('Nov Admissao Futura', 'Analista Teste', 'Produção', false, null, current_date + 20, false);
`);

const nomesNaView = async () =>
  (await como("authenticated", U_RH, async () => (await db.query("select c.nome from public.peopleflow_dev_v_conformidade v join public.colaboradores c on c.id = v.colaborador_id where c.cargo = 'Analista Teste' order by c.nome")).rows.map((r) => r.nome))).join(" | ");
const colunas = async () => (await sql("select string_agg(column_name, ',' order by ordinal_position) as c from information_schema.columns where table_schema='public' and table_name='peopleflow_dev_v_conformidade'"))[0].c;

C.secao("antes da adoção (regra antiga do filtro)");
const colunasAntes = await colunas();
const defAntes = (await um("select pg_get_viewdef('public.peopleflow_dev_v_conformidade'::regclass, true) as d")).d;
C.check("a definição viva contém o filtro antigo que o script procura", /COALESCE\(c\.desligado, false\) = false AND COALESCE\(c\.empresa_afiliada, false\) = false/.test(defAntes), defAntes.slice(0, 300));
const antes = await nomesNaView();
C.check("antes: só a ativa (desligamento futuro já fica de fora, como o antigo `desligado = false`)", antes === "Cat Ativa", antes);

C.secao("adoção da regra central");
await db.exec(adocao);
const depois = await nomesNaView();
C.check("depois: ativa E quem tem desligamento FUTURO (continua na empresa até a data)", depois === "Cat Ativa | Fut Desligamento Futuro", depois);
C.check("depois: desligado (passado e sem data), afiliada e admissão futura continuam FORA", !/Del Desligado|Sem Data|Afil|Nov Admissao/.test(depois));
C.check("as colunas da view não mudaram", (await colunas()) === colunasAntes);
C.check("a view mantém security_invoker", (await um("select 'security_invoker=true' = any(reloptions) as s from pg_class where oid = 'public.peopleflow_dev_v_conformidade'::regclass")).s === true);
C.check("a view agora usa a função central", /peopleflow_ativo_em/.test((await um("select pg_get_viewdef('public.peopleflow_dev_v_conformidade'::regclass, true) as d")).d));
await db.exec(adocao);
C.check("reaplicável (idempotente): segunda execução não altera nada", (await nomesNaView()) === depois);

C.secao("reversão");
await db.exec(reversao);
C.check("reversão restaura o comportamento antigo", (await nomesNaView()) === "Cat Ativa");
C.check("reversão mantém colunas e security_invoker", (await colunas()) === colunasAntes && (await um("select 'security_invoker=true' = any(reloptions) as s from pg_class where oid = 'public.peopleflow_dev_v_conformidade'::regclass")).s === true);
await db.exec(reversao);
C.check("reversão também é idempotente", (await nomesNaView()) === "Cat Ativa");
await db.exec(adocao);

C.secao("guardas");
{
  // definição inesperada: o script ABORTA sem alterar nada
  await db.exec("rollback").catch(() => {});
  await db.exec(reversao);
  await db.exec("create or replace view public.peopleflow_dev_v_conformidade with (security_invoker = true) as select 1::bigint as colaborador_id, null::bigint as requisito_id, null::text as cargo_nome, null::text as lista_mestra_codigo, null::text as revisao_atual, null::text as revisao_realizada, null::date as ultima_realizacao, null::date as validade_ate, null::boolean as agendado, 'x'::text as situacao");
  const e = await erro(() => db.exec(adocao));
  C.check("com a definição inesperada o script aborta e não altera a view", e !== null && /ABORTADO/.test(String(e.message ?? e)), String(e?.message ?? e));
  await db.exec("rollback").catch(() => {});
  C.check("a view continua como estava depois do aborto", (await um("select count(*)::int as n from public.peopleflow_dev_v_conformidade")).n === 1);
  // sem a função (pré-condição)
  await db.exec("drop view public.peopleflow_dev_v_conformidade");
  await db.exec(rd("desenvolvimento_fase5b_homologacao.sql").slice(rd("desenvolvimento_fase5b_homologacao.sql").indexOf("create or replace view public.peopleflow_dev_v_conformidade"), rd("desenvolvimento_fase5b_homologacao.sql").indexOf("create or replace view public.peopleflow_dev_v_conformidade") + 4000).split(/;\s*\n/)[0] + ";");
  C.check("view original recriada para o teste de pré-condição", (await sql("select to_regclass('public.peopleflow_dev_v_conformidade') is not null as t"))[0].t);
}

console.log(`\nDESLIGAMENTOS VIEWS: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas === 0 ? 0 : 1);
