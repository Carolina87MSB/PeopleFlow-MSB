// Habilitação de Responsáveis por Treinamentos — Etapa 1 (banco): testes locais (PGlite) da migration PROPOSTA, com a lógica REAL do servidor.
// A migration é a PROPOSTA da Etapa 1 e NÃO é aplicada em produção por este teste. Dados fictícios; nunca toca o Supabase de produção.
//   cd tests && npm run test:treinamentos-habilitacao
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
const part = async (tid: number, cid: number) => (await q(`select * from public.peopleflow_dev_participantes where treinamento_id=${tid} and colaborador_id=${cid}`))[0];

// ════════════════════════════════════════════════════════════════════════
// Habilitação de Responsáveis por Treinamentos — Etapa 1 (banco). Réplica PGlite com as migrations REAIS e o código REAL do servidor.
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

console.log("Preparação: dados no modelo ANTERIOR (código de produção de hoje)");
let TA = 0, TB = 0, TC = 0, TD = 0;
const NOME_T = () => ({ [TA]: "A", [TB]: "B", [TC]: "C", [TD]: "D" } as Record<number, string>);
const salvarT = async (tok: string, titulo: string, extra: Record<string, unknown>) => (await espera(tok, "treinamento_salvar", { tipo: "desenvolvimento", modalidade: "interno", titulo, data_inicio: hojeSP, ...extra }, 200)).id as number;
await t("Dados anteriores: Gestor indica o Responsável (código atual), cria treinamentos de gestão, de instrutor e de outra área", async () => {
  for (const tok of ["rh", "ge", "gil"]) await sessao(tok);
  await espera("ge", "responsavel_gestao_indicar", { colaborador_id: 8 }, 200); // Hugo: Responsável da gestão da Bia (valia na hora)
  await espera("ge", "responsavel_gestao_indicar", { colaborador_id: 9 }, 200); // Iris: indicação que será revogada
  const iris = (await q("select id from public.peopleflow_dev_responsaveis_gestao where colaborador_id=9"))[0].id;
  await espera("ge", "responsavel_gestao_revogar", { id: iris, motivo: "Mudou de função" }, 200);
  const s = await sessao("hugo");
  if (s.c !== 200 || s.b.perfil !== "Responsavel") throw new Error("Hugo deveria abrir o módulo como Responsavel: " + jsonDe(s.b));
  TA = await salvarT("hugo", "Treinamento A", { responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 });
  TB = await salvarT("ge", "Treinamento B", { responsavel_colaborador_id: 2, instrutor_colaborador_id: 8 });
  TC = await salvarT("ge", "Treinamento C", { responsavel_colaborador_id: 2 });
  TD = await salvarT("gil", "Treinamento D", { responsavel_colaborador_id: 6, instrutor_colaborador_id: 2 });
  await espera("hugo", "participantes_adicionar", { treinamento_id: TA, colaborador_ids: [3] }, 200);
  await espera("ge", "participantes_adicionar", { treinamento_id: TB, colaborador_ids: [5] }, 200);
  await espera("ge", "participantes_adicionar", { treinamento_id: TC, colaborador_ids: [3] }, 200);
  await espera("gil", "participantes_adicionar", { treinamento_id: TD, colaborador_ids: [4] }, 200);
  await sessao("resp"); // Fabio: instrutor do A
  for (const [tid, nome] of [[TA, "a"], [TB, "b"], [TD, "d"]] as const) await db.exec(`insert into public.peopleflow_dev_evidencias (treinamento_id, tipo, storage_path, file_name) values (${tid}, 'material', 'zz/${nome}', 'apostila-${nome}.pdf')`);
  await db.exec(`insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria,prioridade) values (3,'gestor','Montagem','x','validada',now(),'tecnica','alta')`);
  const necId = (await q("select id from public.peopleflow_dev_necessidades limit 1"))[0].id;
  for (const tid of [TA, TD]) await db.exec(`insert into public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id, situacao) values (${tid}, ${necId}, 'validada')`);
});

const TABELAS = ["peopleflow_dev_treinamentos", "peopleflow_dev_participantes", "peopleflow_dev_evidencias", "peopleflow_dev_auditoria", "peopleflow_dev_necessidades", "peopleflow_dev_contas", "peopleflow_dev_escopo", "peopleflow_dev_treinamento_necessidades", "peopleflow_dev_qr_tokens", "peopleflow_dev_avaliacoes_reacao", "peopleflow_dev_reacao_respostas"];
const foto = async () => {
  const f: Record<string, string> = {};
  for (const tb of TABELAS) { const r = (await q(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${tb} x`))[0]; f[tb] = `${r.n}:${r.h}`; }
  f.responsaveis_legado = (await q(`select count(*)::int n, md5(coalesce(string_agg(concat_ws('~', id, gestor_colaborador_id, colaborador_id, ativo, indicado_em, indicado_por, revogado_em, revogado_por, revogado_motivo), '|' order by id), '')) h from public.peopleflow_dev_responsaveis_gestao`)).map((r) => `${r.n}:${r.h}`)[0];
  return f;
};
const estrutura = async () => ({
  funcoes: (await q(`select p.proname, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'peopleflow_dev_%' order by 1`)).map((r) => `${r.proname}:${r.d}`),
  politicas: (await q(`select tablename, policyname, md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) d from pg_policies where schemaname = 'public' order by 1, 2`)).map((r) => `${r.tablename}.${r.policyname}:${r.d}`),
  colunas: (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_responsaveis_gestao' order by 1`)).map((r) => r.column_name),
  checks: (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and contype = 'c' order by 1`)).map((r) => r.d),
  indices: (await q(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'peopleflow_dev_responsaveis_gestao' order by 1`)).map((r) => r.indexdef),
  tabelas: (await q(`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'peopleflow_dev_%' order by 1`)).map((r) => r.table_name),
});

const matriz = async () => {
  const nome = NOME_T();
  const r: Record<string, Record<string, string>> = {};
  const letras = async (uid: string, sql: string) => (await como(uid, sql)).map((x) => nome[Number(x.treinamento_id)]).sort().join("");
  for (const [quem, uid] of Object.entries({ rh: U.rh, ge: U.ge, hugo: U.hugo, resp: U.resp, gil: U.gil })) {
    r[quem] = {
      treinamentos: await letras(uid, "select id as treinamento_id from public.peopleflow_dev_treinamentos"),
      evidencias: await letras(uid, "select distinct treinamento_id from public.peopleflow_dev_evidencias"),
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

console.log("Migration: aplicação, dados preservados e impacto nas permissões");
await t("Aplicar a migration NÃO altera nenhum dado existente (treinamentos, participantes, evidências, auditoria, necessidades, contas, escopo, QR, avaliações) e converte as habilitações anteriores", async () => {
  await aplicar(MIG);
  const depois = await foto();
  if (jsonDe(depois) !== jsonDe(antesFoto)) throw new Error("dados alterados: " + jsonDe({ antes: antesFoto, depois }));
  const rg = await q("select colaborador_id, ativo, situacao, origem, habilitado_em is not null as com_data from public.peopleflow_dev_responsaveis_gestao order by colaborador_id");
  if (jsonDe(rg.map((r) => [Number(r.colaborador_id), r.ativo, r.situacao, r.origem, r.com_data])) !== jsonDe([[8, true, "habilitada", "indicacao_gestor", true], [9, false, "revogada", "indicacao_gestor", true]])) throw new Error("conversão: " + jsonDe(rg));
});

await t("Idempotente: aplicar de novo não altera dados nem estrutura", async () => {
  const a = jsonDe(await estrutura()), f = jsonDe(await foto());
  await aplicar(MIG);
  if (jsonDe(await estrutura()) !== a || jsonDe(await foto()) !== f) throw new Error("a segunda aplicação mudou algo");
});

const matrizDepois = await matriz();
console.log("  matriz DEPOIS :", jsonDe(matrizDepois));
const ESPERADO_ANTES = {
  rh: { treinamentos: "ABCD", evidencias: "ABD", turma: "ABCD", vinculos: "AD" },
  ge: { treinamentos: "ABCD", evidencias: "ABD", turma: "ABCD", vinculos: "AD" },
  hugo: { treinamentos: "ABC", evidencias: "AB", turma: "ABC", vinculos: "" },
  resp: { treinamentos: "A", evidencias: "A", turma: "A", vinculos: "" },
  gil: { treinamentos: "D", evidencias: "D", turma: "D", vinculos: "D" },
};
const ESPERADO_DEPOIS = {
  rh: { treinamentos: "ABCD", evidencias: "ABD", turma: "ABCD", vinculos: "AD" },
  ge: { treinamentos: "ABCD", evidencias: "AB", turma: "ABCD", vinculos: "A" }, // D: só instrutora → lê treinamento e turma, não evidências nem vínculos
  hugo: { treinamentos: "AB", evidencias: "A", turma: "AB", vinculos: "" }, // C (gestão alheia) some; B só como instrutor (sem evidências)
  resp: { treinamentos: "A", evidencias: "", turma: "A", vinculos: "" }, // instrutor: treinamento e turma, nunca evidências
  gil: { treinamentos: "D", evidencias: "D", turma: "D", vinculos: "D" },
};
await t("Impacto nas permissões de LEITURA (matriz real, antes × depois): RH e responsáveis designados sem perda; Responsável só vê o que está sob sua responsabilidade; instrutor lê treinamento e turma, nunca evidências nem vínculos", async () => {
  if (jsonDe(matrizAntes) !== jsonDe(ESPERADO_ANTES)) throw new Error("comportamento anterior diferente do documentado: " + jsonDe(matrizAntes));
  if (jsonDe(matrizDepois) !== jsonDe(ESPERADO_DEPOIS)) throw new Error("comportamento novo diferente do esperado: " + jsonDe(matrizDepois));
});

console.log("Reversão");
await t("Reversão devolve funções, políticas, colunas, índices e constraints EXATAMENTE ao estado anterior e preserva as habilitações (inclusive a revogada); depois reaplica", async () => {
  const comMigration = jsonDe(await estrutura());
  await aplicar(ROLLBACK);
  const e = await estrutura();
  const a = antesEstrutura;
  // o nome da constraint antiga pode mudar; o que vale é a definição
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

await t("Reversão é RECUSADA (sem alterar nada) quando já existe transferência de responsabilidade", async () => {
  await db.exec(`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 8, 2, 'revogacao', 'Teste de rastreabilidade', 'planejado')`);
  const antes = jsonDe(await estrutura());
  const msg = await falha(ROLLBACK);
  await db.exec("rollback;").catch(() => undefined);
  if (!msg || !/Reversão bloqueada.*transferências/.test(msg)) throw new Error("deveria recusar: " + msg);
  if (jsonDe(await estrutura()) !== antes) throw new Error("a recusa não pode alterar nada");
});

console.log("Habilitações: situação, transições e rastreabilidade");
await t("Código ATUAL continua funcionando: Gestor indica (habilitada na hora, ativo, com data) e revoga com motivo (situação 'revogada'); sem motivo, recusado", async () => {
  await espera("ge", "responsavel_gestao_indicar", { colaborador_id: 9 }, 200);
  const novo = (await q("select id, ativo, situacao, origem, habilitado_em is not null as com_data, habilitado_por is not null as com_quem from public.peopleflow_dev_responsaveis_gestao where colaborador_id=9 and ativo"))[0];
  if (!novo.ativo || novo.situacao !== "habilitada" || novo.origem !== "indicacao_gestor" || !novo.com_data || !novo.com_quem) throw new Error(jsonDe(novo));
  await espera("ge", "responsavel_gestao_revogar", { id: novo.id }, 422); // motivo obrigatório (regra existente)
  await espera("ge", "responsavel_gestao_revogar", { id: novo.id, motivo: "Fim da função" }, 200);
  const rev = (await q(`select ativo, situacao, revogado_motivo from public.peopleflow_dev_responsaveis_gestao where id=${novo.id}`))[0];
  if (rev.ativo || rev.situacao !== "revogada" || rev.revogado_motivo !== "Fim da função") throw new Error(jsonDe(rev));
  await espera("ge", "responsavel_gestao_indicar", { colaborador_id: 8 }, 409); // já habilitado: uma habilitação por colaborador
});

await t("Fluxo novo (indicada → habilitada | recusada; habilitada → revogada): transições válidas, motivos obrigatórios, identidade imutável, sem exclusão", async () => {
  // indicada: não vale como permissão (ativo = false) mesmo sem informar 'ativo'
  await db.exec(`insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (6, 4, 'indicada')`);
  const ind = (await q("select id, ativo, situacao, habilitado_em from public.peopleflow_dev_responsaveis_gestao where colaborador_id=4"))[0];
  if (ind.ativo || ind.situacao !== "indicada" || ind.habilitado_em) throw new Error("indicada não vale: " + jsonDe(ind));
  if (!/duplicate|unique/i.test((await falha(`insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (6, 4, 'indicada')`)) ?? "")) throw new Error("uma indicação pendente por par gestor × colaborador");
  // recusar exige motivo e data
  if (!/recusada_chk|check/i.test((await falha(`update public.peopleflow_dev_responsaveis_gestao set situacao='recusada' where id=${ind.id}`)) ?? "")) throw new Error("recusa sem motivo deveria falhar");
  await db.exec(`insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (6, 9, 'indicada')`);
  const rec = (await q("select id from public.peopleflow_dev_responsaveis_gestao where colaborador_id=9 and situacao='indicada'"))[0].id;
  await db.exec(`update public.peopleflow_dev_responsaveis_gestao set situacao='recusada', recusado_em=now(), recusado_motivo='Fora do escopo' where id=${rec}`);
  if ((await q(`select ativo from public.peopleflow_dev_responsaveis_gestao where id=${rec}`))[0].ativo !== false) throw new Error("recusada não é ativa");
  // habilitar (RH): vira ativa e ganha data
  await db.exec(`update public.peopleflow_dev_responsaveis_gestao set situacao='habilitada', habilitado_por='${U.rh}' where id=${ind.id}`);
  const hab = (await q(`select ativo, situacao, habilitado_em is not null as com_data from public.peopleflow_dev_responsaveis_gestao where id=${ind.id}`))[0];
  if (!hab.ativo || hab.situacao !== "habilitada" || !hab.com_data) throw new Error("habilitada: " + jsonDe(hab));
  // identidade imutável; transições inválidas; terminais imutáveis; sem exclusão
  for (const [sql, rx] of [
    [`update public.peopleflow_dev_responsaveis_gestao set colaborador_id=5 where id=${ind.id}`, /identidade/],
    [`update public.peopleflow_dev_responsaveis_gestao set gestor_colaborador_id=2 where id=${ind.id}`, /identidade/],
    [`update public.peopleflow_dev_responsaveis_gestao set origem='rh_direto' where id=${ind.id}`, /identidade/],
    [`update public.peopleflow_dev_responsaveis_gestao set situacao='indicada' where id=${ind.id}`, /Transição de situação inválida/],
    [`update public.peopleflow_dev_responsaveis_gestao set situacao='recusada', recusado_em=now(), recusado_motivo='x' where id=${ind.id}`, /Transição de situação inválida/],
    [`update public.peopleflow_dev_responsaveis_gestao set situacao='habilitada' where id=${rec}`, /Transição de situação inválida/],
    [`update public.peopleflow_dev_responsaveis_gestao set recusado_motivo='outro' where id=${rec}`, /registro histórico/],
    [`delete from public.peopleflow_dev_responsaveis_gestao where id=${ind.id}`, /imut|exclus|Desenvolvimento/i],
    [`truncate public.peopleflow_dev_responsaveis_gestao`, /imut|exclus|Desenvolvimento|cannot truncate/i], // com transferências, a chave estrangeira também impede
  ] as [string, RegExp][]) { const m = await falha(sql); if (!m || !rx.test(m)) throw new Error(`deveria recusar (${rx}): ${sql} → ${m}`); }
  // revogar exige motivo; revogada é histórico
  if (!/revogada_chk|check/i.test((await falha(`update public.peopleflow_dev_responsaveis_gestao set situacao='revogada', revogado_em=now() where id=${ind.id}`)) ?? "")) throw new Error("revogação sem motivo deveria falhar");
  await db.exec(`update public.peopleflow_dev_responsaveis_gestao set situacao='revogada', revogado_em=now(), revogado_por='${U.rh}', revogado_motivo='Mudou de área' where id=${ind.id}`);
  if (!/registro histórico/.test((await falha(`update public.peopleflow_dev_responsaveis_gestao set revogado_motivo='reescrito' where id=${ind.id}`)) ?? "")) throw new Error("revogada é histórico");
  // uma habilitação ativa por colaborador; depois de revogar, outra gestão pode habilitar
  await db.exec(`insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao, origem) values (6, 4, 'habilitada', 'rh_direto')`);
  if (!/duplicate|unique/i.test((await falha(`insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (2, 4, 'habilitada')`)) ?? "")) throw new Error("uma habilitação ativa por colaborador (uma gestão)");
  // situações e origens desconhecidas e 'ativo' incoerente são recusados
  for (const sql of [
    `insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (2, 7, 'qualquer')`,
    `insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, origem) values (2, 7, 'outra')`,
    `insert into public.peopleflow_dev_responsaveis_gestao (gestor_colaborador_id, colaborador_id, situacao) values (2, 2, 'habilitada')`,
  ]) if (!(await falha(sql))) throw new Error("deveria recusar: " + sql);
});

console.log("Leitura após a revogação");
await t("Revogar a habilitação encerra NA HORA a visão administrativa (treinamentos sob sua responsabilidade), mas o histórico permanece intacto e a visão como instrutor (somente leitura) continua", async () => {
  const hugoId = Number((await q("select id from public.peopleflow_dev_responsaveis_gestao where colaborador_id=8 and ativo"))[0].id);
  await espera("ge", "responsavel_gestao_revogar", { id: hugoId, motivo: "Mudança de responsabilidade" }, 200);
  const nome = NOME_T();
  const ver = async (sql: string) => (await como(U.hugo, sql)).map((x) => nome[Number(x.treinamento_id)]).sort().join("");
  const r = { treinamentos: await ver("select id as treinamento_id from public.peopleflow_dev_treinamentos"), evidencias: await ver("select distinct treinamento_id from public.peopleflow_dev_evidencias"), turma: await ver("select distinct treinamento_id from public.peopleflow_dev_participantes") };
  if (jsonDe(r) !== jsonDe({ treinamentos: "B", evidencias: "", turma: "B" })) throw new Error("após revogar: " + jsonDe(r));
  const rh = await como(U.rh, "select count(*)::int n from public.peopleflow_dev_treinamentos where id in (" + [TA, TB, TC, TD].join(",") + ")");
  if (rh[0].n !== 4) throw new Error("o RH continua vendo tudo");
  const hist = (await q(`select situacao, revogado_motivo, revogado_por is not null as por from public.peopleflow_dev_responsaveis_gestao where id=${hugoId}`))[0];
  if (hist.situacao !== "revogada" || hist.revogado_motivo !== "Mudança de responsabilidade" || !hist.por) throw new Error("registro da revogação: " + jsonDe(hist));
  const tr = (await q(`select responsavel_colaborador_id, solicitado_por_colaborador_id from public.peopleflow_dev_treinamentos where id=${TA}`))[0];
  if (Number(tr.responsavel_colaborador_id) !== 8 || Number(tr.solicitado_por_colaborador_id) !== 8) throw new Error("o treinamento mantém responsável e quem registrou (histórico)");
});

console.log("Transferências de responsabilidade");
await t("Transferências: só o RH lê; o navegador não grava; imutáveis; motivo obrigatório; tipo válido; origem ≠ destino", async () => {
  if ((await como(U.rh, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n !== 1) throw new Error("RH lê as transferências");
  for (const uid of [U.ge, U.hugo, U.resp, U.gil]) if ((await como(uid, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n !== 0) throw new Error("só o RH lê as transferências");
  const nega = async (sql: string) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U.rh}',false);`); try { return await falha(sql); } finally { await db.exec("reset role;"); } };
  if (!/permission denied/i.test((await nega(`insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 2, 'outro', 'x', 'planejado')`)) ?? "")) throw new Error("nem o RH grava pelo navegador");
  const ok = `insert into public.peopleflow_dev_transferencias_responsabilidade (treinamento_id, de_colaborador_id, para_colaborador_id, motivo_tipo, motivo, status_treinamento) values (${TA}, 8, 2, 'desligamento', 'Saiu da empresa', 'planejado')`;
  if (await falha(ok)) throw new Error("o servidor grava a transferência");
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
await t("Permissões: anon sem acesso a nada novo; authenticated só lê (políticas); funções novas executáveis só por authenticated/service_role; tabela de habilitações continua só do servidor", async () => {
  const priv = async (role: string, obj: string, p: string) => (await q(`select has_table_privilege('${role}', '${obj}', '${p}') as v`))[0].v as boolean;
  for (const tb of ["public.peopleflow_dev_transferencias_responsabilidade", "public.peopleflow_dev_responsaveis_gestao"]) {
    for (const p of ["select", "insert", "update", "delete"]) if (await priv("anon", tb, p)) throw new Error(`anon ${p} ${tb}`);
    for (const p of ["insert", "update", "delete"]) if (await priv("authenticated", tb, p)) throw new Error(`authenticated ${p} ${tb}`);
  }
  if (await priv("authenticated", "public.peopleflow_dev_responsaveis_gestao", "select")) throw new Error("habilitações: só o servidor lê");
  if (!(await priv("authenticated", "public.peopleflow_dev_transferencias_responsabilidade", "select"))) throw new Error("RH lê as transferências via política");
  for (const f of ["peopleflow_dev_habilitado_agora()", "peopleflow_dev_instrutor_de(bigint)", "peopleflow_dev_treinamento_gestao_visivel(bigint)", "peopleflow_dev_gere_treinamento(bigint)", "peopleflow_dev_responsavel_por(bigint)"]) {
    const x = (await q(`select has_function_privilege('anon', 'public.${f}', 'execute') a, has_function_privilege('authenticated', 'public.${f}', 'execute') b, has_function_privilege('service_role', 'public.${f}', 'execute') c`))[0];
    if (x.a || !x.b || !x.c) throw new Error(`execução de ${f}: ${jsonDe(x)}`);
  }
  if ((await q("select count(*)::int n from pg_policies where schemaname='public' and tablename='peopleflow_dev_responsaveis_gestao'"))[0].n !== 0) throw new Error("habilitações sem política para o navegador");
  const sem = await falha(`set role anon; select count(*) from public.peopleflow_dev_transferencias_responsabilidade;`);
  await db.exec("reset role;");
  if (!/permission denied/i.test(sem ?? "")) throw new Error("anon não lê transferências");
});

await t("Reversão é RECUSADA (sem alterar nada) quando existe indicação pendente ou recusada", async () => {
  const antes = jsonDe(await estrutura());
  const msg = await falha(ROLLBACK);
  await db.exec("rollback;").catch(() => undefined);
  if (!msg || !/Reversão bloqueada.*indicações pendentes ou recusadas/.test(msg)) throw new Error("deveria recusar: " + msg);
  if (jsonDe(await estrutura()) !== antes) throw new Error("a recusa não pode alterar nada");
});

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
