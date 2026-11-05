// Migration da habilitação (banco): testes locais (PGlite) da migration PROPOSTA — dados preservados, impacto nas permissões, reversão, histórico e segurança.
// (sessão do módulo, ações e página de presença) sobre uma réplica PGlite com as migrations reais. Dados fictícios; nunca toca o Supabase de produção.
//   cd tests && npm run test:treinamentos-operacao
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { criarFake } from "./fakeSupabase.ts";

const PF = fileURLToPath(new URL("../../", import.meta.url)).split("\\").join("/").replace(/\/$/, "");
const SQL = (n: string) => fs.readFileSync(`${PF}/supabase/${n}`, "utf8");
const { emailOf } = await import(pathToFileURL(`${PF}/src/domain/hierarquia.ts`).href);

const db = new PGlite();
let ok = 0, falhas = 0;
const t = async (n: string, fn: () => Promise<void>) => { try { await fn(); ok++; console.log("  ✓", n); } catch (e) { falhas++; console.log("  ✗", n, "→", (e as Error).message); } };
const q = async (sql: string) => (await db.query(sql)).rows as any[];

const U = { rh: "00000000-0000-0000-0000-0000000000a1", ge: "00000000-0000-0000-0000-0000000000b2", gil: "00000000-0000-0000-0000-0000000000b3", resp: "00000000-0000-0000-0000-0000000000c3", hugo: "00000000-0000-0000-0000-0000000000c4", p3: "00000000-0000-0000-0000-0000000000d4", p5: "00000000-0000-0000-0000-0000000000d5", p4: "00000000-0000-0000-0000-0000000000e5", p9: "00000000-0000-0000-0000-0000000000e9", semcadastro: "00000000-0000-0000-0000-0000000000f6" };
const NOMES: Record<number, string> = { 1: "Ana Recursos", 2: "Bia Gestora", 3: "Caio Operador", 4: "Davi Logistica", 5: "Eva Operadora", 6: "Gil Logistico", 7: "Fabio Instrutor", 8: "Hugo Auxiliar", 9: "Iris Operadora" };

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (bucket_id text, name text);
create table public.module_access (user_id uuid, modulo text);
create table public.colaboradores (id bigint primary key, cpf text not null default '', nome text not null, cargo text not null default '', departamento text not null default '', vinculo text, depto_code text, nivel text, gestor text, admissao date, desligado boolean default false, data_desligamento date, motivo_desligamento text, desligado_by text, matriz9box_visao_completa boolean default false, empresa_afiliada boolean default false);
alter table public.colaboradores enable row level security; create policy leitura on public.colaboradores for select to authenticated using (true); grant select on public.colaboradores to authenticated;
create table public.peopleflow_descricoes_cargo (cargo_nome text primary key, obsoleto boolean not null default false);
create table public.peopleflow_pdi (id bigint generated always as identity primary key);
insert into auth.users select unnest(array['${Object.values(U).join("','")}'])::uuid;
insert into public.module_access (user_id, modulo) select id, 'peopleflow' from auth.users;
insert into public.colaboradores (id, nome, cargo, departamento, gestor) values
 (1,'${NOMES[1]}','Analista de RH','Recursos Humanos','Dir'),(2,'${NOMES[2]}','Supervisora','Produção','Dir'),(3,'${NOMES[3]}','Operador','Produção','${NOMES[2]}'),
 (4,'${NOMES[4]}','Conferente','Logística','${NOMES[6]}'),(5,'${NOMES[5]}','Operador','Produção','${NOMES[2]}'),(6,'${NOMES[6]}','Supervisor','Logística','Dir'),
 (7,'${NOMES[7]}','Técnico','Qualidade','Outro'),(8,'${NOMES[8]}','Auxiliar','Produção','${NOMES[2]}'),(9,'${NOMES[9]}','Operador','Produção','${NOMES[2]}');
insert into public.peopleflow_descricoes_cargo (cargo_nome) values ('Operador'),('Supervisora'),('Supervisor'),('Conferente'),('Técnico'),('Analista de RH'),('Auxiliar');
`);
for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_avaliacao_reacao.sql", "desenvolvimento_participacao_gravacao.sql"]) await db.exec(SQL(f));
await db.exec(`
insert into public.peopleflow_dev_lista_mestra (codigo,titulo,revisao_atual,situacao) values ('P-PR-001','Montagem da sonda','03','vigente'),('I-PR-010','Inspeção final','01','vigente');
`);
const fake = criarFake(db, {
  rh: { id: U.rh, email: emailOf(NOMES[1]) }, ge: { id: U.ge, email: emailOf(NOMES[2]) }, gil: { id: U.gil, email: emailOf(NOMES[6]) },
  resp: { id: U.resp, email: emailOf(NOMES[7]) }, hugo: { id: U.hugo, email: emailOf(NOMES[8]) },
  p3: { id: U.p3, email: emailOf(NOMES[3]) }, p5: { id: U.p5, email: emailOf(NOMES[5]) }, p4: { id: U.p4, email: emailOf(NOMES[4]) }, p9: { id: U.p9, email: emailOf(NOMES[9]) },
  semcadastro: { id: U.semcadastro, email: "pessoa.externa@msbbrasil.com" },
});
(globalThis as any).__ADMIN = fake;
const acoes = await import(pathToFileURL(`${PF}/api/_lib/desenvolvimentoAcoes.ts`).href);
const handler = (await import(pathToFileURL(`${PF}/api/desenvolvimento.ts`).href)).default;

type R = { c: number; b: any };
const resposta = (): any => ({ c: 0, b: null, status(c: number) { this.c = c; return this; }, json(b: unknown) { this.b = b; } });
async function chamar(tok: string, acao: string, body: Record<string, unknown> = {}): Promise<R> {
  const res = resposta();
  const req = { headers: tok ? { authorization: `Bearer ${tok}` } : {}, body };
  if (acoes.ehAcaoDePresencaQr(acao)) await acoes.executarPresencaQr(acao, req, res);
  else await acoes.executarAcao(acao, req, res);
  return res;
}
async function sessao(tok: string): Promise<R> {
  const res = resposta();
  await handler({ method: "POST", query: { acao: "sessao" }, headers: { authorization: `Bearer ${tok}` }, body: {} }, res);
  return res;
}
const espera = async (tok: string, acao: string, body: Record<string, unknown>, st: number) => {
  const r = await chamar(tok, acao, body);
  if (r.c !== st) throw new Error(`${tok} → ${acao}: esperado ${st}, veio ${r.c}: ${JSON.stringify(r.b)}`);
  return r.b?.dados;
};
/** A sessão só conclui com os ausentes justificados e encaminhados (reposição ou dispensa): o teste encaminha quem ainda não tem encaminhamento. */
const encaminharAusentes = async (tid: number) => {
  for (const p of await q(`select id from public.peopleflow_dev_participantes where treinamento_id=${tid} and presenca_status='ausente' and removido_em is null and ausencia_encaminhamento is null`))
    await espera("rh", "ausencia_encaminhar", { participante_id: p.id, justificativa: "Ausência justificada no teste", encaminhamento: "reposicao" }, 200);
};
const part = async (tid: number, cid: number) => (await q(`select * from public.peopleflow_dev_participantes where treinamento_id=${tid} and colaborador_id=${cid}`))[0];

// ════════════════════════════════════════════════════════════════════════
// Migration da habilitação (banco): réplica PGlite com as migrations REAIS e o código REAL do servidor.
// A migration NÃO é aplicada em produção por este teste.
// ════════════════════════════════════════════════════════════════════════
const MIG = SQL("desenvolvimento_habilitacao_responsaveis.sql");
const ROLLBACK = SQL("desenvolvimento_habilitacao_responsaveis_rollback.sql");
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = diaSP.format(new Date());
const jsonDe = (x: unknown) => JSON.stringify(x);
const como = async (uid: string, sql: string) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await q(sql); } finally { await db.exec("reset role;"); } };
const falha = async (sql: string): Promise<string | null> => { try { await db.exec(sql); return null; } catch (e) { return (e as Error).message; } };
const aplicar = async (sql: string) => { try { await db.exec(sql); } catch (e) { await db.exec("rollback;").catch(() => undefined); throw e; } };
const HAB = "public.peopleflow_dev_responsaveis_gestao";

console.log("Preparação: dados no modelo ANTERIOR à migration (habilitações gravadas como o código antigo gravava: só `ativo`)");
let TA = 0, TB = 0, TC = 0, TD = 0, TE = 0;
const NOME_T = () => ({ [TA]: "A", [TB]: "B", [TC]: "C", [TD]: "D", [TE]: "E" } as Record<number, string>);
const salvarT = async (tok: string, titulo: string, extra: Record<string, unknown>) => (await espera(tok, "treinamento_salvar", { tipo: "desenvolvimento", modalidade: "interno", titulo, data_inicio: hojeSP, ...extra }, 200)).id as number;
await t("Dados anteriores: habilitações antigas (ativa e revogada), treinamentos de gestão, de instrutor e de outra área", async () => {
  // o que o código anterior gravava: linha com gestão e colaborador; revogar = ativo false + dados da revogação
  await db.exec(`insert into ${HAB} (gestor_colaborador_id, colaborador_id) values (1,2),(1,6),(2,8),(2,9)`);
  await db.exec(`update ${HAB} set ativo=false, revogado_em=now(), revogado_motivo='Mudou de função' where colaborador_id=9`);
  for (const tok of ["rh", "ge", "gil"]) await sessao(tok);
  const h = await sessao("hugo");
  if (h.c !== 200 || h.b.perfil !== "Responsavel") throw new Error("Hugo (habilitação antiga ativa) abre como Responsavel: " + jsonDe(h.b));
  TA = await salvarT("hugo", "Treinamento A", { responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 });
  TB = await salvarT("ge", "Treinamento B", { responsavel_colaborador_id: 2, instrutor_colaborador_id: 8 });
  TC = await salvarT("ge", "Treinamento C", { responsavel_colaborador_id: 2 });
  TD = await salvarT("gil", "Treinamento D", { responsavel_colaborador_id: 6, instrutor_colaborador_id: 2 });
  await espera("hugo", "participantes_adicionar", { treinamento_id: TA, colaborador_ids: [3] }, 200);
  await espera("ge", "participantes_adicionar", { treinamento_id: TB, colaborador_ids: [5] }, 200);
  await espera("ge", "participantes_adicionar", { treinamento_id: TC, colaborador_ids: [3] }, 200);
  await espera("gil", "participantes_adicionar", { treinamento_id: TD, colaborador_ids: [4] }, 200);
  // E: treinamento de OUTRA área (registrado pelo RH) com um liderado do Gil na turma — material da turma e comprovante individual do liderado
  TE = await salvarT("rh", "Treinamento E", { responsavel_colaborador_id: 1 });
  await espera("rh", "participantes_adicionar", { treinamento_id: TE, colaborador_ids: [4] }, 200);
  await db.exec(`insert into public.peopleflow_dev_evidencias (treinamento_id, tipo, storage_path, file_name) values (${TE}, 'material', 'zz/e-turma', 'material-da-turma-e.pdf')`);
  await db.exec(`insert into public.peopleflow_dev_evidencias (treinamento_id, participante_id, tipo, storage_path, file_name) select ${TE}, id, 'comprovante', 'zz/e-individual', 'comprovante-individual-e.pdf' from public.peopleflow_dev_participantes where treinamento_id=${TE} and colaborador_id=4`);
  for (const [tid, nome] of [[TA, "a"], [TB, "b"], [TD, "d"]] as const) await db.exec(`insert into public.peopleflow_dev_evidencias (treinamento_id, tipo, storage_path, file_name) values (${tid}, 'material', 'zz/${nome}', 'apostila-${nome}.pdf')`);
  await db.exec(`insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria,prioridade) values (3,'gestor','Montagem','x','validada',now(),'tecnica','alta')`);
  const necId = (await q("select id from public.peopleflow_dev_necessidades limit 1"))[0].id;
  for (const tid of [TA, TD]) await db.exec(`insert into public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id, situacao) values (${tid}, ${necId}, 'validada')`);
});

const TABELAS = ["peopleflow_dev_treinamentos", "peopleflow_dev_participantes", "peopleflow_dev_evidencias", "peopleflow_dev_auditoria", "peopleflow_dev_necessidades", "peopleflow_dev_contas", "peopleflow_dev_escopo", "peopleflow_dev_treinamento_necessidades", "peopleflow_dev_qr_tokens", "peopleflow_dev_avaliacoes_reacao", "peopleflow_dev_reacao_respostas"];
const foto = async () => {
  const f: Record<string, string> = {};
  // (as colunas novas de participantes são excluídas da comparação: o que importa é que as ORIGINAIS não mudem)
  const NOVAS = "'ausencia_justificativa','ausencia_encaminhamento','reposicao_prevista_em','ausencia_atualizada_em','ausencia_atualizada_por','dispensado_em','dispensado_por','dispensa_justificativa'";
  for (const tb of TABELAS) { const r = (await q(`select count(*)::int n, md5(coalesce(string_agg((to_jsonb(x) - array[${NOVAS}])::text, '|' order by (to_jsonb(x) - array[${NOVAS}])::text), '')) h from public.${tb} x`))[0]; f[tb] = `${r.n}:${r.h}`; }
  f.habilitacoes_legado = (await q(`select count(*)::int n, md5(coalesce(string_agg(concat_ws('~', id, gestor_colaborador_id, colaborador_id, ativo, indicado_em, indicado_por, revogado_em, revogado_por, revogado_motivo), '|' order by id), '')) h from ${HAB}`)).map((r) => `${r.n}:${r.h}`)[0];
  return f;
};
const estrutura = async () => ({
  funcoes: (await q(`select p.proname, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'peopleflow_dev_%' order by 1`)).map((r) => `${r.proname}:${r.d}`),
  politicas: (await q(`select tablename, policyname, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) d from pg_policies where schemaname = 'public' order by 1, 2`)).map((r) => `${r.tablename}.${r.policyname}:${r.d}`),
  colunas: (await q(`select table_name || '.' || column_name c from information_schema.columns where table_schema = 'public' and table_name in ('peopleflow_dev_responsaveis_gestao', 'peopleflow_dev_participantes') order by 1`)).map((r) => r.c),
  checks: (await q(`select conrelid::regclass::text || ' ' || pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('${HAB}'::regclass, 'public.peopleflow_dev_participantes'::regclass) and contype = 'c' order by 1`)).map((r) => r.d),
  indices: (await q(`select indexdef from pg_indexes where schemaname = 'public' and tablename in ('peopleflow_dev_responsaveis_gestao', 'peopleflow_dev_participantes') order by 1`)).map((r) => r.indexdef),
  tabelas: (await q(`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'peopleflow_dev_%' order by 1`)).map((r) => r.table_name),
});
const matriz = async () => {
  const nome = NOME_T();
  const r: Record<string, Record<string, string>> = {};
  const letras = async (uid: string, sql: string) => (await como(uid, sql)).map((x) => nome[Number(x.treinamento_id)]).sort().join("");
  for (const [quem, uid] of Object.entries({ rh: U.rh, ge: U.ge, hugo: U.hugo, gil: U.gil })) {
    r[quem] = {
      treinamentos: await letras(uid, "select id as treinamento_id from public.peopleflow_dev_treinamentos"),
      evidencias: await letras(uid, "select distinct treinamento_id from public.peopleflow_dev_evidencias where participante_id is null"), // da TURMA (lista, ata, materiais)
      individuais: await letras(uid, "select distinct treinamento_id from public.peopleflow_dev_evidencias where participante_id is not null"),
      turma: await letras(uid, "select distinct treinamento_id from public.peopleflow_dev_participantes"),
      vinculos: await letras(uid, "select distinct treinamento_id from public.peopleflow_dev_treinamento_necessidades"),
    };
  }
  return r;
};

const antesFoto = await foto();
const antesEstrutura = await estrutura();
const matrizAntes = await matriz();
console.log("  matriz ANTES  :", jsonDe(matrizAntes));

console.log("Backup lógico (antes da migration)");
await t("Backup: cópia de TODAS as tabelas do módulo no schema isolado (mesmas linhas e hash), definições anteriores registradas, nada alterado em public, schema inacessível ao navegador, e recusa-se a sobrescrever", async () => {
  const f0 = jsonDe(await foto()), e0 = jsonDe(await estrutura());
  const r = await db.exec(SQL("desenvolvimento_habilitacao_responsaveis_backup.sql"));
  if (jsonDe(await foto()) !== f0 || jsonDe(await estrutura()) !== e0) throw new Error("o backup não pode alterar nada em public");
  const resumo = await q("select tabela, linhas::int n, hash_md5 from backup_pre_habilitacao.resumo order by tabela");
  const publicas = (await q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name like 'peopleflow\_dev\_%' order by 1")).map((x) => x.table_name);
  if (jsonDe(resumo.map((x) => x.tabela)) !== jsonDe(publicas) || publicas.length < 15) throw new Error("todas as tabelas peopleflow_dev_* copiadas: " + jsonDe({ publicas, copiadas: resumo.map((x) => x.tabela) }));
  for (const x of resumo) {
    const vivo = (await q(`select count(*)::int n, md5(coalesce(string_agg(to_jsonb(y)::text, '|' order by to_jsonb(y)::text), '')) h from public.${x.tabela} y`))[0];
    const copia = (await q(`select count(*)::int n from backup_pre_habilitacao.${x.tabela}`))[0].n;
    if (vivo.n !== x.n || vivo.h !== x.hash_md5 || copia !== x.n) throw new Error("cópia diferente da origem: " + x.tabela);
  }
  const def = await q("select tipo, objeto, definicao from backup_pre_habilitacao.definicoes");
  if (!def.some((d) => d.tipo === "função" && d.objeto.startsWith("peopleflow_dev_gere_treinamento") && !d.definicao.includes("habilitado_agora")) || !def.some((d) => d.tipo === "política" && d.objeto === "peopleflow_dev_evidencias.dev_evidencias_leitura" && !d.definicao.includes("gere_treinamento"))) throw new Error("definições anteriores registradas");
  if ((r[r.length - 1].rows as unknown[]).length < 15) throw new Error("a conferência final lista as tabelas");
  // o navegador (authenticated) não enxerga o schema
  await db.exec("set role authenticated");
  try { await q("select count(*) from backup_pre_habilitacao.resumo"); throw new Error("authenticated leu o backup"); } catch (e) { if ((e as Error).message === "authenticated leu o backup") throw e; } finally { await db.exec("reset role"); }
  // não sobrescreve
  try { await db.exec(SQL("desenvolvimento_habilitacao_responsaveis_backup.sql")); throw new Error("sobrescreveu"); } catch (e) { await db.exec("rollback"); if ((e as Error).message === "sobrescreveu") throw e; }
  if ((await q("select count(*)::int n from backup_pre_habilitacao.resumo"))[0].n !== resumo.length) throw new Error("backup preservado após a recusa");
});

console.log("Migration: aplicação, dados preservados e impacto nas permissões");
await t("A pré-checagem (somente leitura) roda no banco ANTES da migration e mostra o ponto de partida: 4 habilitações antigas, 3 ativas e 1 revogada, nenhuma duplicada", async () => {
  const r = await db.exec(SQL("desenvolvimento_habilitacao_responsaveis_prechecagem.sql"));
  if (r.length !== 1) throw new Error("a pré-checagem é UMA consulta só (o SQL Editor mostra uma por vez)");
  const linhas = r[0].rows as { verificacao: string; resultado: string; situacao: string }[];
  const de = (parte: string) => linhas.find((l) => l.verificacao.startsWith(parte));
  if (de("Habilitações hoje")?.resultado !== "4 / 3 / 1" || de("Colaboradores com mais de uma")?.resultado !== "0") throw new Error("ponto de partida: " + jsonDe(linhas));
  if (linhas.some((l) => l.situacao === "BLOQUEIA")) throw new Error("nada deveria bloquear neste banco: " + jsonDe(linhas.filter((l) => l.situacao === "BLOQUEIA")));
  if (de("Função de leitura atual")?.resultado !== "fase 5c" || de("Política de leitura de evidências")?.resultado !== "fase 1") throw new Error("estado-base: " + jsonDe(linhas.filter((l) => l.verificacao.startsWith("Função") || l.verificacao.startsWith("Política"))));
});
await t("Aplicar a migration NÃO altera nenhum dado existente (treinamentos, participantes, evidências, auditoria, necessidades, contas, escopo, QR, avaliações) e converte as habilitações antigas", async () => {
  await aplicar(MIG);
  const depois = await foto();
  if (jsonDe(depois) !== jsonDe(antesFoto)) throw new Error("dados alterados: " + jsonDe({ antes: antesFoto, depois }));
  const rg = await q(`select colaborador_id, ativo, situacao, habilitado_em is not null as com_data from ${HAB} order by colaborador_id`);
  if (jsonDe(rg.map((r) => [Number(r.colaborador_id), r.ativo, r.situacao, r.com_data])) !== jsonDe([[2, true, "habilitada", true], [6, true, "habilitada", true], [8, true, "habilitada", true], [9, false, "revogada", true]])) throw new Error("conversão: " + jsonDe(rg));
  const novas = await q("select count(*)::int n from public.peopleflow_dev_participantes where ausencia_justificativa is not null or ausencia_encaminhamento is not null or reposicao_prevista_em is not null or dispensado_em is not null");
  if (novas[0].n !== 0) throw new Error("as colunas novas nascem vazias para todos os registros existentes");
});
await t("Idempotente: aplicar de novo não altera dados nem estrutura", async () => {
  const a = jsonDe(await estrutura()), f = jsonDe(await foto());
  await aplicar(MIG);
  if (jsonDe(await estrutura()) !== a || jsonDe(await foto()) !== f) throw new Error("a segunda aplicação mudou algo");
});
await t("Pré-checagem e validação (somente leitura): rodam sem alterar nada e a validação devolve ok = true em TODAS as linhas", async () => {
  const antes = jsonDe(await foto());
  const pre = await db.exec(SQL("desenvolvimento_habilitacao_responsaveis_prechecagem.sql"));
  if (pre.length !== 1 || (pre[0].rows as { situacao: string }[]).length < 20) throw new Error("a pré-checagem devolve os resultados esperados");
  // depois da migration a pré-checagem reconhece o novo estado (e não bloqueia)
  const prel = pre[0].rows as { verificacao: string; resultado: string; situacao: string }[];
  if (prel.find((l) => l.verificacao.startsWith("Função de leitura atual"))?.resultado !== "já é a nova" || prel.some((l) => l.situacao === "BLOQUEIA")) throw new Error("pré-checagem após a migration: " + jsonDe(prel.slice(0, 8)));
  const val = await db.exec(SQL("desenvolvimento_habilitacao_responsaveis_validacao.sql"));
  if (val.length !== 1) throw new Error("a validação é UMA consulta só (o SQL Editor mostra uma por vez)");
  const linhas = (val[0].rows as { tipo: string; verificacao: string; ok: boolean }[]).filter((l) => l.tipo === "verificação");
  if (linhas.length < 9 || linhas.some((l) => l.ok !== true)) throw new Error("validação: " + jsonDe(linhas.filter((l) => l.ok !== true)));
  if (jsonDe(await foto()) !== antes) throw new Error("as consultas de conferência não podem alterar nada");
});
const matrizDepois = await matriz();
console.log("  matriz DEPOIS :", jsonDe(matrizDepois));
const ESPERADO_ANTES = {
  rh: { treinamentos: "ABCDE", evidencias: "ABDE", individuais: "E", turma: "ABCDE", vinculos: "AD" },
  ge: { treinamentos: "ABCD", evidencias: "ABD", individuais: "", turma: "ABCD", vinculos: "AD" },
  hugo: { treinamentos: "ABC", evidencias: "AB", individuais: "", turma: "ABC", vinculos: "" },
  gil: { treinamentos: "DE", evidencias: "DE", individuais: "E", turma: "DE", vinculos: "D" }, // E: vê o treinamento de outra área, o material da turma e o comprovante do liderado
};
const ESPERADO_DEPOIS = {
  rh: { treinamentos: "ABCDE", evidencias: "ABDE", individuais: "E", turma: "ABCDE", vinculos: "AD" }, // igual
  ge: { treinamentos: "ABCD", evidencias: "ABD", individuais: "", turma: "ABCD", vinculos: "AD" }, // Gestor: acompanhamento da área, igual
  hugo: { treinamentos: "AB", evidencias: "AB", individuais: "", turma: "AB", vinculos: "" }, // Responsável habilitado: só o que administra (responsável ou instrutor); perde C (gestão alheia)
  gil: { treinamentos: "DE", evidencias: "D", individuais: "E", turma: "DE", vinculos: "D" }, // Gestor de OUTRA área (E): segue vendo o treinamento e o comprovante do liderado; o material da TURMA deixa de ser lido (mudança intencional: política dev_evidencias_leitura)
};
await t("Impacto nas permissões de LEITURA (matriz real, antes × depois): RH e Gestor sem perda — exceto o material da TURMA de treinamento de OUTRA área, que o Gestor deixa de ler (intencional); Responsável só vê o que administra — enquanto habilitado", async () => {
  if (jsonDe(matrizAntes) !== jsonDe(ESPERADO_ANTES)) throw new Error("comportamento anterior diferente do documentado: " + jsonDe(matrizAntes));
  if (jsonDe(matrizDepois) !== jsonDe(ESPERADO_DEPOIS)) throw new Error("comportamento novo diferente do esperado: " + jsonDe(matrizDepois));
});
await t("O instrutor sem habilitação (perfil Responsavel sem habilitação ativa) não lê nada, nem o que ensina; o código antigo da sessão segue válido", async () => {
  // Fabio é instrutor de A mas NÃO é habilitado: sem habilitação não há leitura administrativa
  await db.exec(`insert into public.peopleflow_dev_contas values ('${U.resp}', 7, 'Responsavel', now()) on conflict (user_id) do update set atualizado_em = now()`);
  for (const sql of ["select count(*)::int n from public.peopleflow_dev_treinamentos", "select count(*)::int n from public.peopleflow_dev_participantes", "select count(*)::int n from public.peopleflow_dev_evidencias"])
    if ((await como(U.resp, sql))[0].n !== 0) throw new Error("instrutor sem habilitação leu: " + sql);
  await db.exec(`delete from public.peopleflow_dev_contas where user_id='${U.resp}'`);
});

console.log("Reversão");
await t("Reversão devolve função, políticas, colunas, índices e constraints EXATAMENTE ao estado anterior e preserva as habilitações (inclusive a revogada); depois reaplica", async () => {
  const comMigration = jsonDe(await estrutura());
  await aplicar(ROLLBACK);
  const e = await estrutura();
  const a = antesEstrutura;
  if (jsonDe(e.funcoes) !== jsonDe(a.funcoes)) throw new Error("funções diferentes após a reversão: " + jsonDe(e.funcoes.filter((x) => !a.funcoes.includes(x))));
  if (jsonDe(e.politicas) !== jsonDe(a.politicas)) throw new Error("políticas diferentes após a reversão");
  if (jsonDe(e.colunas) !== jsonDe(a.colunas) || jsonDe(e.checks) !== jsonDe(a.checks) || jsonDe(e.indices) !== jsonDe(a.indices) || jsonDe(e.tabelas) !== jsonDe(a.tabelas)) throw new Error("estrutura diferente após a reversão: " + jsonDe({ e, a }));
  if (jsonDe(await foto()) !== jsonDe(antesFoto)) throw new Error("dados alterados pela reversão");
  if (jsonDe(await matriz()) !== jsonDe(matrizAntes)) throw new Error("a matriz de leitura deveria voltar ao comportamento anterior");
  await aplicar(ROLLBACK); // repetível
  await aplicar(MIG);
  if (jsonDe(await estrutura()) !== comMigration) throw new Error("reaplicar não reproduz o estado com a migration");
  if (jsonDe(await matriz()) !== jsonDe(matrizDepois)) throw new Error("matriz após reaplicar");
});
await t("Reversão é RECUSADA (sem alterar nada) quando já existe ausência com encaminhamento registrado", async () => {
  const p = (await part(TA, 3)).id;
  await db.exec(`update public.peopleflow_dev_participantes set presenca_status='ausente', presenca_metodo='manual', presenca_em=now(), presenca_motivo='x', ausencia_justificativa='Férias', ausencia_encaminhamento='reposicao' where id=${p}`);
  const antes = jsonDe(await estrutura());
  const msg = await falha(ROLLBACK);
  await db.exec("rollback;").catch(() => undefined);
  if (!msg || !/Reversão bloqueada.*ausências/.test(msg)) throw new Error("deveria recusar: " + msg);
  if (jsonDe(await estrutura()) !== antes) throw new Error("a recusa não pode alterar nada");
  await db.exec(`update public.peopleflow_dev_participantes set presenca_status='pendente', presenca_metodo=null, presenca_em=null, presenca_motivo=null, ausencia_justificativa=null, ausencia_encaminhamento=null where id=${p}`);
});
await t("Reversão é RECUSADA (sem alterar nada) quando já existe transferência de responsabilidade", async () => {
  await db.exec(`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 8, 2, 'revogacao', 'Teste de rastreabilidade', 'planejado')`);
  const antes = jsonDe(await estrutura());
  const msg = await falha(ROLLBACK);
  await db.exec("rollback;").catch(() => undefined);
  if (!msg || !/Reversão bloqueada.*transferências/.test(msg)) throw new Error("deveria recusar: " + msg);
  if (jsonDe(await estrutura()) !== antes) throw new Error("a recusa não pode alterar nada");
});

console.log("Habilitações: situação, transições e rastreabilidade");
await t("Código ANTERIOR continua funcionando com a migration aplicada: indicar (habilitada na hora, ativo, com data) e revogar (ativo=false + motivo → 'revogada'); uma habilitação ativa por colaborador", async () => {
  await db.exec(`insert into ${HAB} (gestor_colaborador_id, colaborador_id, indicado_por) values (2, 9, '${U.ge}')`);
  const novo = (await q(`select id, ativo, situacao, habilitado_em is not null as com_data, habilitado_por from ${HAB} where colaborador_id=9 and ativo`))[0];
  if (!novo.ativo || novo.situacao !== "habilitada" || !novo.com_data || novo.habilitado_por !== U.ge) throw new Error(jsonDe(novo));
  if (!/duplicate|unique/i.test((await falha(`insert into ${HAB} (gestor_colaborador_id, colaborador_id) values (6, 9)`)) ?? "")) throw new Error("uma habilitação ativa por colaborador");
  if (!/check|violates/i.test((await falha(`update ${HAB} set ativo=false where id=${novo.id}`)) ?? "")) throw new Error("revogar sem motivo deve falhar");
  await db.exec(`update ${HAB} set ativo=false, revogado_em=now(), revogado_motivo='Fim da função' where id=${novo.id}`);
  const rev = (await q(`select ativo, situacao, revogado_motivo from ${HAB} where id=${novo.id}`))[0];
  if (rev.ativo || rev.situacao !== "revogada" || rev.revogado_motivo !== "Fim da função") throw new Error(jsonDe(rev));
});
await t("Fluxo novo: habilitada → revogada com motivo; identidade e data imutáveis; revogada é histórico; sem 'indicada'/'recusada'; sem exclusão; revogada permite nova habilitação (novo registro)", async () => {
  await db.exec(`insert into ${HAB} (gestor_colaborador_id, colaborador_id, situacao, departamento, referencia, habilitado_por) values (6, 4, 'habilitada', 'Logística', 'E-mail do Gil, 20/10', '${U.rh}')`);
  const h = (await q(`select id, ativo, situacao, habilitado_em is not null as com_data, referencia from ${HAB} where colaborador_id=4`))[0];
  if (!h.ativo || h.situacao !== "habilitada" || !h.com_data || h.referencia !== "E-mail do Gil, 20/10") throw new Error(jsonDe(h));
  for (const [sql, rx] of [
    [`update ${HAB} set colaborador_id=5 where id=${h.id}`, /identidade/],
    [`update ${HAB} set gestor_colaborador_id=2 where id=${h.id}`, /identidade/],
    [`update ${HAB} set habilitado_em=now() - interval '1 day' where id=${h.id}`, /identidade/],
    [`update ${HAB} set habilitado_por='${U.ge}' where id=${h.id}`, /identidade/],
    [`update ${HAB} set situacao='indicada' where id=${h.id}`, /check|Transição/i],
    [`insert into ${HAB} (gestor_colaborador_id, colaborador_id, situacao) values (2, 5, 'indicada')`, /check/i],
    [`insert into ${HAB} (gestor_colaborador_id, colaborador_id, situacao) values (2, 5, 'recusada')`, /check/i],
    [`insert into ${HAB} (gestor_colaborador_id, colaborador_id, situacao) values (2, 2, 'habilitada')`, /check/i],
    [`delete from ${HAB} where id=${h.id}`, /imut|exclus|Desenvolvimento/i],
  ] as [string, RegExp][]) { const m = await falha(sql); if (!m || !rx.test(m)) throw new Error(`deveria recusar (${rx}): ${sql} → ${m}`); }
  if (!/revogada_chk|check/i.test((await falha(`update ${HAB} set situacao='revogada', revogado_em=now() where id=${h.id}`)) ?? "")) throw new Error("revogação sem motivo deveria falhar");
  await db.exec(`update ${HAB} set situacao='revogada', revogado_em=now(), revogado_por='${U.rh}', revogado_motivo='Mudou de área' where id=${h.id}`);
  if (!/histórico/.test((await falha(`update ${HAB} set revogado_motivo='reescrito' where id=${h.id}`)) ?? "")) throw new Error("revogada é histórico");
  if (!/Transição|histórico/.test((await falha(`update ${HAB} set situacao='habilitada' where id=${h.id}`)) ?? "")) throw new Error("revogada não volta");
  await db.exec(`insert into ${HAB} (gestor_colaborador_id, colaborador_id, situacao) values (2, 4, 'habilitada')`); // nova habilitação = novo registro
  if ((await q(`select count(*)::int n from ${HAB} where colaborador_id=4`))[0].n !== 2) throw new Error("o histórico da revogada permanece");
});

console.log("Leitura após a revogação");
await t("Revogar a habilitação encerra NA HORA a visão administrativa do Responsável; o RH continua vendo tudo; o treinamento e a revogação ficam registrados", async () => {
  const hugoId = Number((await q(`select id from ${HAB} where colaborador_id=8 and ativo`))[0].id);
  await db.exec(`update ${HAB} set ativo=false, revogado_em=now(), revogado_por='${U.rh}', revogado_motivo='Mudança de responsabilidade' where id=${hugoId}`);
  const nome = NOME_T();
  const ver = async (sql: string) => (await como(U.hugo, sql)).map((x) => nome[Number(x.treinamento_id)]).sort().join("");
  const r = { treinamentos: await ver("select id as treinamento_id from public.peopleflow_dev_treinamentos"), evidencias: await ver("select distinct treinamento_id from public.peopleflow_dev_evidencias"), turma: await ver("select distinct treinamento_id from public.peopleflow_dev_participantes") };
  if (jsonDe(r) !== jsonDe({ treinamentos: "", evidencias: "", turma: "" })) throw new Error("após revogar: " + jsonDe(r));
  const rh = await como(U.rh, "select count(*)::int n from public.peopleflow_dev_treinamentos where id in (" + [TA, TB, TC, TD].join(",") + ")");
  if (rh[0].n !== 4) throw new Error("o RH continua vendo tudo");
  const tr = (await q(`select responsavel_colaborador_id, solicitado_por_colaborador_id from public.peopleflow_dev_treinamentos where id=${TA}`))[0];
  if (Number(tr.responsavel_colaborador_id) !== 8 || Number(tr.solicitado_por_colaborador_id) !== 8) throw new Error("o treinamento mantém responsável e quem registrou (histórico)");
});

console.log("Ausências (colunas novas)");
await t("Justificativa/encaminhamento/dispensa: valores válidos; dispensa exige data e justificativa; data de reposição só com reposição; não alteram a presença", async () => {
  const p = (await part(TC, 3)).id;
  await db.exec(`update public.peopleflow_dev_participantes set presenca_status='ausente', presenca_metodo='manual', presenca_em=now(), presenca_motivo='x' where id=${p}`);
  const ok = async (set: string) => db.exec(`update public.peopleflow_dev_participantes set ${set} where id=${p}`);
  await ok("ausencia_justificativa='Afastamento', ausencia_encaminhamento='reposicao', reposicao_prevista_em=current_date + 10");
  for (const sql of [
    "ausencia_encaminhamento='qualquer'",
    "ausencia_encaminhamento='dispensa'", // sem data nem justificativa da dispensa
    "ausencia_encaminhamento='dispensa', dispensado_em=now()", // sem justificativa
    "ausencia_encaminhamento='dispensa', dispensa_justificativa='x', reposicao_prevista_em=current_date + 1", // dispensa com data de reposição
    "ausencia_encaminhamento=null, reposicao_prevista_em=current_date + 1", // data sem reposição
  ]) if (!/check|violates/i.test((await falha(`update public.peopleflow_dev_participantes set ${sql} where id=${p}`)) ?? "")) throw new Error("deveria recusar: " + sql);
  await ok("ausencia_encaminhamento='dispensa', reposicao_prevista_em=null, dispensado_em=now(), dispensado_por='" + U.rh + "', dispensa_justificativa='Função alterada'");
  const r = (await q(`select presenca_status, presenca_motivo, ausencia_encaminhamento from public.peopleflow_dev_participantes where id=${p}`))[0];
  if (r.presenca_status !== "ausente" || r.presenca_motivo !== "x" || r.ausencia_encaminhamento !== "dispensa") throw new Error("a presença original não é descaracterizada: " + jsonDe(r));
});

console.log("Transferências de responsabilidade");
await t("Transferências: só o RH lê; o navegador não grava; imutáveis; motivo obrigatório; tipo válido; origem ≠ destino", async () => {
  if ((await como(U.rh, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n !== 1) throw new Error("RH lê as transferências");
  for (const uid of [U.ge, U.hugo, U.gil]) if ((await como(uid, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n !== 0) throw new Error("só o RH lê as transferências");
  const nega = async (sql: string) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U.rh}',false);`); try { return await falha(sql); } finally { await db.exec("reset role;"); } };
  if (!/permission denied/i.test((await nega(`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 2, 'outro', 'x', 'planejado')`)) ?? "")) throw new Error("nem o RH grava pelo navegador");
  if (await falha(`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 8, 2, 'desligamento', 'Saiu da empresa', 'planejado')`)) throw new Error("o servidor grava a transferência");
  for (const [sql, rx] of [
    [`update public.peopleflow_dev_transferencias_responsabilidade set motivo='reescrito'`, /imutável/],
    [`delete from public.peopleflow_dev_transferencias_responsabilidade`, /imut|exclus|Desenvolvimento/i],
    [`truncate public.peopleflow_dev_transferencias_responsabilidade`, /imut|exclus|Desenvolvimento/i],
    [`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 2, 'outro', '   ', 'planejado')`, /check/i],
    [`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 2, 'qualquer', 'x', 'planejado')`, /check/i],
    [`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 2, 2, 'outro', 'x', 'planejado')`, /check/i],
    [`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (99999, 2, 'outro', 'x', 'planejado')`, /foreign key|violates/i],
  ] as [string, RegExp][]) { const m = await falha(sql); if (!m || !rx.test(m)) throw new Error(`deveria recusar (${rx}): ${sql.slice(0, 70)} → ${m}`); }
});

console.log("Segurança de acesso ao banco");
await t("Permissões: anon sem acesso a nada novo; authenticated só lê (políticas); funções novas executáveis só por authenticated/service_role; habilitações só do servidor", async () => {
  const priv = async (role: string, obj: string, p: string) => (await q(`select has_table_privilege('${role}', '${obj}', '${p}') as v`))[0].v as boolean;
  for (const tb of ["public.peopleflow_dev_transferencias_responsabilidade", HAB]) {
    for (const p of ["select", "insert", "update", "delete"]) if (await priv("anon", tb, p)) throw new Error(`anon ${p} ${tb}`);
    for (const p of ["insert", "update", "delete"]) if (await priv("authenticated", tb, p)) throw new Error(`authenticated ${p} ${tb}`);
  }
  if (await priv("authenticated", HAB, "select")) throw new Error("habilitações: só o servidor lê");
  if (!(await priv("authenticated", "public.peopleflow_dev_transferencias_responsabilidade", "select"))) throw new Error("RH lê as transferências via política");
  for (const f of ["peopleflow_dev_habilitado_agora()", "peopleflow_dev_gere_treinamento(bigint)"]) {
    const x = (await q(`select has_function_privilege('anon', 'public.${f}', 'execute') a, has_function_privilege('authenticated', 'public.${f}', 'execute') b, has_function_privilege('service_role', 'public.${f}', 'execute') c`))[0];
    if (x.a || !x.b || !x.c) throw new Error(`execução de ${f}: ${jsonDe(x)}`);
  }
  if ((await q(`select count(*)::int n from pg_policies where schemaname='public' and tablename='peopleflow_dev_responsaveis_gestao'`))[0].n !== 0) throw new Error("habilitações sem política para o navegador");
  const sem = await falha(`set role anon; select count(*) from public.peopleflow_dev_transferencias_responsabilidade;`);
  await db.exec("reset role;");
  if (!/permission denied/i.test(sem ?? "")) throw new Error("anon não lê transferências");
});

console.log("Migration da solicitação de habilitação + leitura do Gestor pela área (banco)");
const MIG2 = SQL("desenvolvimento_solicitacao_habilitacao.sql");
const ROLLBACK2 = SQL("desenvolvimento_solicitacao_habilitacao_rollback.sql");
const SOL = "public.peopleflow_dev_habilitacao_solicitacoes";
let TF = 0, TG2 = 0;
let estruturaAntes2 = "", fotoAntes2 = "";
await t("Pré-checagem da migration nova (uma consulta, somente leitura): estado esperado, nada bloqueia; a função de leitura atual é a do modelo de habilitação", async () => {
  // o Hugo (equipe da Bia) precisa estar habilitado para poder ser responsável principal de um treinamento do RH
  if ((await q(`select count(*)::int n from ${HAB} where colaborador_id=8 and ativo`))[0].n === 0) await db.exec(`insert into ${HAB} (gestor_colaborador_id, colaborador_id, indicado_por) values (2, 8, '${U.ge}')`);
  // treinamentos registrados pelo RH: F tem o responsável principal na equipe da Bia; G, na equipe do Gil
  TF = await salvarT("rh", "Treinamento F", { responsavel_colaborador_id: 8 }); // Hugo (habilitado, equipe da Bia)
  TG2 = await salvarT("rh", "Treinamento G", { responsavel_colaborador_id: 6 });
  estruturaAntes2 = jsonDe(await estrutura());
  fotoAntes2 = jsonDe(await foto());
  const r = await db.exec(SQL("desenvolvimento_solicitacao_habilitacao_prechecagem.sql"));
  if (r.length !== 1) throw new Error("UMA consulta só");
  const linhas = r[0].rows as { verificacao: string; resultado: string; situacao: string }[];
  if (linhas.some((l) => l.situacao === "BLOQUEIA")) throw new Error("nada deveria bloquear: " + jsonDe(linhas.filter((l) => l.situacao === "BLOQUEIA")));
  const f = linhas.find((l) => l.verificacao.startsWith("Função de leitura atual"));
  const s = linhas.find((l) => l.verificacao.startsWith("Tabela de solicitações"));
  if (f?.resultado !== "modelo de habilitação" || s?.resultado !== "não") throw new Error("ponto de partida: " + jsonDe([f, s]));
  // antes da migration: a Bia NÃO lê o F (nem o G)
  if ((await como(U.ge, `select id from public.peopleflow_dev_treinamentos where id in (${TF}, ${TG2})`)).length !== 0) throw new Error("antes: a Bia não lê o treinamento de responsável da equipe dela registrado pelo RH");
});
await t("Aplicar a migration nova NÃO altera nenhum dado existente; é idempotente; a validação (uma consulta) devolve ok = true em todas as verificações", async () => {
  await aplicar(MIG2);
  if (jsonDe(await foto()) !== fotoAntes2) throw new Error("dados alterados");
  const a = jsonDe(await estrutura()), f = jsonDe(await foto());
  await aplicar(MIG2);
  if (jsonDe(await estrutura()) !== a || jsonDe(await foto()) !== f) throw new Error("a segunda aplicação mudou algo");
  const val = await db.exec(SQL("desenvolvimento_solicitacao_habilitacao_validacao.sql"));
  if (val.length !== 1) throw new Error("UMA consulta só");
  const linhas = (val[0].rows as { tipo: string; verificacao: string; ok: boolean }[]).filter((l) => l.tipo === "verificação");
  if (linhas.length < 7 || linhas.some((l) => l.ok !== true)) throw new Error("validação: " + jsonDe(linhas.filter((l) => l.ok !== true)));
  const pre = (await db.exec(SQL("desenvolvimento_solicitacao_habilitacao_prechecagem.sql")))[0].rows as { verificacao: string; resultado: string; situacao: string }[];
  if (pre.find((l) => l.verificacao.startsWith("Função de leitura atual"))?.resultado !== "já é a nova" || pre.some((l) => l.situacao === "BLOQUEIA")) throw new Error("pré-checagem depois da migration");
});
await t("Leitura do Gestor pela área: a Bia passa a ler o treinamento cujo responsável principal é da equipe dela (mesmo do RH), com a turma; não o do Gil; o Gil lê o dele; RH e Responsável sem mudança", async () => {
  const lerIds = async (uid: string) => (await como(uid, `select id from public.peopleflow_dev_treinamentos where id in (${TF}, ${TG2}) order by id`)).map((x) => Number(x.id));
  if (jsonDe(await lerIds(U.ge)) !== jsonDe([TF]) || jsonDe(await lerIds(U.gil)) !== jsonDe([TG2]) || jsonDe(await lerIds(U.rh)) !== jsonDe([TF, TG2]) || jsonDe(await lerIds(U.hugo)) !== jsonDe([TF])) throw new Error("leitura por papel: " + jsonDe([await lerIds(U.ge), await lerIds(U.gil), await lerIds(U.rh)]));
  await espera("rh", "participantes_adicionar", { treinamento_id: TF, colaborador_ids: [3, 4] }, 200);
  const turma = (await como(U.ge, `select colaborador_id from public.peopleflow_dev_participantes where treinamento_id=${TF} order by 1`)).map((x) => Number(x.colaborador_id)).join();
  if (turma !== "3,4") throw new Error("a gestora da área lê a turma toda do treinamento da área: " + turma);
  if ((await como(U.gil, `select id from public.peopleflow_dev_participantes where treinamento_id=${TF} and colaborador_id=3`)).length !== 0) throw new Error("o Gil não lê a turma da Bia (só o Davi, que é dele)");
});
await t("Reversão devolve função, políticas, colunas, índices e constraints EXATAMENTE ao estado anterior; depois reaplica", async () => {
  const comMigracao = jsonDe(await estrutura());
  await aplicar(ROLLBACK2);
  if (jsonDe(await estrutura()) !== estruturaAntes2) throw new Error("estrutura diferente do estado anterior à migration nova");
  await aplicar(ROLLBACK2); // repetível
  await aplicar(MIG2);
  if (jsonDe(await estrutura()) !== comMigracao) throw new Error("reaplicar devolve a mesma estrutura");
});
await t("Tabela de solicitações: uma pendente por colaborador, consistência da decisão, identidade imutável, sem exclusão; RH lê tudo e o solicitante as próprias; o navegador não grava", async () => {
  await db.exec(`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, departamento, justificativa) values (3, 2, 'Produção', 'Precisa conduzir treinamentos')`);
  const id = Number((await q(`select id from ${SOL} limit 1`))[0].id);
  for (const [sql, rx] of [
    [`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa) values (3, 2, 'duplicada')`, /uidx|unique|duplicate/i],
    [`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa) values (5, 2, '   ')`, /check/i],
    [`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa) values (2, 2, 'a si mesma')`, /check/i],
    [`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa, status) values (5, 2, 'x', 'aprovada')`, /check/i],
    [`update ${SOL} set status='rejeitada', decidido_em=now(), decidido_por='${U.rh}' where id=${id}`, /check/i], // rejeitar exige justificativa
    [`update ${SOL} set justificativa='outra' where id=${id}`, /identidade/i],
    [`update ${SOL} set colaborador_id=5 where id=${id}`, /identidade/i],
    [`update ${SOL} set status='pendente' where id=${id}`, /decidida|decidir/i],
    [`delete from ${SOL} where id=${id}`, /exclus|apag|permitid/i],
    [`truncate ${SOL}`, /exclus|apag|permitid/i],
  ] as [string, RegExp][]) { const m = await falha(sql); await db.exec("rollback;").catch(() => undefined); if (!m || !rx.test(m)) throw new Error(`deveria recusar (${rx}): ${sql.slice(0, 80)} → ${m}`); }
  await db.exec(`update ${SOL} set status='rejeitada', decidido_em=now(), decidido_por='${U.rh}', decisor_colaborador_id=1, decisao_justificativa='Não neste ciclo' where id=${id}`);
  for (const sql of [`update ${SOL} set decisao_justificativa='outra' where id=${id}`, `update ${SOL} set status='aprovada' where id=${id}`]) { const m = await falha(sql); await db.exec("rollback;").catch(() => undefined); if (!m || !/decidida|histórico/i.test(m)) throw new Error("decidida é histórico: " + m); }
  await db.exec(`insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa) values (3, 2, 'novo pedido depois da rejeição')`); // rejeitada libera novo pedido
  const lido = async (uid: string) => (await como(uid, `select id from ${SOL} order by id`)).length;
  if ((await lido(U.rh)) !== 2 || (await lido(U.ge)) !== 2 || (await lido(U.gil)) !== 0 || (await lido(U.hugo)) !== 0) throw new Error("leitura: RH tudo; solicitante as próprias; demais nada");
  const priv = async (role: string, p: string) => (await q(`select has_table_privilege('${role}', '${SOL}', '${p}') as v`))[0].v as boolean;
  for (const p of ["select", "insert", "update", "delete"]) if (await priv("anon", p)) throw new Error("anon " + p);
  for (const p of ["insert", "update", "delete"]) if (await priv("authenticated", p)) throw new Error("authenticated " + p);
  const m = await falha(`set role authenticated; insert into ${SOL} (colaborador_id, solicitante_colaborador_id, justificativa) values (9, 2, 'x');`);
  await db.exec("reset role;");
  if (!/permission denied/i.test(m ?? "")) throw new Error("o navegador não grava: " + m);
});
await t("Reversão da migration nova é RECUSADA (sem alterar nada) quando já existe solicitação registrada", async () => {
  const antes = jsonDe(await estrutura());
  const msg = await falha(ROLLBACK2);
  await db.exec("rollback;").catch(() => undefined);
  if (!msg || !/Reversão bloqueada.*solicitações/.test(msg)) throw new Error("deveria recusar: " + msg);
  if (jsonDe(await estrutura()) !== antes) throw new Error("a recusa não pode alterar nada");
});

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
