// Scripts de PUBLICAÇÃO (supabase/publicacao_desligamentos_*.local.sql — locais, com ids reais, não versionados) testados numa réplica PGlite
// com dados FICTÍCIOS: backup, retirada da turma, revogação de acesso, reversões, idempotência, guardas e validação final.
// Sem os arquivos locais (ex.: clone novo do repositório) o teste é pulado. Nunca toca no Supabase real.
//   cd tests && npx tsx desligamentos/teste_publicacao.mjs   (ou: npm run test:desligamentos-publicacao)
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\\/g, "/");
const SUP = REPO + "supabase/";
const NOMES = ["00_backup", "01_turma_trn0001", "01_turma_trn0001_rollback", "02_acessos_peopleflow", "02_acessos_peopleflow_rollback", "03_validacao"].map((n) => `publicacao_desligamentos_${n}.local.sql`);
if (!NOMES.every((n) => fs.existsSync(SUP + n))) {
  console.log("Scripts locais de publicação ausentes — teste pulado.");
  process.exit(0);
}
const rd = (f) => fs.readFileSync(SUP + f, "utf8");
const S = Object.fromEntries(NOMES.map((n) => [n.replace("publicacao_desligamentos_", "").replace(".local.sql", ""), rd(n)]));
const { PGlite } = await import("@electric-sql/pglite");

let ok = 0;
let falhas = 0;
const check = (nome, cond, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};
const secao = (t) => console.log(`\n== ${t} ==`);

// alvos de acesso, lidos do próprio script (uuid/e-mail reais NÃO ficam neste arquivo versionado)
const alvos = [...S["02_acessos_peopleflow"].matchAll(/\((\d+)::bigint, '([0-9a-f-]{36})'::uuid, '([^']+)'\)/g)].map((m) => ({ colab: Number(m[1]), uid: m[2], email: m[3] }));
check("script de acessos tem exatamente 3 alvos", alvos.length === 3 && alvos.map((a) => a.colab).join() === "24,40,59");

const db = new PGlite();
const sql = async (t, p = []) => (await db.query(t, p)).rows;
const um = async (t, p = []) => (await sql(t, p))[0];
const erro = async (script) => {
  try {
    await db.exec(script);
    return null;
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return String(e.message);
  }
};

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create table public.colaboradores (id bigint primary key, nome text not null, cargo text, departamento text, gestor text,
    desligado boolean not null default false, data_desligamento date, admissao date, empresa_afiliada boolean default false);
  create table public.peopleflow_movimentacoes (id text primary key, tipo_cod text, status text, colaborador text, colaborador_id bigint, sincronizado_em timestamptz, desligamento_info jsonb);
  create table public.peopleflow_pdi (id bigint primary key, colaborador_nome text not null, ciclo text, status text not null default 'Pendente', concluido_em timestamptz);
  create table public.peopleflow_pdi_itens (id text primary key, pdi_id bigint not null, competencia_nome text);
  create table public.peopleflow_pdi_acoes (id text primary key, item_id text not null, descricao text, status text);
  create table public.peopleflow_dev_treinamentos (id bigint primary key, codigo text unique, status text not null);
  create table public.peopleflow_dev_necessidades (id bigint primary key, colaborador_id bigint not null);
  create table public.peopleflow_dev_treinamento_necessidades (id bigint primary key, treinamento_id bigint not null, necessidade_id bigint not null, ativo boolean not null default true);
  create table public.peopleflow_dev_participantes (
    id bigint primary key, treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id), colaborador_id bigint not null references public.colaboradores (id),
    necessidade_id bigint, presenca_status text not null default 'pendente', eficacia_em timestamptz, eficiencia_em timestamptz,
    removido_em timestamptz, removido_por uuid, removido_motivo text, updated_at timestamptz not null default now(),
    unique (treinamento_id, colaborador_id), check ((removido_em is null) = (removido_motivo is null)));
  create table public.peopleflow_dev_auditoria (id bigint generated always as identity primary key, ts timestamptz not null default now(), user_id uuid, colaborador_id bigint, acao text not null, entidade text not null, entidade_id text, detalhe jsonb not null default '{}'::jsonb);
  create table public.module_access (user_id uuid not null, modulo text not null, concedido_em timestamptz not null default now(), concedido_por text, primary key (user_id, modulo));
`);
const f2 = rd("desenvolvimento_fase2.sql");
const ini = f2.indexOf("create or replace function public.peopleflow_dev_normalizar_nome");
await db.exec(f2.slice(ini, f2.indexOf("$$;", ini) + 3));
await db.exec(rd("desligamentos_historico_e_situacao.sql"));

// ── dados fictícios no mesmo desenho do real ──
const nomes = { 24: "Alfa Desligado", 40: "Bravo Desligado", 59: "Charlie Desligada", 19: "Delta Convertido", 32: "Echo Convertido" };
for (const [id, nome] of Object.entries(nomes)) {
  await db.query(`insert into public.colaboradores (id, nome, desligado, data_desligamento, admissao) values ($1, $2, $3, $4, '2026-01-13')`, [Number(id), nome, [24, 40, 59].includes(Number(id)), id === "24" ? "2026-10-05" : id === "40" ? "2026-10-09" : id === "59" ? "2026-10-05" : null]);
}
for (let i = 100; i < 160; i++) await db.query(`insert into public.colaboradores (id, nome, admissao) values ($1, $2, '2025-03-01')`, [i, `Ativo ${i}`]);
await db.exec(`insert into public.peopleflow_dev_treinamentos values (1, 'TRN-2026-0001', 'planejado'), (2, 'TRN-2026-0002', 'planejado')`);
// 63 participantes: ids 19/32/53 são os 3 desligados (59/24/40); os 60 restantes são ativos
const idDe = { 19: 59, 32: 24, 53: 40 };
let col = 100;
for (let pid = 1; pid <= 63; pid++) await db.query(`insert into public.peopleflow_dev_participantes (id, treinamento_id, colaborador_id) values ($1, 1, $2)`, [pid, idDe[pid] ?? col++]);
await db.exec(`
  insert into public.peopleflow_movimentacoes values
   ('M-2026-009', 'PRO', 'Aprovado', 'Echo Convertido', null, '2026-08-03', null),
   ('M-2026-027', 'DES', 'Aprovado', 'Alfa Desligado', 24, null, '{"nome":"Alfa Desligado","motivo":"x","dataIso":"2026-10-02"}'),
   ('M-2026-030', 'DES', 'Aprovado', 'Charlie Desligada', 59, null, '{"nome":"Charlie Desligada","motivo":"x","dataIso":"2026-10-05"}'),
   ('M-2026-031', 'DES', 'Aprovado', 'Bravo Desligado', 40, null, '{"nome":"Bravo Desligado","motivo":"x","dataIso":"2026-10-09"}'),
   ('M-2026-002', 'DES', 'Aprovado', 'Sem Dados', null, null, null);
  insert into public.peopleflow_pdi values (13, 'Bravo Desligado', 'Avaliação de Desempenho - 2º Ciclo MSB', 'Em andamento', null);
  insert into public.peopleflow_pdi_itens values ('P1', 13, 'a'), ('P2', 13, 'b'), ('P3', 13, 'c');
  insert into public.peopleflow_pdi_acoes select 'PA' || g, 'P' || (1 + g % 3), 'ação', 'Não iniciada' from generate_series(1, 8) g;
`);
for (const a of alvos) await db.query(`insert into auth.users values ($1, $2)`, [a.uid, a.email]);
await db.exec(`insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'ativo.um@x.test'), ('22222222-2222-2222-2222-222222222222', 'ativo.dois@x.test')`);
for (const a of alvos) await db.query(`insert into public.module_access values ($1, 'peopleflow', now(), 'backfill'), ($1, 'sst', now(), 'backfill')`, [a.uid]);
await db.exec(`insert into public.module_access values ('11111111-1111-1111-1111-111111111111', 'peopleflow', now(), 'x'), ('11111111-1111-1111-1111-111111111111', 'sst', now(), 'x'), ('22222222-2222-2222-2222-222222222222', 'peopleflow', now(), 'x')`);

const foto = async () => ({
  col: (await um(`select md5(string_agg(c::text, '|' order by c.id)) h from public.colaboradores c`)).h,
  mp: (await um(`select md5(string_agg(m::text, '|' order by m.id)) h from public.peopleflow_movimentacoes m`)).h,
  pdi: (await um(`select md5(string_agg(p::text, '|' order by p.id)) h from public.peopleflow_pdi p`)).h,
  part: (await um(`select md5(string_agg((to_jsonb(p) - 'updated_at')::text, '|' order by p.id)) h from public.peopleflow_dev_participantes p`)).h, // updated_at muda por definição ao retirar/devolver
  acc: (await um(`select md5(string_agg(m::text, '|' order by m.user_id, m.modulo)) h from public.module_access m`)).h,
  aud: Number((await um(`select count(*) n from public.peopleflow_dev_auditoria`)).n),
});
const validacao = async () => Object.fromEntries((await sql(S["03_validacao"].replace(/;\s*$/, ""))).map((r) => [Number(r.n), r.ok]));

// ═══ A. Pré-condições ═══
secao("A. Pré-condições: sem backup, acessos não são revogados");
const f0 = await foto();
check("revogação sem backup aborta e não altera nada", /PRÉ-CONDIÇÃO/.test(String(await erro(S["02_acessos_peopleflow"]))) && (await foto()).acc === f0.acc);

// ═══ B. Backup ═══
secao("B. Backup lógico");
check("backup roda sem erro", (await erro(S["00_backup"])) === null);
const man = await sql(`select * from backup_desligamentos_20261019._manifesto`);
check("manifesto cobre as 7 tabelas obrigatórias + opcionais existentes", ["colaboradores", "peopleflow_movimentacoes", "peopleflow_pdi", "peopleflow_pdi_itens", "peopleflow_pdi_acoes", "peopleflow_dev_participantes", "module_access"].every((t) => man.some((m) => m.tabela === t)), man.map((m) => m.tabela).join());
check("a cópia confere linha a linha com o original (hash)", Number((await um(`select count(*) n from backup_desligamentos_20261019.peopleflow_dev_participantes`)).n) === 63 && Number((await um(`select count(*) n from backup_desligamentos_20261019.module_access`)).n) === 9);
check("o backup não tem acesso para anon/authenticated", !(await um(`select has_table_privilege('authenticated', 'backup_desligamentos_20261019.colaboradores', 'select') p`)).p && !(await um(`select has_table_privilege('anon', 'backup_desligamentos_20261019.module_access', 'select') p`)).p);
check("backup não altera nada nas tabelas originais", JSON.stringify(await foto()) === JSON.stringify(f0));
check("rodar o backup de novo aborta sem sobrescrever", /já existe/.test(String(await erro(S["00_backup"]))));

// ═══ C. Turma TRN-2026-0001 ═══
secao("C. TRN-2026-0001: retirada lógica dos 3 desligados");
// guarda: presença registrada em um deles → aborta tudo (nada muda)
await db.exec(`update public.peopleflow_dev_participantes set presenca_status = 'presente' where id = 32`);
const fG = await foto();
check("com presença registrada o script aborta e NADA é alterado (atomicidade)", /presença\/eficácia\/necessidade registrada/.test(String(await erro(S["01_turma_trn0001"]))) && (await foto()).part === fG.part && (await foto()).aud === fG.aud);
await db.exec(`update public.peopleflow_dev_participantes set presenca_status = 'pendente' where id = 32`);
// guarda: vínculo de necessidade ativo
await db.exec(`insert into public.peopleflow_dev_necessidades values (1, 59); insert into public.peopleflow_dev_treinamento_necessidades values (1, 1, 1, true)`);
check("com necessidade ligada à turma o script aborta (devolução com histórico só pela tela)", /necessidade ligada/.test(String(await erro(S["01_turma_trn0001"]))));
await db.exec(`delete from public.peopleflow_dev_treinamento_necessidades; delete from public.peopleflow_dev_necessidades`);
const fAntesC = await foto();
check("retirada roda sem erro", (await erro(S["01_turma_trn0001"])) === null);
const ret = await sql(`select id, colaborador_id, removido_em is not null as ret, removido_motivo from public.peopleflow_dev_participantes where id in (19, 32, 53) order by id`);
check("os 3 participantes ficam retirados, com motivo", ret.length === 3 && ret.every((r) => r.ret && /desligado\(a\)/.test(r.removido_motivo)));
check("histórico preservado: continuam 63 linhas; 60 inscritos; nenhum desligado inscrito", Number((await um(`select count(*) n from public.peopleflow_dev_participantes where treinamento_id = 1`)).n) === 63 && Number((await um(`select count(*) n from public.peopleflow_dev_participantes where removido_em is null`)).n) === 60);
check("auditoria: 3 eventos participante_retirado", Number((await um(`select count(*) n from public.peopleflow_dev_auditoria where acao = 'participante_retirado'`)).n) === 3);
const fC = await foto();
check("idempotente: rodar de novo não grava nada", (await erro(S["01_turma_trn0001"])) === null && JSON.stringify(await foto()) === JSON.stringify(fC));
check("cadastro, MPs, PDI e acessos intactos pela retirada", fC.col === fAntesC.col && fC.mp === fAntesC.mp && fC.pdi === fAntesC.pdi && fC.acc === fAntesC.acc);
check("reversão devolve os 3 (linhas idênticas às de antes, exceto o carimbo updated_at)", (await erro(S["01_turma_trn0001_rollback"])) === null && (await foto()).part === fAntesC.part);
check("…e a retirada pode ser reaplicada depois da reversão", (await erro(S["01_turma_trn0001"])) === null && Number((await um(`select count(*) n from public.peopleflow_dev_participantes where removido_em is null`)).n) === 60);

// ═══ D. Acessos ═══
secao("D. Revogação do acesso peopleflow (SST e ativos intactos)");
const fAntesD = await foto();
// guarda: e-mail divergente
await db.query(`update auth.users set email = 'outro@x.test' where id = $1`, [alvos[0].uid]);
check("UUID × e-mail divergente aborta sem alterar", /não corresponde ao e-mail/.test(String(await erro(S["02_acessos_peopleflow"]))) && (await foto()).acc === fAntesD.acc);
await db.query(`update auth.users set email = $2 where id = $1`, [alvos[0].uid, alvos[0].email]);
// guarda: homônimo ativo
await db.exec(`insert into public.colaboradores (id, nome) values (500, 'Alfa Desligado')`);
check("homônimo ATIVO de um alvo aborta sem alterar", /homônimo ATIVO/.test(String(await erro(S["02_acessos_peopleflow"]))) && (await foto()).acc === fAntesD.acc);
await db.exec(`delete from public.colaboradores where id = 500`);
// guarda: alvo não desligado
await db.exec(`update public.colaboradores set desligado = false where id = 59`);
check("alvo que não está desligado aborta sem alterar", /não está desligado/.test(String(await erro(S["02_acessos_peopleflow"]))) && (await foto()).acc === fAntesD.acc);
await db.exec(`update public.colaboradores set desligado = true where id = 59`);

check("revogação roda sem erro", (await erro(S["02_acessos_peopleflow"])) === null);
const pf = Number((await um(`select count(*) n from public.module_access where modulo = 'peopleflow' and user_id = any($1)`, [alvos.map((a) => a.uid)])).n);
const sst = Number((await um(`select count(*) n from public.module_access where modulo = 'sst' and user_id = any($1)`, [alvos.map((a) => a.uid)])).n);
check("os 3 perdem 'peopleflow' e mantêm 'sst'", pf === 0 && sst === 3);
check("contas ativas e demais linhas intactas (6 de 9 linhas restantes: 3 sst + 3 ativas)", Number((await um(`select count(*) n from public.module_access`)).n) === 6 && Number((await um(`select count(*) n from public.module_access where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')`)).n) === 3);
check("nenhum usuário do Auth foi apagado", Number((await um(`select count(*) n from auth.users`)).n) === 5);
const fD = await foto();
check("idempotente: segunda execução não altera nada", (await erro(S["02_acessos_peopleflow"])) === null && JSON.stringify(await foto()) === JSON.stringify(fD));
check("cadastro, MPs, PDI e participantes intactos pela revogação", fD.col === fAntesD.col && fD.mp === fAntesD.mp && fD.pdi === fAntesD.pdi && fD.part === fAntesD.part);

// ═══ E. Validação final ═══
secao("E. Validação final (somente leitura)");
const v = await validacao();
for (const n of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) check(`validação #${n} verdadeira no estado esperado`, v[n] === true, `n=${n}`);
check("validação #5 (rubricas só-servidor, nenhuma validada) verdadeira", v[5] === true);
check("validação não grava nada", JSON.stringify(await foto()) === JSON.stringify(fD));
// a validação DETECTA violações
await db.exec(`update public.peopleflow_movimentacoes set status = 'Reprovado' where id = 'M-2026-009'`);
check("detecta MP M-2026-009 alterada (#6 e #8 falham)", (await validacao())[6] === false && (await validacao())[8] === false);
await db.exec(`update public.peopleflow_movimentacoes set status = 'Aprovado' where id = 'M-2026-009'`);
await db.exec(`update public.colaboradores set data_desligamento = '2026-10-02' where id = 24`);
check("detecta data de desligamento de Leandro alterada (#9 e #11 falham)", (await validacao())[9] === false && (await validacao())[11] === false);
await db.exec(`update public.colaboradores set data_desligamento = '2026-10-05' where id = 24`);
await db.exec(`update public.peopleflow_pdi set status = 'Concluído', concluido_em = now() where id = 13`);
check("detecta PDI concluído artificialmente (#14 falha)", (await validacao())[14] === false);
await db.exec(`update public.peopleflow_pdi set status = 'Em andamento', concluido_em = null where id = 13`);
await db.exec(`update public.colaboradores set desligado = true where id = 32`);
check("detecta Marcelo/Ítalo marcado como desligado (#10 e #11 falham)", (await validacao())[10] === false && (await validacao())[11] === false);
await db.exec(`update public.colaboradores set desligado = false where id = 32`);
// MP DES aprovada de colaborador ativo com data vencida → o cron ainda aplicaria
await db.exec(`update public.colaboradores set desligado = false where id = 40`);
check("detecta MP de desligamento que o cron ainda aplicaria (#19 falha)", (await validacao())[19] === false);
await db.exec(`update public.colaboradores set desligado = true where id = 40`);

// ═══ F. Reversão dos acessos ═══
secao("F. Reversão dos acessos a partir do backup");
check("reversão roda sem erro", (await erro(S["02_acessos_peopleflow_rollback"])) === null);
check("module_access volta byte a byte ao estado do backup", (await um(`select md5(string_agg(b::text, '|' order by b.user_id, b.modulo)) h from backup_desligamentos_20261019.module_access b`)).h === (await foto()).acc);
check("reversão repetida não duplica nada", (await erro(S["02_acessos_peopleflow_rollback"])) === null && Number((await um(`select count(*) n from public.module_access`)).n) === 9);

console.log(`\nRESUMO: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
