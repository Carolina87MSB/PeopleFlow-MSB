// Fase 5 — testes locais (PGlite) da Gestão de Treinamentos, com a lógica REAL do servidor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { criarFake } from "./fakeSupabase.ts";

const PF = fileURLToPath(new URL("../../", import.meta.url)).split("\\").join("/").replace(/\/$/, "");
const SQL = (n: string) => fs.readFileSync(`${PF}/supabase/${n}`, "utf8");
const [F1, F2, F4, F5, RB5, F5B, RB5B, F5C, RB5C, F5D, RB5D] = ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5_rollback.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5b_homologacao_rollback.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5c_registro_rollback.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_fase5d_habilidades_dc_rollback.sql"].map(SQL);
const { emailOf } = await import(pathToFileURL(`${PF}/src/domain/hierarquia.ts`).href);

const db = new PGlite();
let ok = 0, falhas = 0;
const t = async (n: string, fn: () => Promise<void>) => { try { await fn(); ok++; console.log("  ✓", n); } catch (e) { falhas++; console.log("  ✗", n, "→", (e as Error).message); } };
const q = async (sql: string) => (await db.query(sql)).rows as any[];
const U = { rh: "00000000-0000-0000-0000-0000000000a1", ge: "00000000-0000-0000-0000-0000000000b2", resp: "00000000-0000-0000-0000-0000000000c3", p3: "00000000-0000-0000-0000-0000000000d4", p4: "00000000-0000-0000-0000-0000000000e5", semacesso: "00000000-0000-0000-0000-0000000000f6" };
const NOMES: Record<number, string> = { 1: "Ana Recursos", 2: "Bia Gestora", 3: "Caio Operador", 4: "Davi Logistica", 5: "Eva Operadora", 7: "Fabio Instrutor" };

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (bucket_id text, name text);
create table public.module_access (user_id uuid, modulo text);
create table public.colaboradores (id bigint primary key, cpf text not null default '', nome text not null, cargo text not null default '', departamento text not null default '', gestor text, admissao date, desligado boolean default false, data_desligamento date, empresa_afiliada boolean default false);
alter table public.colaboradores enable row level security; create policy leitura on public.colaboradores for select to authenticated using (true); grant select on public.colaboradores to authenticated;
create table public.peopleflow_descricoes_cargo (cargo_nome text primary key, obsoleto boolean not null default false);
create table public.peopleflow_pdi (id bigint generated always as identity primary key);
insert into auth.users select unnest(array['${Object.values(U).join("','")}'])::uuid;
insert into public.module_access (user_id, modulo) select id, 'peopleflow' from auth.users where id <> '${U.semacesso}';
insert into public.colaboradores (id,nome,cargo,departamento,gestor) values
 (1,'${NOMES[1]}','Analista de RH','Recursos Humanos','Dir'),(2,'${NOMES[2]}','Supervisora','Produção','Dir'),(3,'${NOMES[3]}','Operador','Produção','${NOMES[2]}'),
 (4,'${NOMES[4]}','Conferente','Logística','Outro'),(5,'${NOMES[5]}','Operador','Produção','${NOMES[2]}'),(7,'${NOMES[7]}','Técnico','Qualidade','Outro');
insert into public.peopleflow_descricoes_cargo (cargo_nome) values ('Operador'),('Supervisora'),('Conferente'),('Técnico'),('Analista de RH');
`);
for (const f of [F1, F2, F4]) await db.exec(f);
await db.exec(F5);
await db.exec(F5B);
await db.exec(F5C);
await db.exec(F5D);
await db.exec(`
insert into public.peopleflow_dev_contas values ('${U.rh}',1,'RH',now()),('${U.ge}',2,'Gestor',now()),('${U.resp}',7,'Responsavel',now());
insert into public.peopleflow_dev_escopo (gestor_colaborador_id, colaborador_id) values (2,2),(2,3),(2,5);
insert into public.peopleflow_dev_lista_mestra (codigo,titulo,revisao_atual,situacao) values ('P-PR-001','Montagem da sonda','03','vigente');
insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria,prioridade) values
 (3,'gestor','Montagem','x','validada',now(),'tecnica','alta'),(5,'gestor','Montagem','x','validada',now(),'tecnica','alta'),(4,'rh','Excel','x','validada',now(),'sistemas_ferramentas','media'),(3,'gestor','Lean','x','validada',now(),'tecnica','media');
`);
const fake = criarFake(db, {
  rh: { id: U.rh, email: emailOf(NOMES[1]) }, gestor: { id: U.ge, email: emailOf(NOMES[2]) }, resp: { id: U.resp, email: emailOf(NOMES[7]) },
  p3: { id: U.p3, email: emailOf(NOMES[3]) }, p4: { id: U.p4, email: emailOf(NOMES[4]) }, semacesso: { id: U.semacesso, email: emailOf(NOMES[5]) },
});
(globalThis as any).__ADMIN = fake;
const acoes = await import(pathToFileURL(`${PF}/api/_lib/desenvolvimentoAcoes.ts`).href);
async function chamar(tok: string, acao: string, body: Record<string, unknown>) {
  const res: any = { c: 0, b: null, status(c: number) { this.c = c; return this; }, json(b: unknown) { this.b = b; } };
  const req = { headers: { authorization: `Bearer ${tok}` }, body };
  if (acoes.ehAcaoDePresencaQr(acao)) await acoes.executarPresencaQr(acao, req, res);
  else await acoes.executarAcao(acao, req, res);
  return res as { c: number; b: any };
}
const espera = async (tok: string, acao: string, body: Record<string, unknown>, st: number) => { const r = await chamar(tok, acao, body); if (r.c !== st) throw new Error(`${acao}: esperado ${st}, veio ${r.c}: ${JSON.stringify(r.b)}`); return r.b?.dados; };
const aud = async (a: string) => (await q(`select count(*)::int n from public.peopleflow_dev_auditoria where acao='${a}'`))[0].n;
const nec = async (id: number) => (await q(`select status, atendida_treinamento_id from public.peopleflow_dev_necessidades where id=${id}`))[0];
const part = async (tid: number, cid: number) => (await q(`select * from public.peopleflow_dev_participantes where treinamento_id=${tid} and colaborador_id=${cid}`))[0];
const hoje = new Date().toISOString().slice(0, 10);
const como = async (uid: string, sql: string) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await q(sql); } finally { await db.exec("reset role;"); } };
import zlib from "node:zlib";
function textoDoPdf(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const bruto = buf.toString("latin1");
  let out = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf("endstream", ini);
    let conteudo: string;
    try { conteudo = zlib.inflateSync(buf.subarray(ini, fim), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("latin1"); } catch { conteudo = buf.subarray(ini, fim).toString("latin1"); }
    for (const h of conteudo.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += Buffer.from(h[1], "hex").toString("latin1") + "\n";
  }
  return out;
}
const listas = async (tid: number) => q(`select id, storage_path, file_name, observacao, substituida_em, substituida_motivo, participante_id from public.peopleflow_dev_evidencias where treinamento_id=${tid} and tipo='lista_presenca' order by id`);
const pdfDe = (path: string) => { const b = fake.storage.conteudos.get(`desenvolvimento-evidencias/${path}`); if (!b) throw new Error("arquivo não está no bucket: " + path); return b; };
const sel = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/selecaoParticipantes.ts`).href);
const rot = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/rotulos.ts`).href);
// Campos mínimos de um treinamento: Tipo e Modalidade são sempre explícitos.
// Registro único: todo treinamento nasce PLANEJADO → data prevista e responsável sempre informados.
const base = (tipo: string, modalidade: string, extra: Record<string, unknown> = {}) => ({ tipo, modalidade, data_inicio: hoje, responsavel_colaborador_id: 1, ...extra });

console.log("Migration");
await t("Fases 5, 5b e 5c são idempotentes (reaplicar 5 exige reaplicar 5b e 5c)", async () => { await db.exec(F5); await db.exec(F5B); await db.exec(F5C); await db.exec(F5B); await db.exec(F5C); });
await t("bucket de evidências é privado", async () => { const b = await q("select public, file_size_limit from storage.buckets where id='desenvolvimento-evidencias'"); if (b.length !== 1 || b[0].public !== false) throw new Error(JSON.stringify(b)); });
await t("estrutura: tipo ≠ modalidade ≠ formato (colunas e checks separados)", async () => {
  const cols = (await q("select column_name from information_schema.columns where table_name='peopleflow_dev_treinamentos'")).map((c) => c.column_name);
  for (const c of ["tipo", "modalidade", "formato", "reposicao_de_id", "reposicao_raiz_id", "reposicao_numero"]) if (!cols.includes(c)) throw new Error("falta " + c);
  if (cols.includes("origem_tipo")) throw new Error("origem_tipo não deveria existir");
  const def = (await q("select column_default d, is_nullable n from information_schema.columns where table_name='peopleflow_dev_treinamentos' and column_name='modalidade'"))[0];
  if (def.d !== null || def.n !== "NO") throw new Error("modalidade deve ser obrigatória e sem padrão: " + JSON.stringify(def));
  for (const sql of [
    "insert into public.peopleflow_dev_treinamentos (titulo, tipo, modalidade) values ('x','pop_it','interno')",
    "insert into public.peopleflow_dev_treinamentos (titulo, tipo, modalidade) values ('x','outro','presencial')",
    "insert into public.peopleflow_dev_treinamentos (titulo, tipo, modalidade, formato) values ('x','outro','interno','ead')",
    "insert into public.peopleflow_dev_treinamentos (titulo, tipo) values ('x','outro')",
    "insert into public.peopleflow_dev_treinamentos (titulo, tipo, modalidade, status, data_inicio) values ('x','novo_pop','interno','planejado', current_date)",
  ]) {
    try { await db.exec(sql); throw new Error("aceitou: " + sql); } catch (e) { if ((e as Error).message.startsWith("aceitou")) throw e; }
  }
});

console.log("Classificação, modalidade e formato");
let tRH = 0, tGe = 0, tPop = 0, tExt = 0;
await t("C1/1. registro único: o treinamento nasce PLANEJADO (sem etapa de solicitação/aprovação)", async () => {
  await espera("rh", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Sem data", data_inicio: "" }), 422);
  await espera("rh", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Sem responsável", responsavel_colaborador_id: null }), 422);
  const p = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Sem eficácia", responsavel_colaborador_id: 7, planejar: false }), 200);
  if (p.status !== "planejado" || !p.planejado_em || Number(p.solicitado_por_colaborador_id) !== 1) throw new Error(JSON.stringify(p));
  tRH = p.id;
  const a = await q("select detalhe from public.peopleflow_dev_auditoria where acao='treinamento_planejado' order by id desc limit 1");
  if (a[0].detalhe.registro !== true || (await aud("treinamento_solicitado")) !== 0) throw new Error("auditoria");
  const def = (await q("select column_default d from information_schema.columns where table_name='peopleflow_dev_treinamentos' and column_name='status'"))[0].d;
  if (!String(def).includes("planejado")) throw new Error("padrão do banco deveria ser planejado: " + def);
});
await t("Modalidade é obrigatória e nunca inferida; Tipo também", async () => {
  await espera("rh", "treinamento_salvar", { tipo: "outro", titulo: "Sem modalidade" }, 422);
  await espera("rh", "treinamento_salvar", { modalidade: "interno", titulo: "Sem tipo" }, 422);
  await espera("rh", "treinamento_salvar", base("pop_it", "interno", { titulo: "Tipo antigo" }), 422);
  await espera("rh", "treinamento_salvar", base("outro", "presencial", { titulo: "Formato no lugar da modalidade" }), 422);
});
await t("M4/M5/M6. Modalidade Interno e Externo; formato independente da modalidade", async () => {
  const a = await espera("rh", "treinamento_salvar", base("capacitacao_tecnica", "externo", { titulo: "Curso externo online", formato: "online" }), 200);
  const b = await espera("rh", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Curso interno online", formato: "online" }), 200);
  const c = await espera("rh", "treinamento_salvar", base("saude_seguranca", "externo", { titulo: "NR externa presencial", formato: "presencial" }), 200);
  if (a.modalidade !== "externo" || a.formato !== "online" || b.modalidade !== "interno" || b.formato !== "online" || c.formato !== "presencial" || c.tipo !== "saude_seguranca") throw new Error(JSON.stringify([a, b, c]));
  await espera("rh", "treinamento_salvar", base("outro", "interno", { titulo: "x", formato: "ead" }), 422);
  const semFormato = await espera("rh", "treinamento_salvar", base("sistemas_ferramentas", "interno", { titulo: "Sem formato" }), 200);
  if (semFormato.formato !== null) throw new Error("formato deveria ficar vazio");
});
await t("N1/N2/N3. Novo POP, Revisão de POP e Instrução de Trabalho exigem documento e fotografam código+título+revisão", async () => {
  await db.exec("insert into public.peopleflow_dev_lista_mestra (codigo,titulo,revisao_atual,situacao) values ('I-PR-010','Operar a seladora','01','vigente'),('POP-QA-020','Liberação de lote','00','vigente')");
  for (const [tipo, codigo] of [["novo_pop", "POP-QA-020"], ["revisao_pop", "P-PR-001"], ["instrucao_trabalho", "I-PR-010"]]) {
    await espera("rh", "treinamento_salvar", base(tipo, "interno", { titulo: "", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 422);
    const r = await espera("rh", "treinamento_salvar", base(tipo, "interno", { titulo: "", lista_mestra_codigo: codigo, data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
    if (r.tipo !== tipo || r.lista_mestra_codigo !== codigo || !r.lista_mestra_revisao || !r.lista_mestra_titulo || r.titulo !== r.lista_mestra_titulo.toLocaleUpperCase("pt-BR")) throw new Error(JSON.stringify(r));
    if (tipo === "revisao_pop") tPop = r.id;
  }
  // Sem documento não há título: a solicitação desses tipos já exige o documento.
  await espera("gestor", "treinamento_salvar", base("revisao_pop", "interno", { titulo: "Revisão do POP da linha 2" }), 422);
});
await t("Título automático: tipos com documento usam EXATAMENTE o título da Lista Mestra; troca de documento atualiza", async () => {
  const r = await espera("gestor", "treinamento_salvar", base("instrucao_trabalho", "interno", { titulo: "Outro nome digitado", lista_mestra_codigo: "I-PR-010" }), 200);
  if (r.titulo !== "OPERAR A SELADORA" || r.lista_mestra_titulo !== "Operar a seladora") throw new Error(JSON.stringify(r));
  const e = await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { id: r.id, titulo: "Tentativa de mudar", lista_mestra_codigo: "POP-QA-020" }), 200);
  if (e.titulo !== "LIBERAÇÃO DE LOTE" || e.lista_mestra_codigo !== "POP-QA-020" || e.lista_mestra_revisao !== "00") throw new Error(JSON.stringify(e));
  const m = await espera("rh", "treinamento_salvar", base("integracao", "interno", { titulo: "Integração de novos colaboradores" }), 200);
  if (m.titulo !== "INTEGRAÇÃO DE NOVOS COLABORADORES") throw new Error("demais tipos: título digitado (em caixa alta)");
  await espera("rh", "treinamento_salvar", base("integracao", "interno", { titulo: "" }), 422);
});
await t("N3. Interface usa \"Instrução de Trabalho\" por extenso (nenhum rótulo \"IT\")", async () => {
  if (rot.TIPO_TREINAMENTO.instrucao_trabalho !== "Instrução de Trabalho" || rot.TIPO_TREINAMENTO.novo_pop !== "Novo POP" || rot.TIPO_TREINAMENTO.revisao_pop !== "Revisão de POP") throw new Error(JSON.stringify(rot.TIPO_TREINAMENTO));
  if (Object.keys(rot.TIPO_TREINAMENTO).length !== 11) throw new Error("devem ser 11 tipos");
  const arquivos = [
    ...fs.readdirSync(`${PF}/src/features/desenvolvimento`).map((f) => `${PF}/src/features/desenvolvimento/${f}`),
    `${PF}/src/participar/Participar.tsx`,
    `${PF}/api/_lib/desenvolvimentoAcoes.ts`,
  ].filter((f) => /\.(tsx?|css)$/.test(f));
  for (const f of arquivos) {
    const achado = fs.readFileSync(f, "utf8").match(/\bIT\b|POP ?\/ ?IT/);
    if (achado) throw new Error(`${path.basename(f)}: "${achado[0]}"`);
  }
});
await t("8. Revisão de POP: fotografia não muda retroativamente", async () => {
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='04' where codigo='P-PR-001'");
  const e = await espera("rh", "treinamento_salvar", base("revisao_pop", "interno", { id: tPop, titulo: "Montagem da sonda", lista_mestra_codigo: "P-PR-001", data_inicio: hoje, responsavel_colaborador_id: 1, observacao: "turma 1" }), 200);
  if (e.lista_mestra_revisao !== "03") throw new Error("revisão atualizada retroativamente");
  const lm = await q("select revisao_atual from public.peopleflow_dev_lista_mestra where codigo='P-PR-001'");
  if (lm[0].revisao_atual !== "04") throw new Error("treinamento alterou a Lista Mestra");
  // A revisão treinada é a vigente ao INICIAR a realização (ver teste_permissoes.ts): aqui a Lista Mestra volta à 03 para o treinamento seguir nela.
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='03' where codigo='P-PR-001'");
});

await t("Título em CAIXA ALTA (criação e edição); justificativa e observação como digitadas; Lista Mestra intocada", async () => {
  const just = "Esse treinamento é uma ação em resposta à Pesquisa de Clima, com o objetivo de melhorar a comunicação interna.";
  const c = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Programa Conexão MSB", justificativa: just, observacao: "Turma piloto, Sala 3" }), 200);
  if (c.titulo !== "PROGRAMA CONEXÃO MSB" || c.justificativa !== just || c.observacao !== "Turma piloto, Sala 3") throw new Error(JSON.stringify(c));
  const e = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: c.id, titulo: "programa conexão msb — turma 2", justificativa: just }), 200);
  if (e.titulo !== "PROGRAMA CONEXÃO MSB — TURMA 2" || e.justificativa !== just) throw new Error(JSON.stringify(e));
  const lm = await q("select titulo from public.peopleflow_dev_lista_mestra where codigo='I-PR-010'");
  if (lm[0].titulo !== "Operar a seladora") throw new Error("Lista Mestra alterada");
});

console.log("Solicitação e participantes");
await t("C1/2. Gestor registra (nasce PLANEJADO, sem aprovação do RH) e inclui liderados", async () => {
  const s = await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Montagem da sonda" }), 200);
  if (s.status !== "planejado") throw new Error("registro do gestor deveria nascer planejado: " + s.status);
  tGe = s.id;
  const r = await espera("gestor", "participantes_adicionar", { treinamento_id: tGe, colaborador_ids: [3] }, 200);
  if (r.incluidos !== 1) throw new Error(JSON.stringify(r));
});
await t("P7. Gestor seleciona participante de OUTRO departamento (lista só com nome/cargo/departamento)", async () => {
  const opcoes = await espera("gestor", "participantes_opcoes", { treinamento_id: tGe }, 200);
  const davi = opcoes.find((o: any) => o.id === 4);
  if (!davi || davi.departamento !== "Logística" || opcoes.length !== 6) throw new Error(JSON.stringify(opcoes));
  for (const o of opcoes) if (Object.keys(o).sort().join() !== "cargo,departamento,id,nome") throw new Error("campos extras: " + Object.keys(o));
  await espera("gestor", "participantes_adicionar", { treinamento_id: tGe, colaborador_ids: [4] }, 200);
  const vis = await como(U.ge, `select colaborador_id from public.peopleflow_dev_participantes where treinamento_id=${tGe} order by 1`);
  if (vis.map((v) => Number(v.colaborador_id)).join() !== "3,4") throw new Error("gestor deveria ver a turma do treinamento que solicitou: " + JSON.stringify(vis));
});
await t("3. Gestor bloqueado em treinamento que não gere e em funções do RH", async () => {
  await espera("gestor", "participantes_adicionar", { treinamento_id: tRH, colaborador_ids: [3] }, 403);
  await espera("gestor", "participantes_opcoes", { treinamento_id: tRH }, 403);
  await espera("gestor", "treinamento_salvar", base("outro", "interno", { id: tRH, titulo: "x" }), 403);
  for (const a of ["treinamento_planejar", "treinamento_concluir"]) await espera("gestor", a, { id: tGe }, 403);
  await espera("gestor", "necessidades_vincular", { treinamento_id: tRH, necessidade_ids: [1] }, 403); // não é da gestão dele
  for (const a of ["necessidade_associacao_validar", "necessidade_associacao_rejeitar"]) await espera("gestor", a, { treinamento_id: tGe, necessidade_id: 1, motivo: "x" }, 403);
});
let tInst = 0;
await t("P8. Instrutor seleciona participantes de outros departamentos", async () => {
  const r = await espera("rh", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Metrologia", data_inicio: hoje, responsavel_colaborador_id: 1, instrutor_colaborador_id: 7, planejar: true }), 200);
  tInst = r.id;
  const opcoes = await espera("resp", "participantes_opcoes", { treinamento_id: tInst }, 200);
  if (!opcoes.some((o: any) => o.departamento === "Logística") || !opcoes.some((o: any) => o.departamento === "Produção")) throw new Error(JSON.stringify(opcoes));
  const a = await espera("resp", "participantes_adicionar", { treinamento_id: tInst, colaborador_ids: [4, 2] }, 200);
  if (a.incluidos !== 2) throw new Error(JSON.stringify(a));
  await espera("resp", "participantes_adicionar", { treinamento_id: tInst, colaborador_ids: [999] }, 422);
});
await t("P9/4. Acesso transversal vale só para montar a turma — nada além disso", async () => {
  await espera("resp", "participantes_opcoes", { treinamento_id: tPop }, 403);
  await espera("resp", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [3] }, 403);
  for (const a of ["treinamento_planejar", "treinamento_concluir"]) await espera("resp", a, { id: tRH }, 403);
  await espera("resp", "treinamento_iniciar", { id: tGe }, 403);
  await espera("resp", "necessidade_registrar", { colaborador_id: 3, descricao: "x", categoria: "tecnica", justificativa: "x" }, 403);
  // Gestor incluiu Davi (Logística) na turma, mas continua sem ver necessidades/histórico dele fora desse treinamento.
  const n = await como(U.ge, "select count(*)::int n from public.peopleflow_dev_necessidades where colaborador_id=4");
  if (n[0].n !== 0) throw new Error("gestor viu necessidade fora da equipe");
  const pi = await como(U.ge, `select count(*)::int n from public.peopleflow_dev_participantes where colaborador_id=4 and treinamento_id<>${tGe}`);
  if (pi[0].n !== 0) throw new Error("gestor viu participações de fora da equipe em outros treinamentos");
  const rn = await como(U.resp, "select count(*)::int n from public.peopleflow_dev_necessidades");
  if (rn[0].n !== 0) throw new Error("resp vê necessidades");
});
await t("P10/P11. Selecionar todos sem filtro e com filtro de departamento; desmarcar individual", async () => {
  const opcoes = await espera("rh", "participantes_opcoes", { treinamento_id: tInst }, 200);
  const inscritos = new Set<number>([4, 2]);
  const todos = sel.filtrarOpcoes(opcoes, "", sel.TODOS_DEPARTAMENTOS, inscritos);
  const m1 = sel.selecionarTodos(new Set<number>(), todos);
  if ([...m1].sort().join() !== "1,3,5,7") throw new Error("todos os ativos (menos já inscritos): " + [...m1]);
  const producao = sel.filtrarOpcoes(opcoes, "", "Produção", new Set<number>());
  const m2 = sel.selecionarTodos(new Set<number>(), producao);
  if ([...m2].sort().join() !== "2,3,5") throw new Error("só Produção: " + [...m2]);
  const m3 = sel.alternar(m2, 3);
  if ([...m3].sort().join() !== "2,5") throw new Error("desmarcar individual: " + [...m3]);
  if (sel.filtrarOpcoes(opcoes, "eva", sel.TODOS_DEPARTAMENTOS, new Set()).map((o: any) => o.id).join() !== "5") throw new Error("busca por nome");
  if (sel.departamentosDe(opcoes).join() !== "Logística,Produção,Qualidade,Recursos Humanos") throw new Error("departamentos: " + sel.departamentosDe(opcoes));
});

console.log("Necessidades × treinamento");
await t("5–6. RH vincula (já validada): VALIDADA → PLANEJADA porque o treinamento está planejado", async () => {
  await espera("rh", "necessidades_vincular", { treinamento_id: tGe, necessidade_ids: [1, 2] }, 200);
  const v = await q(`select situacao from public.peopleflow_dev_treinamento_necessidades where treinamento_id=${tGe} and ativo`);
  if (v.length !== 2 || v.some((x) => x.situacao !== "validada")) throw new Error(JSON.stringify(v));
  if ((await nec(1)).status !== "planejada" || (await nec(2)).status !== "planejada") throw new Error(JSON.stringify([await nec(1), await nec(2)]));
  await espera("rh", "treinamento_planejar", { id: tGe }, 422); // não existe mais etapa de planejar: já nasce planejado
  await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: tGe, titulo: "Montagem da sonda", responsavel_colaborador_id: 7, exige_eficacia: true, eficacia_prazo: hoje }), 200);
});
await t("7. participantes das necessidades entram automaticamente", async () => {
  const p = await q(`select colaborador_id, origem_inclusao from public.peopleflow_dev_participantes where treinamento_id=${tGe} and removido_em is null order by colaborador_id`);
  const eva = p.find((x) => Number(x.colaborador_id) === 5);
  if (!eva || eva.origem_inclusao !== "lnt") throw new Error(JSON.stringify(p));
});

console.log("Execução e presença");
let tokenQr = "";
await t("início pelo responsável; 9. QR gerado (mesmo token enquanto válido)", async () => {
  await espera("resp", "qr_gerar", { treinamento_id: tGe }, 422);
  await espera("resp", "treinamento_iniciar", { id: tGe }, 200);
  const a = await espera("resp", "qr_gerar", { treinamento_id: tGe }, 200);
  const b = await espera("resp", "qr_gerar", { treinamento_id: tGe }, 200);
  if (a.token.length < 40 || a.token !== b.token) throw new Error("token");
  tokenQr = a.token;
});
await t("10. participante confirma presença pelo QR (identificado pelo e-mail corporativo)", async () => {
  const i = await espera("p3", "presenca_info", { token: tokenQr }, 200);
  if (i.situacao !== "pendente" || i.primeiro_nome !== "Caio" || "treinamento_id" in i || "id" in i) throw new Error(JSON.stringify(i));
  const c = await espera("p3", "presenca_confirmar", { token: tokenQr }, 200);
  const p = await part(tGe, 3);
  if (c.situacao !== "confirmada" || p.presenca_status !== "presente" || p.presenca_metodo !== "qr" || !p.presenca_em) throw new Error(JSON.stringify(p));
});
await t("11. presença duplicada bloqueada (sem novo registro)", async () => {
  const antes = (await part(tGe, 3)).presenca_em;
  await espera("p3", "presenca_confirmar", { token: tokenQr }, 200);
  if (String((await part(tGe, 3)).presenca_em) !== String(antes) || (await aud("presenca_qr")) !== 1) throw new Error("duplicou");
});
await t("QR: sem acesso, token inválido/expirado/encerrado", async () => {
  await espera("semacesso", "presenca_info", { token: tokenQr }, 403);
  await espera("", "presenca_info", { token: tokenQr }, 401);
  await espera("p3", "presenca_info", { token: "x".repeat(43) }, 404);
  await db.exec(`update public.peopleflow_dev_qr_tokens set expira_em = now() - interval '1 minute' where treinamento_id=${tGe}`);
  await espera("p3", "presenca_info", { token: tokenQr }, 404);
  const novo = await espera("resp", "qr_gerar", { treinamento_id: tGe }, 200);
  if (novo.token === tokenQr) throw new Error("não renovou");
  tokenQr = novo.token;
});
await t("QR: pessoa não inscrita é informada (sem registrar)", async () => {
  const p4 = await part(tGe, 4);
  await espera("resp", "participante_remover", { participante_id: p4.id, motivo: "Turma errada" }, 200);
  if ((await espera("p4", "presenca_confirmar", { token: tokenQr }, 200)).situacao !== "nao_inscrito") throw new Error("inscrição");
  await espera("resp", "qr_encerrar", { treinamento_id: tGe }, 200);
  await espera("p3", "presenca_info", { token: tokenQr }, 404);
});
await t("12. presença manual pelo responsável ou pelo gestor da gestão (com origem/justificativa)", async () => {
  const p5 = await part(tGe, 5);
  await espera("resp", "presenca_manual", { treinamento_id: tGe, participante_ids: [p5.id], presenca: "ausente" }, 422);
  // O gestor que registrou o treinamento também conduz o registro operacional (a partir desta entrega); a presença segue exigindo justificativa.
  await espera("gestor", "presenca_manual", { treinamento_id: tGe, participante_ids: [p5.id], presenca: "ausente" }, 422);
  await espera("gestor", "presenca_manual", { treinamento_id: tGe, participante_ids: [p5.id], presenca: "ausente", motivo: "Lista de presença física" }, 200);
  await espera("resp", "presenca_manual", { treinamento_id: tGe, participante_ids: [p5.id], presenca: "ausente", motivo: "Lista de presença física" }, 200);
  const d = await part(tGe, 5);
  const a = await q("select detalhe from public.peopleflow_dev_auditoria where acao='presenca_manual' order by id desc limit 1");
  if (d.presenca_status !== "ausente" || d.presenca_metodo !== "manual" || d.presenca_motivo !== "Lista de presença física" || a[0].detalhe.presenca.antes !== "pendente") throw new Error(JSON.stringify([d, a]));
});
await t("13. evidência: URL de envio → arquivo → registro; acesso controlado", async () => {
  await espera("resp", "evidencia_upload_url", { treinamento_id: tGe, tipo: "ata", file_name: "ata.exe", mime: "application/x-msdownload", tamanho_bytes: 10 }, 422);
  await espera("resp", "evidencia_upload_url", { treinamento_id: tGe, tipo: "lista_presenca", file_name: "Lista.pdf", mime: "application/pdf", tamanho_bytes: 1200 }, 422);
  const u = await espera("resp", "evidencia_upload_url", { treinamento_id: tGe, tipo: "ata", file_name: "Ata da reunião.pdf", mime: "application/pdf", tamanho_bytes: 1200 }, 200);
  if (!u.path.startsWith(`treinamentos/${tGe}/`)) throw new Error(u.path);
  await espera("resp", "evidencia_registrar", { treinamento_id: tGe, path: u.path, tipo: "ata", file_name: "Ata da reunião.pdf" }, 422);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 1200, "application/pdf");
  await espera("resp", "evidencia_registrar", { treinamento_id: tPop, path: u.path, tipo: "ata", file_name: "x.pdf" }, 403);
  await espera("resp", "evidencia_registrar", { treinamento_id: tGe, path: u.path, tipo: "lista_presenca", file_name: "Lista.pdf" }, 422);
  const ev = await espera("resp", "evidencia_registrar", { treinamento_id: tGe, path: u.path, tipo: "ata", file_name: "Ata da reunião.pdf" }, 200);
  const g = await espera("gestor", "evidencia_url", { id: ev.id }, 200);
  if (!/assinada/.test(g.url)) throw new Error(JSON.stringify(g));
  await espera("p4", "evidencia_url", { id: ev.id }, 401);
});

console.log("Conclusão com faltantes, eficácia e necessidades");
await t("L10. leituras de QR e registros não geram lista antes da conclusão", async () => {
  if ((await listas(tGe)).length !== 0) throw new Error("lista gerada antes da conclusão");
});
await t("conclusão exige presença definida para todos", async () => {
  await espera("rh", "participantes_adicionar", { treinamento_id: tGe, colaborador_ids: [4] }, 200); // restaura o retirado
  await espera("rh", "treinamento_concluir", { id: tGe }, 422);
  const p4 = await part(tGe, 4);
  await espera("rh", "participante_remover", { participante_id: p4.id }, 422);
  await espera("rh", "participante_remover", { participante_id: p4.id, motivo: "Inscrito por engano" }, 200);
});
await t("R12/R13/19. conclusão com faltantes: presente aguarda eficácia; necessidade do AUSENTE não é encerrada (segue PLANEJADA)", async () => {
  await espera("rh", "treinamento_concluir", { id: tGe }, 200);
  const t0 = (await q(`select status from public.peopleflow_dev_treinamentos where id=${tGe}`))[0];
  if (t0.status !== "concluido") throw new Error("não concluiu");
  if ((await nec(1)).status !== "planejada") throw new Error("presente sem eficácia não pode ser atendida: " + JSON.stringify(await nec(1)));
  if ((await nec(2)).status !== "planejada") throw new Error("ausente deve seguir PLANEJADA (pendente): " + JSON.stringify(await nec(2)));
  const h = await q(`select colaborador_id from public.peopleflow_dev_v_historico where treinamento_id=${tGe}`);
  if (h.length !== 1 || Number(h[0].colaborador_id) !== 3) throw new Error("ausente não pode constar como treinado: " + JSON.stringify(h));
});
await t("L2/L3/L4/L5/L7. conclusão gera a Lista de Presença (presentes + ausentes, QR e manual) no bucket privado", async () => {
  const ls = await listas(tGe);
  if (ls.length !== 1) throw new Error(JSON.stringify(ls));
  const l = ls[0];
  if (!/^treinamentos\/\d+\/sistema\/lista-presenca-v1-/.test(l.storage_path) || l.participante_id !== null || l.substituida_em) throw new Error(JSON.stringify(l));
  if (l.observacao !== "Gerada automaticamente pelo PeopleFlow · versão 1 · 1 presente • 1 ausente") throw new Error(l.observacao);
  const obj = fake.storage.objetos.get(`desenvolvimento-evidencias/${l.storage_path}`);
  if (!obj || obj.mimetype !== "application/pdf") throw new Error("não armazenado no bucket privado do Desenvolvimento");
  const bytes = pdfDe(l.storage_path);
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("não é PDF");
  const txt = textoDoPdf(bytes);
  for (const esperado of ["LISTA DE PRESENÇA", "MONTAGEM DA SONDA", "Desenvolvimento", "Interno", NOMES[3], "QR Code", NOMES[5], "Ausente", "Presente", "Registro manual", "Lista de presença física", NOMES[7]]) {
    if (!txt.includes(esperado)) throw new Error(`PDF sem "${esperado}"`);
  }
  if (txt.includes(NOMES[4])) throw new Error("participante retirado não entra na lista");
  if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt)) throw new Error("CPF no PDF");
  const a = await q("select detalhe from public.peopleflow_dev_auditoria where acao='lista_presenca_gerada' order by id");
  if (a.length !== 1 || a[0].detalhe.origem !== "sistema" || a[0].detalhe.versao !== 1 || a[0].detalhe.sha256.length !== 64 || a[0].detalhe.ausentes !== 1) throw new Error(JSON.stringify(a));
});
await t("Lista de presença com turma grande: paginação com cabeçalho repetido e rodapé em todas as páginas", async () => {
  const { gerarPdfListaPresenca } = await import(pathToFileURL(`${PF}/api/_lib/listaPresencaPdf.ts`).href);
  const { PDFDocument } = await import(pathToFileURL(`${PF}/node_modules/pdf-lib/cjs/index.js`).href);
  const participantes = Array.from({ length: 70 }, (_, i) => ({ nome: `Colaborador Número ${String(i + 1).padStart(2, "0")}`, cargo: "Operador de Produção Sênior", departamento: "Produção", situacao: i % 9 === 0 ? "Ausente" : "Presente", forma: i % 2 ? "QR Code" : "Registro manual", confirmadoEm: "08/10/2026 às 14:05", registradoPor: i % 2 ? null : "Ana Recursos", justificativa: i % 2 ? null : "Lista física assinada" }));
  const bytes = await gerarPdfListaPresenca({ codigo: "TRN-2026-9999", titulo: "PROGRAMA CONEXÃO MSB — TURMA ÚNICA COM TÍTULO BEM LONGO PARA TESTAR A QUEBRA DE LINHA", tipo: "Revisão de POP", modalidade: "Interno", formato: "Presencial", dataRealizacao: "08/10/2026", cargaRealizada: "2h", local: "Auditório", responsavel: "Ana Recursos", instrutor: "Fabio Instrutor", documento: { codigo: "POP-RH-002", titulo: "GESTÃO DE CONHECIMENTO", revisao: "05" }, reposicao: null, participantes, versao: 2, motivoVersao: "Retificação de presença: teste", geradoEm: "08/10/2026 às 15:00", geradoPor: "Ana Recursos", codigoVerificacao: "ABCD-1234-EF56-7890" });
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() < 3) throw new Error("esperava várias páginas: " + doc.getPageCount());
  const txt = textoDoPdf(bytes);
  if ((txt.match(/Nome do colaborador/g) ?? []).length < 2) throw new Error("cabeçalho da tabela não se repete");
  if (!txt.includes(`Página ${doc.getPageCount()} de ${doc.getPageCount()}`) || !txt.includes("Colaborador Número 70") || !txt.includes("GESTÃO DE CONHECIMENTO")) throw new Error("conteúdo/rodapé");
});
await t("L8/L9. visualização só autorizada, por link temporário; lista do sistema não é substituível à mão", async () => {
  const [l] = await listas(tGe);
  const v = await espera("rh", "evidencia_url", { id: l.id, visualizar: true }, 200);
  if (!v.url.includes("/sistema/") || v.url.includes("download")) throw new Error(JSON.stringify(v));
  await espera("gestor", "evidencia_url", { id: l.id, visualizar: true }, 200); // gestor do participante
  await espera("resp", "evidencia_url", { id: l.id }, 200); // responsável
  await espera("p4", "evidencia_url", { id: l.id }, 401); // sem acesso ao módulo
  await espera("rh", "evidencia_substituir", { id: l.id, motivo: "tentar trocar" }, 422);
  await espera("rh", "evidencia_registrar", { treinamento_id: tGe, path: l.storage_path, tipo: "ata", file_name: "copia.pdf" }, 422);
  await espera("rh", "lista_presenca_gerar", { treinamento_id: tGe }, 422); // já existe: nova versão exige motivo
  await espera("gestor", "lista_presenca_gerar", { treinamento_id: tGe, motivo: "x" }, 403);
});
await t("15/17/18. eficácia: gestor do participante registra; ausente não é avaliado; só \"eficaz\" atende", async () => {
  const p3 = await part(tGe, 3), p5 = await part(tGe, 5);
  await espera("resp", "eficacia_registrar", { participante_id: p3.id, resultado: "eficaz" }, 403);
  await espera("gestor", "eficacia_registrar", { participante_id: p5.id, resultado: "eficaz" }, 422);
  await espera("gestor", "eficacia_registrar", { participante_id: p3.id, resultado: "nao_eficaz" }, 422);
  await espera("gestor", "eficacia_registrar", { participante_id: p3.id, resultado: "eficaz", observacao: "Aplicando na linha" }, 200);
  const n = await nec(1);
  if (n.status !== "atendida" || Number(n.atendida_treinamento_id) !== tGe) throw new Error(JSON.stringify(n));
  if ((await nec(2)).status !== "planejada") throw new Error("necessidade do ausente foi alterada");
});

console.log("Reposição para faltantes");
let rep1 = 0, rep2 = 0;
await t("R14. faltantes: somente os ausentes do treinamento concluído", async () => {
  await espera("gestor", "reposicao_faltantes", { treinamento_id: tGe }, 200); // gestão que registrou também agenda a reposição
  await espera("gestor", "reposicao_faltantes", { treinamento_id: tPop }, 403); // não é da gestão dele
  await espera("rh", "reposicao_faltantes", { treinamento_id: tRH }, 422); // ainda não concluído
  const f = await espera("resp", "reposicao_faltantes", { treinamento_id: tGe }, 200);
  if (f.length !== 1 || f[0].colaborador_id !== 5 || f[0].nome !== NOMES[5]) throw new Error(JSON.stringify(f));
});
await t("R14/R15. reposição criada só com faltantes, pré-preenchida, com vínculo original → reposição; original intocado", async () => {
  const antes = (await q(`select * from public.peopleflow_dev_treinamentos where id=${tGe}`))[0];
  await espera("resp", "treinamento_reposicao", base("desenvolvimento", "interno", { treinamento_id: tGe, titulo: "", colaborador_ids: [3] }), 422); // 3 não faltou
  const r = await espera("resp", "treinamento_reposicao", base("desenvolvimento", "interno", { treinamento_id: tGe, titulo: "", data_inicio: hoje, responsavel_colaborador_id: 7, exige_eficacia: true, formato: "presencial" }), 200);
  rep1 = r.id;
  if (r.status !== "planejado" || Number(r.reposicao_de_id) !== tGe || Number(r.reposicao_raiz_id) !== tGe || r.reposicao_numero !== 1 || r.titulo !== antes.titulo || r.tipo !== antes.tipo || r.modalidade !== antes.modalidade) throw new Error(JSON.stringify(r));
  const ps = await q(`select colaborador_id, origem_inclusao from public.peopleflow_dev_participantes where treinamento_id=${rep1}`);
  if (ps.length !== 1 || Number(ps[0].colaborador_id) !== 5 || ps[0].origem_inclusao !== "reposicao") throw new Error(JSON.stringify(ps));
  const v = await q(`select necessidade_id, situacao from public.peopleflow_dev_treinamento_necessidades where treinamento_id=${rep1} and ativo`);
  if (v.length !== 1 || Number(v[0].necessidade_id) !== 2 || v[0].situacao !== "validada") throw new Error("necessidade do faltante não foi levada: " + JSON.stringify(v));
  const depois = (await q(`select * from public.peopleflow_dev_treinamentos where id=${tGe}`))[0];
  if (depois.status !== "concluido" || String(depois.updated_at) !== String(antes.updated_at) || (await part(tGe, 5)).presenca_status !== "ausente") throw new Error("original foi alterado");
  await espera("rh", "treinamento_reposicao", base("desenvolvimento", "interno", { treinamento_id: tGe, data_inicio: hoje }), 422); // não há mais faltantes pendentes
  if ((await aud("reposicao_criada")) !== 1) throw new Error("auditoria");
});
await t("R11. histórico: inscrição prevista na reposição não conta como realizada", async () => {
  const h = await q(`select situacao, treinamento_id from public.peopleflow_dev_v_participacoes where colaborador_id=5 order by participante_id`);
  if (h.map((x) => x.situacao).join() !== "ausente,previsto") throw new Error(JSON.stringify(h));
  const hv = await q("select count(*)::int n from public.peopleflow_dev_v_historico where colaborador_id=5");
  if (hv[0].n !== 0) throw new Error("previsto contou como realizado");
});
await t("R16. nova ausência na reposição → nova reposição (cadeia original → reposição 1 → reposição 2)", async () => {
  if ((await nec(2)).status !== "planejada") throw new Error(JSON.stringify(await nec(2)));
  await espera("resp", "treinamento_iniciar", { id: rep1 }, 200);
  await espera("resp", "participantes_adicionar", { treinamento_id: rep1, colaborador_ids: [4] }, 200); // outra área, entrou na turma
  const p5 = await part(rep1, 5), p4 = await part(rep1, 4);
  await espera("resp", "presenca_manual", { treinamento_id: rep1, participante_ids: [p5.id], presenca: "ausente", motivo: "Atestado" }, 200);
  await espera("resp", "presenca_manual", { treinamento_id: rep1, participante_ids: [p4.id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: rep1 }, 200);
  if ((await nec(2)).status !== "planejada") throw new Error("ausente de novo: deve seguir pendente");
  const f = await espera("rh", "reposicao_faltantes", { treinamento_id: rep1 }, 200);
  if (f.map((x: any) => x.colaborador_id).join() !== "5") throw new Error(JSON.stringify(f));
  const r2 = await espera("rh", "treinamento_reposicao", base("desenvolvimento", "interno", { treinamento_id: rep1, data_inicio: hoje, responsavel_colaborador_id: 7, exige_eficacia: true, planejar: true }), 200);
  rep2 = r2.id;
  if (r2.status !== "planejado" || Number(r2.reposicao_de_id) !== rep1 || Number(r2.reposicao_raiz_id) !== tGe || r2.reposicao_numero !== 2) throw new Error(JSON.stringify(r2));
});
await t("R17/R10. ausente que realiza a reposição passa a ter realização válida; necessidade ATENDIDA após eficácia", async () => {
  await espera("resp", "treinamento_iniciar", { id: rep2 }, 200);
  const p5 = await part(rep2, 5);
  await espera("resp", "presenca_manual", { treinamento_id: rep2, participante_ids: [p5.id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: rep2 }, 200);
  if ((await nec(2)).status !== "planejada") throw new Error("eficácia obrigatória: ainda não pode ser atendida");
  await espera("gestor", "eficacia_registrar", { participante_id: p5.id, resultado: "eficaz", observacao: "" }, 200);
  const n = await nec(2);
  if (n.status !== "atendida" || Number(n.atendida_treinamento_id) !== rep2) throw new Error(JSON.stringify(n));
  const h = await q("select treinamento_id from public.peopleflow_dev_v_historico where colaborador_id=5");
  if (h.length !== 1 || Number(h[0].treinamento_id) !== rep2) throw new Error(JSON.stringify(h));
});
await t("L10. cada reposição tem a sua Lista de Presença; a do original não muda", async () => {
  const [o] = await listas(tGe);
  if (o.substituida_em) throw new Error("lista do original foi substituída pela reposição");
  const [l1] = await listas(rep1), [l2] = await listas(rep2);
  if (!l1 || !l2 || l1.storage_path === l2.storage_path) throw new Error("reposições sem lista própria");
  const t1 = textoDoPdf(pdfDe(l1.storage_path)), t2 = textoDoPdf(pdfDe(l2.storage_path));
  if (!t1.includes("Reposição 1") || !t2.includes("Reposição 2") || !t1.includes(NOMES[4]) || t2.includes(NOMES[4]) || !t2.includes(NOMES[5])) throw new Error("conteúdo das reposições");
  if (l1.observacao !== "Gerada automaticamente pelo PeopleFlow · versão 1 · 1 presente • 1 ausente" || l2.observacao !== "Gerada automaticamente pelo PeopleFlow · versão 1 · 1 presente • 0 ausentes") throw new Error(l1.observacao + " | " + l2.observacao);
});
await t("R18. histórico preserva original e reposições (ausente → realizado depois em reposição)", async () => {
  const h = await q(`select treinamento_id, situacao, reposto_em_treinamento_id, treinamento_raiz_id, reposicao_numero from public.peopleflow_dev_v_participacoes where colaborador_id=5 order by treinamento_id`);
  const esperado = [
    [tGe, "ausente", rep2, tGe, null],
    [rep1, "ausente", rep2, tGe, 1],
    [rep2, "realizado_reposicao", null, tGe, 2],
  ];
  const obtido = h.map((x) => [Number(x.treinamento_id), x.situacao, x.reposto_em_treinamento_id === null ? null : Number(x.reposto_em_treinamento_id), Number(x.treinamento_raiz_id), x.reposicao_numero]);
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) throw new Error(JSON.stringify(obtido));
  const tres = await q(`select id, status from public.peopleflow_dev_treinamentos where id in (${tGe},${rep1},${rep2}) order by id`);
  if (tres.some((x) => x.status !== "concluido")) throw new Error("cada realização é registro próprio concluído");
  const caio = await q(`select situacao from public.peopleflow_dev_v_participacoes where colaborador_id=3 and treinamento_id=${tGe}`);
  if (caio[0].situacao !== "realizado") throw new Error(JSON.stringify(caio));
});

console.log("Demais regras");
await t("presença após conclusão: responsável não altera; RH retifica com justificativa (auditado)", async () => {
  const p3 = await part(tGe, 3);
  await espera("resp", "presenca_manual", { treinamento_id: tGe, participante_ids: [p3.id], presenca: "ausente", motivo: "x" }, 403);
  await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: tGe, titulo: "Montagem da sonda 2", data_inicio: hoje, responsavel_colaborador_id: 7, exige_eficacia: true }), 422);
  const r = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: tGe, titulo: "Montagem da sonda", data_inicio: hoje, responsavel_colaborador_id: 7, exige_eficacia: true, local_link: "Sala 2", motivo: "Local faltando" }), 200);
  if (r.local_link !== "Sala 2" || (await aud("treinamento_retificado")) !== 1) throw new Error("retificação");
});
await t("L11. retificação de presença gera NOVA versão; a anterior fica preservada (arquivo + registro + auditoria)", async () => {
  // A retificação do treinamento acima (local) já gerou a versão 2.
  const p5 = await part(tGe, 5);
  await espera("rh", "presenca_manual", { treinamento_id: tGe, participante_ids: [p5.id], presenca: "presente", motivo: "Assinou a lista física, lançado como ausente por engano" }, 200);
  const ls = await listas(tGe);
  if (ls.length !== 3 || ls.filter((l) => !l.substituida_em).length !== 1) throw new Error(JSON.stringify(ls));
  const [v1, v2, v3] = ls;
  if (!v1.substituida_motivo.includes("versão 2") || !v1.substituida_motivo.includes("Local faltando") || !v2.substituida_motivo.includes("Assinou a lista física")) throw new Error(JSON.stringify(ls));
  if (!v3.storage_path.includes("-v3-") || v3.observacao !== "Gerada automaticamente pelo PeopleFlow · versão 3 · 2 presentes • 0 ausentes") throw new Error(JSON.stringify(v3));
  for (const l of ls) pdfDe(l.storage_path); // todas as versões continuam no bucket
  const t3 = textoDoPdf(pdfDe(v3.storage_path));
  if (!t3.includes("Versão 3") || !t3.includes("Assinou a lista física")) throw new Error("PDF da nova versão sem o motivo");
  const a = await q(`select detalhe from public.peopleflow_dev_auditoria where acao='lista_presenca_gerada' and (detalhe->>'treinamento_id')::int=${tGe} order by id`);
  if (a.map((x) => x.detalhe.versao).join() !== "1,2,3" || JSON.stringify(a[2].detalhe.substitui) !== JSON.stringify([Number(v2.id)])) throw new Error(JSON.stringify(a));
  if ((await aud("presenca_retificada")) !== 1) throw new Error("retificação de presença sem auditoria");
  // o RH pode gerar nova versão manual, sempre com motivo
  await espera("rh", "lista_presenca_gerar", { treinamento_id: tGe, motivo: "Cadastro de cargo corrigido" }, 200);
  if ((await listas(tGe)).length !== 4) throw new Error("versão manual");
});
await t("16. sem eficácia obrigatória: conclusão já atende a necessidade de quem realizou", async () => {
  await espera("rh", "necessidades_vincular", { treinamento_id: tRH, necessidade_ids: [4] }, 200);
  if ((await nec(4)).status !== "planejada") throw new Error(JSON.stringify(await nec(4)));
  await espera("rh", "treinamento_iniciar", { id: tRH }, 200);
  const p = await part(tRH, 3);
  await espera("rh", "presenca_manual", { treinamento_id: tRH, participante_ids: [p.id], presenca: "presente", motivo: "Lista de presença física" }, 200);
  await espera("rh", "treinamento_concluir", { id: tRH }, 200);
  if ((await nec(4)).status !== "atendida") throw new Error(JSON.stringify(await nec(4)));
});
await t("L1. treinamento com todos presentes: lista com a turma inteira e quem registrou", async () => {
  const [l] = await listas(tRH);
  if (!l || l.observacao !== "Gerada automaticamente pelo PeopleFlow · versão 1 · 1 presente • 0 ausentes") throw new Error(JSON.stringify(l));
  const txt = textoDoPdf(pdfDe(l.storage_path));
  if (!txt.includes(NOMES[3]) || !txt.includes("Registro manual") || !txt.includes("registrado por " + NOMES[1])) throw new Error("registro manual sem quem registrou");
  await espera("resp", "evidencia_url", { id: l.id }, 200); // responsável do tRH
});
await t("L6. documento controlado: código, título e REVISÃO TREINADA (fotografia, não a revisão atual)", async () => {
  await espera("rh", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [4] }, 200);
  await espera("rh", "treinamento_iniciar", { id: tPop }, 200);
  // Documento revisado DEPOIS do início: o treinamento mantém a revisão efetivamente treinada.
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='04' where codigo='P-PR-001'");
  const p = await part(tPop, 4);
  await espera("rh", "presenca_manual", { treinamento_id: tPop, participante_ids: [p.id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: tPop }, 200);
  const [l] = await listas(tPop);
  const txt = textoDoPdf(pdfDe(l.storage_path));
  if (!txt.includes("Revisão de POP") || !txt.includes("P-PR-001") || !txt.includes("Montagem da sonda")) throw new Error("documento ausente no PDF");
  if (!/REVISÃO TREINADA\n03\n/.test(txt)) throw new Error("revisão treinada deveria ser 03 (a atual é 04)");
  // Gestor sem liderado nesta turma e responsável de outro treinamento: sem acesso.
  await espera("gestor", "evidencia_url", { id: l.id }, 403);
  await espera("resp", "evidencia_url", { id: l.id }, 403);
});
await t("14. modalidade Externo: sem QR, realização manual e evidência obrigatória", async () => {
  const e = await espera("rh", "treinamento_salvar", base("qualidade_regulatorio", "externo", { titulo: "Congresso de qualidade", formato: "online", instrutor_externo: "Sociedade X", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  tExt = e.id;
  await espera("rh", "necessidades_vincular", { treinamento_id: e.id, necessidade_ids: [3] }, 200);
  const p = await part(e.id, 4);
  await espera("rh", "presenca_manual", { treinamento_id: e.id, participante_ids: [p.id], presenca: "presente", motivo: "Treinamento externo — certificado" }, 200);
  await espera("rh", "treinamento_realizacao", { id: e.id, data_realizacao: hoje }, 200); // externo sem início no sistema: a data efetiva é informada
  await espera("rh", "treinamento_concluir", { id: e.id }, 422);
  const u = await espera("rh", "evidencia_upload_url", { treinamento_id: e.id, participante_id: p.id, tipo: "certificado", file_name: "certificado.pdf", mime: "application/pdf", tamanho_bytes: 500 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 500, "application/pdf");
  await espera("rh", "evidencia_registrar", { treinamento_id: e.id, participante_id: p.id, path: u.path, tipo: "certificado", file_name: "certificado.pdf" }, 200);
  const ue = await espera("rh", "evidencia_upload_url", { treinamento_id: e.id, tipo: "lista_presenca", file_name: "lista-externa.pdf", mime: "application/pdf", tamanho_bytes: 300 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(ue.path, 300, "application/pdf");
  await espera("rh", "evidencia_registrar", { treinamento_id: e.id, path: ue.path, tipo: "lista_presenca", file_name: "lista-externa.pdf" }, 200);
  await espera("rh", "treinamento_concluir", { id: e.id }, 200);
  const ls = await listas(e.id);
  if (ls.length !== 1 || ls[0].storage_path.includes("/sistema/")) throw new Error("L12: externo usa a evidência externa, sem lista automática: " + JSON.stringify(ls));
  await espera("rh", "lista_presenca_gerar", { treinamento_id: e.id }, 422);
  if ((await nec(3)).status !== "atendida") throw new Error(JSON.stringify(await nec(3)));
  const h = await q(`select modalidade, formato, tipo from public.peopleflow_dev_v_historico where treinamento_id=${e.id}`);
  if (h[0].modalidade !== "externo" || h[0].formato !== "online" || h[0].tipo !== "qualidade_regulatorio") throw new Error("histórico deve preservar tipo/modalidade/formato: " + JSON.stringify(h));
});
await t("20. cancelamento devolve necessidade a VALIDADA (e mantém se houver outro treinamento ativo)", async () => {
  const a = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Lean A", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  const b = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Lean B", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  await db.exec("insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria) values (5,'rh','Lean','x','validada',now(),'tecnica')");
  const nId = (await q("select max(id) m from public.peopleflow_dev_necessidades"))[0].m;
  await espera("rh", "necessidades_vincular", { treinamento_id: a.id, necessidade_ids: [nId] }, 200);
  await espera("rh", "necessidades_vincular", { treinamento_id: b.id, necessidade_ids: [nId] }, 200);
  await espera("rh", "treinamento_cancelar", { id: a.id }, 422);
  await espera("rh", "treinamento_cancelar", { id: a.id, motivo: "Agenda" }, 200);
  if ((await nec(nId)).status !== "planejada") throw new Error("deveria continuar planejada (há outro ativo)");
  await espera("rh", "treinamento_cancelar", { id: b.id, motivo: "Agenda" }, 200);
  if ((await nec(nId)).status !== "validada") throw new Error(JSON.stringify(await nec(nId)));
});

console.log("Registro único, Responsável da gestão e validação de Necessidade de Desenvolvimento");
let tDel = 0, tGe2 = 0;
await t("C2. registro antigo SOLICITADO é preservado e ainda pode ser planejado pelo RH", async () => {
  await db.exec(`insert into public.peopleflow_dev_treinamentos (titulo, tipo, modalidade, status, data_inicio, responsavel_colaborador_id, solicitado_por_colaborador_id) values ('LEGADO', 'outro', 'interno', 'solicitado', current_date, 1, 2)`);
  const id = (await q("select max(id) m from public.peopleflow_dev_treinamentos"))[0].m;
  if ((await q(`select status from public.peopleflow_dev_treinamentos where id=${id}`))[0].status !== "solicitado") throw new Error("legado alterado");
  await espera("rh", "treinamento_planejar", { id }, 200);
  await espera("rh", "treinamento_cancelar", { id, motivo: "Fim do teste de compatibilidade" }, 200);
});
await t("C3. Gestor indica Responsável por Treinamentos (só da própria equipe); RH acompanha", async () => {
  await db.exec(`insert into public.peopleflow_dev_contas values ('${U.p3}', 3, 'Responsavel', now()) on conflict (user_id) do nothing`);
  await espera("p3", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Antes da indicação" }), 403); // sem indicação não registra
  await espera("gestor", "responsavel_gestao_indicar", { colaborador_id: 4 }, 403); // fora da equipe
  await espera("gestor", "responsavel_gestao_indicar", { colaborador_id: 2 }, 422); // ele mesmo
  await espera("rh", "responsavel_gestao_indicar", { colaborador_id: 3 }, 403); // indicação é do Gestor
  const r = await espera("gestor", "responsavel_gestao_indicar", { colaborador_id: 3 }, 200);
  await espera("gestor", "responsavel_gestao_indicar", { colaborador_id: 3 }, 409);
  const lg = await espera("gestor", "responsaveis_gestao_listar", {}, 200);
  const lr = await espera("rh", "responsaveis_gestao_listar", {}, 200);
  if (lg.length !== 1 || lg[0].colaborador.nome !== NOMES[3] || lr.length !== 1 || lr[0].gestor.nome !== NOMES[2]) throw new Error(JSON.stringify([lg, lr]));
  await espera("p3", "responsaveis_gestao_listar", {}, 403);
  if (!r.id || (await aud("responsavel_gestao_indicado")) !== 1) throw new Error("auditoria");
  // Sessão do indicado (o que acao=sessao grava): perfil Responsavel + escopo = equipe do Gestor que indicou.
  await db.exec("insert into public.peopleflow_dev_escopo (gestor_colaborador_id, colaborador_id) values (3,2),(3,3),(3,5)");
});
await t("C4. Responsável indicado registra (PLANEJADO), monta a turma e só vê treinamentos da gestão", async () => {
  const t1 = await espera("p3", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Registrado pelo responsável", responsavel_colaborador_id: 3 }), 200);
  tDel = t1.id;
  if (t1.status !== "planejado" || Number(t1.solicitado_por_colaborador_id) !== 3) throw new Error(JSON.stringify(t1));
  await espera("p3", "treinamento_salvar", base("capacitacao_tecnica", "interno", { titulo: "Teste", homologacao: true }), 403); // homologação só RH
  await espera("p3", "participantes_adicionar", { treinamento_id: tDel, colaborador_ids: [5, 4] }, 200); // 4 = outra área (turma transversal)
  await espera("p3", "treinamento_salvar", base("capacitacao_tecnica", "interno", { id: tDel, titulo: "Registrado pelo responsável", responsavel_colaborador_id: 3, observacao: "Sala 1" }), 200);
  // treinamento registrado pelo Gestor da gestão: o responsável indicado gere
  tGe2 = (await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Do gestor", responsavel_colaborador_id: 2 }), 200)).id;
  await espera("p3", "participantes_adicionar", { treinamento_id: tGe2, colaborador_ids: [5] }, 200);
  // …e o Gestor gere o do responsável indicado (inclusive participante de outra área)
  await espera("gestor", "participantes_adicionar", { treinamento_id: tDel, colaborador_ids: [2] }, 200);
  const vg = await como(U.ge, `select colaborador_id from public.peopleflow_dev_participantes where treinamento_id=${tDel} order by 1`);
  if (vg.map((x) => Number(x.colaborador_id)).join() !== "2,4,5") throw new Error("gestor deveria ver a turma do treinamento da gestão: " + JSON.stringify(vg));
  // visão do indicado: gestão + o que conduz; nunca a empresa toda
  const vis = (await como(U.p3, "select id from public.peopleflow_dev_treinamentos")).map((x) => Number(x.id));
  if (!vis.includes(tDel) || !vis.includes(tGe2) || !vis.includes(tGe) || vis.includes(tRH) || vis.includes(tPop)) throw new Error("visão do responsável: " + JSON.stringify(vis));
  await espera("p3", "treinamento_salvar", base("outro", "interno", { id: tRH, titulo: "x" }), 403);
  await espera("p3", "participantes_adicionar", { treinamento_id: tInst, colaborador_ids: [5] }, 403); // planejado, mas fora da gestão
  await espera("p3", "treinamento_concluir", { id: tDel }, 403); // funções do RH continuam do RH
  // não ganha acesso a dados de outras áreas do módulo (Necessidades, conformidade, histórico)
  for (const sql of ["select count(*)::int n from public.peopleflow_dev_necessidades", "select count(*)::int n from public.peopleflow_dev_v_conformidade", `select count(*)::int n from public.peopleflow_dev_v_historico where treinamento_id in (${tRH}, ${tPop})`]) {
    const n = (await como(U.p3, sql))[0].n;
    if (n !== 0) throw new Error(`responsável indicado viu dados fora da Gestão de Treinamentos: ${sql} → ${n}`);
  }
});
await t("C5. indicação de Necessidade de Desenvolvimento aguarda o RH e NÃO produz efeito oficial", async () => {
  await db.exec("insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria) values (5,'gestor','Metrologia básica','x','validada',now(),'tecnica'),(5,'gestor','Planilhas','x','validada',now(),'sistemas_ferramentas'),(4,'rh','Fora da gestão','x','validada',now(),'tecnica')");
  const [nA, nB, nFora] = (await q("select id from public.peopleflow_dev_necessidades order by id desc limit 3")).map((x) => Number(x.id)).reverse();
  const op = await espera("p3", "necessidades_opcoes", { treinamento_id: tDel }, 200);
  if (op.some((o: any) => o.colaborador_id === 4) || !op.some((o: any) => o.id === nA)) throw new Error("opções devem ser só da gestão: " + JSON.stringify(op));
  await espera("p3", "necessidades_vincular", { treinamento_id: tDel, necessidade_ids: [nFora] }, 403);
  const r = await espera("p3", "necessidades_vincular", { treinamento_id: tDel, necessidade_ids: [nA, nB] }, 200);
  if (r.situacao !== "indicada") throw new Error(JSON.stringify(r));
  if ((await nec(nA)).status !== "validada") throw new Error("indicação não pode planejar a necessidade");
  const l = await espera("p3", "vinculos_listar", { treinamento_id: tDel }, 200);
  if (l.length !== 2 || l.some((x: any) => x.situacao !== "indicada") || !l[0].necessidade?.descricao || l[0].indicado_por !== NOMES[3]) throw new Error(JSON.stringify(l));
  // gestão retira a própria indicação; não mexe em validada
  await espera("p3", "necessidade_desvincular", { treinamento_id: tDel, necessidade_id: nB, motivo: "Indicada por engano" }, 200);
  await espera("rh", "necessidades_vincular", { treinamento_id: tGe2, necessidade_ids: [nB] }, 200); // RH: já validada
  await espera("gestor", "necessidade_desvincular", { treinamento_id: tGe2, necessidade_id: nB, motivo: "x" }, 403);
  (globalThis as any).__nA = nA; (globalThis as any).__nB = nB;
});
await t("C6. RH valida ou não valida; só a VALIDADA atende a Necessidade de Desenvolvimento na conclusão", async () => {
  const nA = (globalThis as any).__nA as number;
  await espera("rh", "necessidade_associacao_validar", { treinamento_id: tDel, necessidade_id: nA }, 200);
  if ((await nec(nA)).status !== "planejada") throw new Error("validada pelo RH em treinamento planejado → PLANEJADA");
  await espera("rh", "necessidade_associacao_validar", { treinamento_id: tDel, necessidade_id: nA }, 422); // já analisada
  // outra indicação, rejeitada com motivo
  await db.exec("insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria) values (5,'gestor','Oratória','x','validada',now(),'comportamental')");
  const nC = Number((await q("select max(id) m from public.peopleflow_dev_necessidades"))[0].m);
  await espera("p3", "necessidades_vincular", { treinamento_id: tDel, necessidade_ids: [nC] }, 200);
  await espera("rh", "necessidade_associacao_rejeitar", { treinamento_id: tDel, necessidade_id: nC }, 422); // motivo obrigatório
  await espera("rh", "necessidade_associacao_rejeitar", { treinamento_id: tDel, necessidade_id: nC, motivo: "Treinamento não cobre oratória" }, 200);
  const l = await espera("gestor", "vinculos_listar", { treinamento_id: tDel }, 200);
  if (l.find((x: any) => x.necessidade_id === nC)?.situacao !== "rejeitada" || l.find((x: any) => x.necessidade_id === nA)?.situacao !== "validada") throw new Error(JSON.stringify(l));
  // mais uma indicação que fica pendente até depois da conclusão
  await db.exec("insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria) values (5,'gestor','Calibração','x','validada',now(),'tecnica')");
  const nD = Number((await q("select max(id) m from public.peopleflow_dev_necessidades"))[0].m);
  await espera("gestor", "necessidades_vincular", { treinamento_id: tDel, necessidade_ids: [nD] }, 200);
  // realização e conclusão (RH conclui, como já homologado)
  await espera("p3", "treinamento_iniciar", { id: tDel }, 200); // responsável do treinamento
  await espera("p3", "treinamento_salvar", base("capacitacao_tecnica", "interno", { id: tDel, titulo: "x", responsavel_colaborador_id: 3 }), 403); // após o início, só o RH edita
  for (const c of [2, 4, 5]) await espera("p3", "presenca_manual", { treinamento_id: tDel, participante_ids: [(await part(tDel, c)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: tDel }, 200);
  if ((await nec(nA)).status !== "atendida") throw new Error("validada + realizou → ATENDIDA");
  if ((await nec(nC)).status !== "validada") throw new Error("rejeitada não pode atender");
  if ((await nec(nD)).status !== "validada") throw new Error("indicação pendente não pode atender: " + JSON.stringify(await nec(nD)));
  // validada depois da conclusão: aplica as regras a quem realizou
  await espera("rh", "necessidade_associacao_validar", { treinamento_id: tDel, necessidade_id: nD }, 200);
  if ((await nec(nD)).status !== "atendida") throw new Error("validação após a conclusão deveria atender quem realizou");
  for (const a of ["necessidades_indicadas", "necessidade_associacao_validada", "necessidade_associacao_rejeitada"]) if ((await aud(a)) === 0) throw new Error("faltou auditar " + a);
});
await t("C7. revogação da indicação retira o acesso de registro na hora", async () => {
  const [r] = await espera("gestor", "responsaveis_gestao_listar", {}, 200);
  await espera("p3", "responsavel_gestao_revogar", { id: r.id, motivo: "x" }, 403);
  await espera("gestor", "responsavel_gestao_revogar", { id: r.id }, 422); // motivo obrigatório
  await espera("gestor", "responsavel_gestao_revogar", { id: r.id, motivo: "Mudou de área" }, 200);
  await espera("p3", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Depois da revogação" }), 403);
  const esc = await q("select count(*)::int n from public.peopleflow_dev_escopo where gestor_colaborador_id=3");
  if (esc[0].n !== 0) throw new Error("escopo do indicado deveria cair");
  const rg = await q(`select ativo, revogado_motivo from public.peopleflow_dev_responsaveis_gestao where id=${r.id}`);
  if (rg[0].ativo !== false || rg[0].revogado_motivo !== "Mudou de área") throw new Error(JSON.stringify(rg));
  try { await db.exec(`delete from public.peopleflow_dev_responsaveis_gestao where id=${r.id}`); throw new Error("apagou"); } catch (e) { if ((e as Error).message === "apagou") throw e; }
});
await t("C8. homologação/teste: continua só RH e não recebe indicação de Necessidade de Desenvolvimento", async () => {
  await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "t", homologacao: true }), 403);
  const th = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Teste 5c", homologacao: true, responsavel_colaborador_id: 2 }), 200);
  await espera("gestor", "necessidades_vincular", { treinamento_id: th.id, necessidade_ids: [(globalThis as any).__nB] }, 422);
  await espera("rh", "treinamento_cancelar", { id: th.id, motivo: "Fim do teste" }, 200);
});

console.log("Homologação/teste");
let tH = 0, tHr = 0;
const audDe = async (tid: number) => q(`select acao, detalhe from public.peopleflow_dev_auditoria where (entidade='peopleflow_dev_treinamentos' and entidade_id='${tid}') or (detalhe->>'treinamento_id')='${tid}' order by id`);
await t("H1. treinamentos existentes seguem oficiais; flag padrão desmarcada; oficial não recebe marca na auditoria", async () => {
  const n = await q("select count(*)::int n from public.peopleflow_dev_treinamentos where homologacao and titulo <> 'TESTE 5C'");
  if (n[0].n !== 0) throw new Error("nenhum treinamento deveria ser teste ainda");
  const a = await audDe(tGe);
  if (a.length < 10 || a.some((x) => x.detalhe.homologacao)) throw new Error("auditoria de oficial marcada como teste");
});
await t("H15. só o RH usa a flag (Gestor não cria nem converte)", async () => {
  await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Tentativa", homologacao: true }), 403);
  const s = await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Pedido do gestor" }), 200);
  if (s.homologacao !== false) throw new Error("padrão deve ser oficial");
  await espera("gestor", "treinamento_salvar", base("desenvolvimento", "interno", { id: s.id, titulo: "Pedido do gestor", homologacao: true }), 403);
  await espera("gestor", "treinamento_cancelar", { id: s.id, motivo: "Teste de permissão" }, 200);
});
await t("H2/H3. RH cria TESTE e percorre o fluxo real: participantes, início, QR (página mostra TESTE)", async () => {
  const r = await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { lista_mestra_codigo: "I-PR-010", data_inicio: hoje, responsavel_colaborador_id: 7, planejar: true, homologacao: true }), 200);
  tH = r.id;
  if (r.homologacao !== true || r.status !== "planejado") throw new Error(JSON.stringify(r));
  await espera("rh", "participantes_adicionar", { treinamento_id: tH, colaborador_ids: [3, 5, 4] }, 200);
  await espera("resp", "treinamento_iniciar", { id: tH }, 200);
  const qr = await espera("resp", "qr_gerar", { treinamento_id: tH }, 200);
  const info = await espera("p3", "presenca_info", { token: qr.token }, 200);
  if (info.homologacao !== true) throw new Error("página de presença deve indicar TESTE");
  await espera("p3", "presenca_confirmar", { token: qr.token }, 200);
  if ((await part(tH, 3)).presenca_metodo !== "qr") throw new Error("QR");
});
await t("H4/H5. presença manual e ausência funcionam no teste", async () => {
  const p4 = await part(tH, 4), p5 = await part(tH, 5);
  await espera("resp", "presenca_manual", { treinamento_id: tH, participante_ids: [p4.id], presenca: "presente", motivo: "Lista física (teste)" }, 200);
  await espera("resp", "presenca_manual", { treinamento_id: tH, participante_ids: [p5.id], presenca: "ausente", motivo: "Faltou (teste)" }, 200);
  if ((await part(tH, 4)).presenca_metodo !== "manual" || (await part(tH, 5)).presenca_status !== "ausente") throw new Error("presença");
});
await t("H14. flag travada depois do início (servidor e banco), nos dois sentidos", async () => {
  await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { id: tH, lista_mestra_codigo: "I-PR-010", data_inicio: hoje, responsavel_colaborador_id: 7, homologacao: false }), 422);
  try { await db.exec(`update public.peopleflow_dev_treinamentos set homologacao=false where id=${tH}`); throw new Error("banco aceitou"); } catch (e) { if ((e as Error).message === "banco aceitou") throw e; }
  // oficial já realizado não vira teste
  await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: tGe, titulo: "Montagem da sonda", data_inicio: hoje, responsavel_colaborador_id: 7, exige_eficacia: true, motivo: "tentar esconder", homologacao: true }), 422);
  try { await db.exec(`update public.peopleflow_dev_treinamentos set homologacao=true where id=${tRH}`); throw new Error("banco aceitou"); } catch (e) { if ((e as Error).message === "banco aceitou") throw e; }
  // antes do início, o RH pode ajustar (oficial planejado ↔ teste)
  const pl = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Planejado", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  const a = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: pl.id, titulo: "Planejado", data_inicio: hoje, responsavel_colaborador_id: 1, homologacao: true }), 200);
  const b = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: pl.id, titulo: "Planejado", data_inicio: hoje, responsavel_colaborador_id: 1, homologacao: false }), 200);
  if (a.homologacao !== true || b.homologacao !== false) throw new Error("ajuste antes do início");
  await espera("rh", "treinamento_cancelar", { id: pl.id, motivo: "Fim do teste de permissão" }, 200);
});
await t("H10. teste não é vinculado a Necessidade (servidor e banco) e oficial com vínculo não vira teste", async () => {
  await db.exec("insert into public.peopleflow_dev_necessidades (colaborador_id,origem,descricao,justificativa,status,validada_em,categoria) values (3,'rh','Seladora','x','validada',now(),'tecnica')");
  const nId = (await q("select max(id) m from public.peopleflow_dev_necessidades"))[0].m;
  await espera("rh", "necessidades_vincular", { treinamento_id: tH, necessidade_ids: [nId] }, 422);
  try { await db.exec(`insert into public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id) values (${tH}, ${nId})`); throw new Error("banco aceitou"); } catch (e) { if ((e as Error).message === "banco aceitou") throw e; }
  const of = await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { titulo: "Oficial com necessidade", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  await espera("rh", "necessidades_vincular", { treinamento_id: of.id, necessidade_ids: [nId] }, 200);
  await espera("rh", "treinamento_salvar", base("desenvolvimento", "interno", { id: of.id, titulo: "Oficial com necessidade", data_inicio: hoje, responsavel_colaborador_id: 1, homologacao: true }), 422);
  await espera("rh", "treinamento_cancelar", { id: of.id, motivo: "Fim do teste" }, 200);
  if ((await nec(nId)).status !== "validada") throw new Error(JSON.stringify(await nec(nId)));
});
await t("H9 (antes). teste planejado/em andamento não conta como \"agendado\" na conformidade", async () => {
  await db.exec(`insert into public.peopleflow_dev_cargo_requisitos (cargo_nome, tipo_requisito, lista_mestra_codigo, obrigatorio, status, validado_em, validado_por) values ('Operador','treinamento','I-PR-010',true,'vigente',now(),'${U.rh}')`);
  const c = await como(U.rh, "select colaborador_id, situacao from public.peopleflow_dev_v_conformidade where lista_mestra_codigo='I-PR-010' and colaborador_id in (3,5) order by 1");
  if (c.map((x) => x.situacao).join() !== "pendente,pendente") throw new Error(JSON.stringify(c));
});
await t("H6/H7. conclusão do teste gera a Lista de Presença real, identificada como HOMOLOGAÇÃO/TESTE", async () => {
  await espera("rh", "treinamento_concluir", { id: tH }, 200);
  const [l] = await listas(tH);
  if (!l || !l.storage_path.includes("/sistema/")) throw new Error(JSON.stringify(l));
  const bytes = pdfDe(l.storage_path);
  const txt = textoDoPdf(bytes);
  for (const e of ["TREINAMENTO DE HOMOLOGAÇÃO/TESTE", "SEM VALIDADE COMO REGISTRO OFICIAL DE CAPACITAÇÃO", "HOMOLOGAÇÃO/TESTE · Lista de Presença", "Gerada em ", NOMES[3], "QR Code", NOMES[4], "Registro manual", NOMES[5], "Ausente", "I-PR-010", "Instrução de Trabalho", NOMES[7]]) {
    if (!txt.includes(e)) throw new Error(`PDF de teste sem "${e}"`);
  }
  const a = (await q(`select detalhe from public.peopleflow_dev_auditoria where acao='lista_presenca_gerada' and (detalhe->>'treinamento_id')::int=${tH}`))[0];
  if (a.detalhe.sha256.length !== 64 || !a.detalhe.codigo_verificacao || a.detalhe.homologacao !== true) throw new Error(JSON.stringify(a));
  await espera("rh", "evidencia_url", { id: l.id, visualizar: true }, 200);
});
await t("H8/H9/H11. teste fora do histórico oficial, das participações e da conformidade (base dos indicadores)", async () => {
  const h = await q(`select count(*)::int n from public.peopleflow_dev_v_historico where treinamento_id=${tH}`);
  const pp = await q(`select count(*)::int n from public.peopleflow_dev_v_participacoes where treinamento_id=${tH}`);
  if (h[0].n !== 0 || pp[0].n !== 0) throw new Error(`histórico ${h[0].n} / participações ${pp[0].n}`);
  const c3 = await como(U.rh, "select situacao from public.peopleflow_dev_v_conformidade where lista_mestra_codigo='I-PR-010' and colaborador_id=3");
  if (c3[0].situacao !== "pendente") throw new Error("teste contou para a conformidade: " + JSON.stringify(c3));
  // controle: um treinamento OFICIAL do mesmo documento conta normalmente
  const of = await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { lista_mestra_codigo: "I-PR-010", data_inicio: hoje, responsavel_colaborador_id: 1, planejar: true }), 200);
  await espera("rh", "participantes_adicionar", { treinamento_id: of.id, colaborador_ids: [5] }, 200);
  await espera("rh", "treinamento_iniciar", { id: of.id }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: of.id, participante_ids: [(await part(of.id, 5)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: of.id }, 200);
  const c5 = await como(U.rh, "select situacao from public.peopleflow_dev_v_conformidade where lista_mestra_codigo='I-PR-010' and colaborador_id=5");
  if (!["em_dia", "a_vencer"].includes(c5[0].situacao)) throw new Error("controle oficial deveria contar: " + JSON.stringify(c5));
  const sit3 = (await como(U.rh, "select situacao from public.peopleflow_dev_v_conformidade where lista_mestra_codigo='I-PR-010' and colaborador_id=3"))[0].situacao;
  if (sit3 !== "pendente") throw new Error("colaborador só com teste deve seguir pendente");
});
await t("H2. retificação no teste gera nova versão da lista (com aviso de TESTE)", async () => {
  const p5 = await part(tH, 5);
  await espera("rh", "presenca_manual", { treinamento_id: tH, participante_ids: [p5.id], presenca: "presente", motivo: "Retificação de teste" }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: tH, participante_ids: [p5.id], presenca: "ausente", motivo: "Volta para ausente (teste)" }, 200);
  const ls = await listas(tH);
  if (ls.length !== 3 || ls.filter((l) => !l.substituida_em).length !== 1) throw new Error(JSON.stringify(ls));
  if (!textoDoPdf(pdfDe(ls[2].storage_path)).includes("TREINAMENTO DE HOMOLOGAÇÃO/TESTE")) throw new Error("nova versão sem aviso");
});
await t("H12. reposição herda TESTE (não pode ser retirado), tem lista própria e fica fora do oficial", async () => {
  const r = await espera("resp", "treinamento_reposicao", base("instrucao_trabalho", "interno", { treinamento_id: tH, lista_mestra_codigo: "I-PR-010", data_inicio: hoje, responsavel_colaborador_id: 7, homologacao: false }), 200);
  tHr = r.id;
  if (r.homologacao !== true || Number(r.reposicao_de_id) !== tH) throw new Error(JSON.stringify(r));
  await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { id: tHr, lista_mestra_codigo: "I-PR-010", data_inicio: hoje, responsavel_colaborador_id: 7, homologacao: false }), 422);
  try { await db.exec(`update public.peopleflow_dev_treinamentos set homologacao=false where id=${tHr}`); throw new Error("banco aceitou"); } catch (e) { if ((e as Error).message === "banco aceitou") throw e; }
  await espera("resp", "treinamento_iniciar", { id: tHr }, 200);
  await espera("resp", "presenca_manual", { treinamento_id: tHr, participante_ids: [(await part(tHr, 5)).id], presenca: "presente", motivo: "Reposição (teste)" }, 200);
  await espera("rh", "treinamento_concluir", { id: tHr }, 200);
  const [l] = await listas(tHr);
  const txt = textoDoPdf(pdfDe(l.storage_path));
  if (!txt.includes("TREINAMENTO DE HOMOLOGAÇÃO/TESTE") || !txt.includes("Reposição 1")) throw new Error("lista da reposição de teste");
  const h = await q(`select count(*)::int n from public.peopleflow_dev_v_historico where treinamento_id in (${tH},${tHr})`);
  const pp = await q(`select count(*)::int n from public.peopleflow_dev_v_participacoes where treinamento_id in (${tH},${tHr})`);
  if (h[0].n + pp[0].n !== 0) throw new Error("reposição de teste entrou no oficial");
});
await t("H13. auditoria preserva TODAS as ações do teste, marcadas como homologação", async () => {
  for (const tid of [tH, tHr]) {
    const a = await audDe(tid);
    if (a.length === 0 || a.some((x) => x.detalhe.homologacao !== true)) throw new Error(`registro sem marca de teste em ${tid}: ` + JSON.stringify(a.filter((x) => !x.detalhe.homologacao).map((x) => x.acao)));
  }
  const acoesH = new Set((await audDe(tH)).map((x) => x.acao));
  for (const e of ["treinamento_planejado", "participantes_incluidos", "treinamento_iniciado", "qr_gerado", "presenca_qr", "presenca_manual", "treinamento_concluido", "lista_presenca_gerada", "presenca_retificada"]) if (!acoesH.has(e)) throw new Error("faltou auditar " + e);
  const acoesR = new Set((await audDe(tHr)).map((x) => x.acao));
  for (const e of ["reposicao_criada", "treinamento_concluido", "lista_presenca_gerada"]) if (!acoesR.has(e)) throw new Error("reposição: faltou " + e);
  try { await db.exec(`delete from public.peopleflow_dev_treinamentos where id=${tH}`); throw new Error("apagou"); } catch (e) { if ((e as Error).message === "apagou") throw e; }
});

console.log("Habilidades e Requisitos (gaps)");
const fr = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/filtrosRequisitos.ts`).href);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const conf = async (uid: string, colab: number, codigo: string) => (await como(uid, `select situacao, revisao_atual, revisao_realizada, validade_ate from public.peopleflow_dev_v_conformidade where colaborador_id=${colab} and lista_mestra_codigo='${codigo}'`))[0];
let reqRev = 0;
await t("G7/G8. Nova revisão: gap só quando o requisito exige novo treinamento; compara revisão treinada × vigente", async () => {
  // Davi (Conferente) foi treinado em P-PR-001 rev. 03 (tPop); a Lista Mestra está na rev. 04.
  const r = await espera("rh", "requisito_salvar", { cargo_nome: "Conferente", tipo_requisito: "treinamento", lista_mestra_codigo: "P-PR-001", obrigatorio: true, recicla_na_revisao: true, status: "vigente" }, 200);
  reqRev = r.id;
  if (r.recicla_na_revisao !== true) throw new Error("flag não gravada: " + JSON.stringify(r));
  const c = await conf(U.rh, 4, "P-PR-001");
  if (c.situacao !== "revisao_pendente" || c.revisao_atual !== "04" || c.revisao_realizada !== "03") throw new Error(JSON.stringify(c));
  if (!fr.FILTROS_GAP.find((f: any) => f.rotulo === "Nova revisão").situacoes.includes("revisao_pendente")) throw new Error("filtro Nova revisão");
  // Sem a regra "exige novo treinamento", a nova revisão NÃO vira gap (não se assume retreinamento).
  await espera("rh", "requisito_salvar", { id: reqRev, cargo_nome: "Conferente", tipo_requisito: "treinamento", lista_mestra_codigo: "P-PR-001", obrigatorio: true, recicla_na_revisao: false }, 200);
  if ((await conf(U.rh, 4, "P-PR-001")).situacao !== "em_dia") throw new Error("sem a regra deveria estar atendido");
  await espera("rh", "requisito_salvar", { id: reqRev, cargo_nome: "Conferente", tipo_requisito: "treinamento", lista_mestra_codigo: "P-PR-001", obrigatorio: true, recicla_na_revisao: true }, 200);
  // o histórico continua com a revisão efetivamente treinada
  const h = await q("select lista_mestra_revisao from public.peopleflow_dev_v_historico where colaborador_id=4 and lista_mestra_codigo='P-PR-001'");
  if (h[0]?.lista_mestra_revisao !== "03") throw new Error("snapshot da revisão treinada alterado");
});
await t("G4/G9/G10. Pendente (nunca atendido) é gap; Atendido não é gap e aparece na visão do colaborador", async () => {
  await espera("rh", "requisito_salvar", { cargo_nome: "Conferente", tipo_requisito: "treinamento", lista_mestra_codigo: "POP-QA-020", obrigatorio: true, status: "vigente" }, 200);
  if ((await conf(U.rh, 4, "POP-QA-020")).situacao !== "pendente") throw new Error("deveria estar pendente");
  // requisito atendido (sem nova revisão exigida) — Lista Mestra de volta à revisão treinada
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='03' where codigo='P-PR-001'");
  const at = await conf(U.rh, 4, "P-PR-001");
  if (at.situacao !== "em_dia" || fr.ehGap("em_dia")) throw new Error("atendido não pode ser gap: " + JSON.stringify(at));
  const todos = (await q("select situacao from public.peopleflow_dev_v_conformidade where colaborador_id=4")).map((x) => x.situacao);
  if (!todos.includes("em_dia") || !todos.includes("pendente")) throw new Error("visão por colaborador deve mostrar atendido e gaps: " + todos);
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='04' where codigo='P-PR-001'");
});
await t("G5/G6/G12/G13. Vencido, A vencer; ausente não atende; reposição válida atende", async () => {
  await espera("rh", "requisito_salvar", { cargo_nome: "Técnico", tipo_requisito: "treinamento", lista_mestra_codigo: "I-PR-010", obrigatorio: true, periodicidade_meses: 1, status: "vigente" }, 200);
  await espera("rh", "requisito_salvar", { cargo_nome: "Analista de RH", tipo_requisito: "treinamento", lista_mestra_codigo: "I-PR-010", obrigatorio: true, periodicidade_meses: 1, status: "vigente" }, 200);
  // realizado há 60 dias, validade 1 mês: Fabio presente (→ vencido); Ana ausente (→ continua pendente)
  const a = await espera("rh", "treinamento_salvar", base("instrucao_trabalho", "interno", { lista_mestra_codigo: "I-PR-010" }), 200);
  await db.exec(`update public.peopleflow_dev_treinamentos set data_inicio='${diasAtras(60)}', data_realizacao='${diasAtras(60)}' where id=${a.id}`); // simula dado histórico (data efetiva informada)
  await espera("rh", "participantes_adicionar", { treinamento_id: a.id, colaborador_ids: [7, 1] }, 200);
  await espera("rh", "treinamento_iniciar", { id: a.id }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: a.id, participante_ids: [(await part(a.id, 7)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: a.id, participante_ids: [(await part(a.id, 1)).id], presenca: "ausente", motivo: "Faltou" }, 200);
  await espera("rh", "treinamento_concluir", { id: a.id }, 200);
  if ((await conf(U.rh, 7, "I-PR-010")).situacao !== "vencido") throw new Error("deveria estar vencido: " + JSON.stringify(await conf(U.rh, 7, "I-PR-010")));
  if ((await conf(U.rh, 1, "I-PR-010")).situacao !== "pendente") throw new Error("ausente não pode atender o requisito");
  // reposição há 15 dias: Ana realiza → passa a atender (validade em ~15 dias → A vencer)
  await espera("rh", "treinamento_reposicao", base("instrucao_trabalho", "interno", { treinamento_id: a.id, lista_mestra_codigo: "I-PR-010", data_inicio: diasAtras(2) }), 422); // reposição também não pode ser retroativa
  const r = await espera("rh", "treinamento_reposicao", base("instrucao_trabalho", "interno", { treinamento_id: a.id, lista_mestra_codigo: "I-PR-010" }), 200);
  await db.exec(`update public.peopleflow_dev_treinamentos set data_inicio='${diasAtras(15)}', data_realizacao='${diasAtras(15)}' where id=${r.id}`); // simula dado histórico (data efetiva informada)
  await espera("rh", "treinamento_iniciar", { id: r.id }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: r.id, participante_ids: [(await part(r.id, 1)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("rh", "treinamento_concluir", { id: r.id }, 200);
  const c1 = await conf(U.rh, 1, "I-PR-010");
  if (c1.situacao !== "a_vencer") throw new Error("reposição válida deveria atender (a vencer): " + JSON.stringify(c1));
  if (fr.tipoSugeridoParaGap("vencido", "P-PR-001") !== "reciclagem" || fr.tipoSugeridoParaGap("revisao_pendente", "P-PR-001") !== "revisao_pop" || fr.tipoSugeridoParaGap("pendente", "I-PR-010") !== "instrucao_trabalho" || fr.tipoSugeridoParaGap("pendente", "P-PR-001") !== "") throw new Error("pré-preenchimento do tipo");
});
await t("G11. treinamento TESTE não elimina gap (colaborador só com teste segue pendente)", async () => {
  const c3 = await conf(U.rh, 3, "I-PR-010");
  if (c3.situacao !== "pendente") throw new Error(JSON.stringify(c3));
});
await t("G14/G15. Gestor vê só a equipe; RH vê toda a empresa", async () => {
  const g = (await como(U.ge, "select distinct colaborador_id from public.peopleflow_dev_v_conformidade order by 1")).map((x) => Number(x.colaborador_id));
  const r = (await como(U.rh, "select distinct colaborador_id from public.peopleflow_dev_v_conformidade order by 1")).map((x) => Number(x.colaborador_id));
  if (g.some((c) => ![2, 3, 5].includes(c)) || !g.includes(3)) throw new Error("gestor: " + g);
  if (![1, 3, 4, 5, 7].every((c) => r.includes(c))) throw new Error("RH: " + r);
  await espera("gestor", "requisito_salvar", { cargo_nome: "Operador", tipo_requisito: "treinamento", lista_mestra_codigo: "POP-QA-020", recicla_na_revisao: true, status: "vigente" }, 403); // Gestor não valida
});
await t("G1/G2/G3. filtros de Gaps: Departamento/Setor, Cargo e busca por nome", async () => {
  const pessoas = [
    { id: 1, nome: "Ana Recursos", cargo: "Analista de RH", departamento: "Recursos Humanos" },
    { id: 3, nome: "Caio Operador", cargo: "Operador", departamento: "Produção" },
    { id: 4, nome: "Davi Logística", cargo: "Conferente", departamento: "Logística" },
    { id: 5, nome: "Eva Operadora", cargo: "Operador", departamento: "Produção" },
  ];
  const ids = (f: any) => fr.filtrarPessoas(pessoas, { departamento: "", cargo: "", busca: "", ...f }).map((p: any) => p.id).join();
  if (ids({}) !== "1,3,4,5" || ids({ departamento: "Produção" }) !== "3,5" || ids({ cargo: "Conferente" }) !== "4" || ids({ busca: "davi logistica" }) !== "4" || ids({ departamento: "Produção", cargo: "Conferente" }) !== "") throw new Error("filtros");
  if (fr.valoresUnicos(pessoas, "departamento").join() !== "Logística,Produção,Recursos Humanos") throw new Error("departamentos");
  if (fr.FILTROS_GAP.map((f: any) => f.rotulo).join() !== "Todos,Pendentes,Vencidos,Nova revisão,A vencer") throw new Error("chips");
});

console.log("Descrição de Cargo × Catálogo de Habilidades Técnicas");
const bh = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/buscaHabilidades.ts`).href);
const leituraDC = async (tok: string, cargo: string) => {
  const res: any = { c: 0, b: null, status(c: number) { this.c = c; return this; }, json(b: unknown) { this.b = b; } };
  await acoes.executarLeituraDC({ headers: { authorization: tok ? `Bearer ${tok}` : "" }, body: { cargo_nome: cargo } }, res);
  return res as { c: number; b: any };
};
let habDesenho = 0, habPlanilha = 0;
await t("DC1. setup: catálogo técnico e texto legado da DC (não pode ser alterado)", async () => {
  await db.exec("alter table public.peopleflow_descricoes_cargo add column if not exists habilidades_tecnicas text");
  await db.exec("update public.peopleflow_descricoes_cargo set habilidades_tecnicas='Conhecimento em processos de compras; Domínio de ferramentas Office (Excel, Word)' where cargo_nome='Operador'");
  habDesenho = (await espera("rh", "habilidade_salvar", { nome: "Leitura de desenhos técnicos", tipo: "tecnica", categoria: "Conhecimento técnico" }, 200)).id;
  habPlanilha = (await espera("rh", "habilidade_salvar", { nome: "Excel avançado", tipo: "tecnica", categoria: "Sistemas e ferramentas" }, 200)).id;
});
await t("DC5/DC7/DC9. RH seleciona do catálogo (oficial, desejável) e a mesma habilidade serve a vários cargos", async () => {
  const a = await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: habDesenho }, 200);
  const b = await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Conferente", habilidade_id: habDesenho }, 200);
  if (a.status !== "vigente" || a.obrigatorio !== false || b.status !== "vigente" || Number(a.habilidade_id) !== Number(b.habilidade_id)) throw new Error(JSON.stringify([a, b]));
  const again = await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: habDesenho }, 200);
  if (Number(again.id) !== Number(a.id)) throw new Error("não pode duplicar a mesma habilidade no cargo");
  const n = (await q(`select count(*)::int n from public.peopleflow_dev_habilidades where nome_normalizado='leitura de desenhos tecnicos'`))[0].n;
  if (n !== 1) throw new Error("uma única identidade no catálogo");
});
await t("DC Gestor: seleciona para cargo da equipe (aguarda RH); fora da equipe é bloqueado", async () => {
  const g = await espera("gestor", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: habPlanilha }, 200);
  if (g.status !== "sugerido" || g.origem !== "gestor") throw new Error(JSON.stringify(g));
  await espera("gestor", "dc_habilidade_adicionar", { cargo_nome: "Conferente", habilidade_id: habPlanilha }, 403);
  await espera("p3", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: habPlanilha }, 403); // responsável indicado (revogado) / sem perfil de DC
});
await t("DC6/DC11. pesquisa tolerante (acentos, maiúsculas, parcial, grafia) e sinalização de duplicidade", async () => {
  const cat = [{ id: 1, nome: "Processos de compras" }, { id: 2, nome: "Manutenção preventiva e corretiva", categoria: "Equipamentos" }, { id: 3, nome: "Excel avançado" }, { id: 4, nome: "Gestão de fornecedores" }];
  const nomes = (termo: string) => bh.buscarHabilidades(cat, termo).map((h: any) => h.id).join();
  if (nomes("compras") !== "1" || nomes("COMPRA") !== "1" || nomes("manutencao preventiva") !== "2" || nomes("manutençao prevetiva") !== "2" || nomes("excell") !== "3" || nomes("equipamentos") !== "2") throw new Error("busca: " + [nomes("compras"), nomes("manutençao prevetiva"), nomes("excell")]);
  for (const sug of ["Compras", "Processo de compras", "Conhecimento em compras", "Rotinas de compras"]) {
    if (bh.possiveisCorrespondencias(cat, sug)[0]?.id !== 1) throw new Error("duplicidade não sinalizada: " + sug);
  }
  if (!bh.mesmoNome("Processos de Compras", "processos de compras")) throw new Error("mesmoNome");
});
let sugNova = 0;
await t("DC10/DC12/DC7. Gestor sugere habilidade inexistente → aguardando RH (não é oficial, não gera gap)", async () => {
  await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "excel AVANÇADO" }, 409); // já existe no catálogo
  const r = await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "Processos de compras", descricao: "Cotação, pedido e acompanhamento", justificativa: "Consta na DC" }, 200);
  sugNova = r.id;
  if (r.status !== "sugerido" || r.habilidade_id !== null || r.descricao_sugerida !== "Processos de compras") throw new Error(JSON.stringify(r));
  await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "processos de COMPRAS" }, 409); // já pendente no cargo
  const n = (await q("select count(*)::int n from public.peopleflow_dev_habilidades where nome_normalizado='processos de compras'"))[0].n;
  if (n !== 0) throw new Error("sugestão não pode entrar no catálogo antes do RH");
  const lido = await leituraDC("gestor", "Operador");
  const item = lido.b.dados.selecionadas.find((x: any) => x.id === sugNova);
  if (lido.c !== 200 || !item || item.status !== "sugerido" || !item.nova || !lido.b.dados.sugestoes_pendentes.some((p: any) => p.nome === "Processos de compras")) throw new Error(JSON.stringify(lido.b));
  if ((await leituraDC("", "Operador")).c !== 401) throw new Error("leitura exige login");
  if ((await leituraDC("semacesso", "Operador")).c !== 403) throw new Error("leitura exige acesso ao PeopleFlow");
});
await t("DC13. Gestor não valida (nem a própria sugestão)", async () => {
  await espera("gestor", "habilidade_sugestao_validar", { requisito_id: sugNova }, 403);
  await espera("gestor", "requisito_status", { id: sugNova, status: "vigente" }, 403);
  await espera("gestor", "habilidade_salvar", { nome: "Processos de compras", tipo: "tecnica" }, 403);
});
await t("DC14/DC15/DC16. RH valida: entra no catálogo, fica no cargo de origem e disponível para outros cargos", async () => {
  const v = await espera("rh", "habilidade_sugestao_validar", { requisito_id: sugNova, nome: "Processos de compras", descricao: "Cotação, pedido e acompanhamento" }, 200);
  const h = (await q("select id, tipo, ativo from public.peopleflow_dev_habilidades where nome_normalizado='processos de compras'"))[0];
  if (!h || h.tipo !== "tecnica" || v.status !== "vigente" || Number(v.habilidade_id) !== Number(h.id) || v.cargo_nome !== "Operador") throw new Error(JSON.stringify([v, h]));
  const outro = await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Conferente", habilidade_id: h.id }, 200);
  if (outro.status !== "vigente") throw new Error("disponível para outro cargo");
  const lido = await leituraDC("gestor", "Conferente");
  if (!lido.b.dados.catalogo.some((c: any) => c.nome === "Processos de compras")) throw new Error("catálogo da DC deveria mostrar a nova habilidade");
  // validar por vínculo a uma existente (sem duplicar)
  const s2 = await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "Planilhas eletrônicas" }, 200);
  await espera("rh", "habilidade_sugestao_validar", { requisito_id: s2.id, habilidade_id: habPlanilha }, 200); // o cargo já tinha Excel avançado (sugerido) → encerra e valida a existente
  const ex = (await q(`select status from public.peopleflow_dev_cargo_requisitos where cargo_nome='Operador' and habilidade_id=${habPlanilha}`))[0];
  const s2l = (await q(`select status, status_motivo from public.peopleflow_dev_cargo_requisitos where id=${s2.id}`))[0];
  if (ex.status !== "vigente" || s2l.status !== "inativo") throw new Error(JSON.stringify([ex, s2l]));
});
await t("DC14. RH não valida: não entra no catálogo e a decisão fica registrada", async () => {
  const r = await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "Conhecimento geral de fábrica" }, 200);
  await espera("rh", "requisito_status", { id: r.id, status: "inativo" }, 422); // motivo obrigatório
  await espera("rh", "requisito_status", { id: r.id, status: "inativo", motivo: "Não validada pelo RH: genérico demais" }, 200);
  const l = (await q(`select status, status_motivo from public.peopleflow_dev_cargo_requisitos where id=${r.id}`))[0];
  const cat = (await q("select count(*)::int n from public.peopleflow_dev_habilidades where nome_normalizado='conhecimento geral de fabrica'"))[0].n;
  if (l.status !== "inativo" || !l.status_motivo.includes("genérico") || cat !== 0) throw new Error(JSON.stringify(l));
  const lido = await leituraDC("gestor", "Operador");
  if (lido.b.dados.selecionadas.some((x: any) => x.id === r.id)) throw new Error("não validada não aparece na DC");
});
await t("DC8. remoção: Gestor só retira a própria sugestão pendente; RH remove oficial (sem exclusão física)", async () => {
  const r = await espera("gestor", "dc_habilidade_sugerir", { cargo_nome: "Operador", nome: "Soldagem por ultrassom" }, 200);
  const oficial = (await q(`select id from public.peopleflow_dev_cargo_requisitos where cargo_nome='Operador' and habilidade_id=${habDesenho}`))[0].id;
  await espera("gestor", "dc_habilidade_remover", { id: oficial }, 403);
  await espera("gestor", "dc_habilidade_remover", { id: r.id }, 200);
  await espera("rh", "dc_habilidade_remover", { id: oficial }, 200);
  const st = (await q(`select status from public.peopleflow_dev_cargo_requisitos where id=${oficial}`))[0].status;
  if (st !== "inativo") throw new Error("removida = inativa (histórico preservado)");
  await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: habDesenho }, 200); // re-seleção reativa a mesma linha
  if ((await q(`select status from public.peopleflow_dev_cargo_requisitos where id=${oficial}`))[0].status !== "vigente") throw new Error("reativação");
  for (const a of ["dc_habilidade_adicionada", "dc_habilidade_sugerida", "dc_habilidade_removida", "habilidade_sugestao_validada"]) if ((await aud(a)) === 0) throw new Error("faltou auditar " + a);
});
await t("DC21. Obrigatória × Recomendada: RH classifica na relação cargo × habilidade; Gestor não; nada vira gap", async () => {
  const hNova = (await espera("rh", "habilidade_salvar", { nome: "Metrologia", tipo: "tecnica", categoria: "Equipamentos" }, 200)).id;
  const ob = await espera("rh", "dc_habilidade_adicionar", { cargo_nome: "Conferente", habilidade_id: hNova, obrigatorio: true }, 200);
  if (ob.status !== "vigente" || ob.obrigatorio !== true) throw new Error("RH adiciona como Obrigatória: " + JSON.stringify(ob));
  const rec = (await q(`select id, obrigatorio from public.peopleflow_dev_cargo_requisitos where cargo_nome='Conferente' and habilidade_id=${habDesenho}`))[0];
  if (rec.obrigatorio !== false) throw new Error("padrão = Recomendada");
  const g = await espera("gestor", "dc_habilidade_adicionar", { cargo_nome: "Operador", habilidade_id: hNova, obrigatorio: true }, 200);
  if (g.status !== "sugerido" || g.obrigatorio !== false) throw new Error("Gestor não define Obrigatória: " + JSON.stringify(g));
  await espera("gestor", "dc_habilidade_classificar", { id: rec.id, obrigatorio: true }, 403);
  await espera("rh", "dc_habilidade_classificar", { id: rec.id }, 422);
  const c = await espera("rh", "dc_habilidade_classificar", { id: rec.id, obrigatorio: true }, 200);
  if (c.obrigatorio !== true || (await aud("dc_habilidade_classificada")) === 0) throw new Error("classificação/auditoria");
  const lido = await leituraDC("gestor", "Conferente");
  const it = lido.b.dados.selecionadas.find((x: any) => x.id === rec.id);
  if (!it || it.obrigatorio !== true) throw new Error("leitura da DC traz a classificação");
  await espera("rh", "dc_habilidade_classificar", { id: rec.id, obrigatorio: false }, 200);
  const gaps = (await q("select count(*)::int n from public.peopleflow_dev_v_conformidade where lista_mestra_codigo is null"))[0].n;
  if (gaps !== 0) throw new Error("habilidade (obrigatória ou recomendada) não gera gap");
});
await t("DC17/DC18/DC20. texto legado intacto e nenhum gap de treinamento criado pela DC", async () => {
  const dc = (await q("select habilidades_tecnicas from public.peopleflow_descricoes_cargo where cargo_nome='Operador'"))[0];
  if (dc.habilidades_tecnicas !== "Conhecimento em processos de compras; Domínio de ferramentas Office (Excel, Word)") throw new Error("texto legado alterado");
  const gaps = (await q("select count(*)::int n from public.peopleflow_dev_v_conformidade where lista_mestra_codigo is null"))[0].n;
  if (gaps !== 0) throw new Error("habilidade da DC não pode virar gap de treinamento");
});

console.log("Registro de treinamento: carga horária (h/min) e data prevista");
const rotDur = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/rotulos.ts`).href);
await t("CH1. Horas/Minutos → minutos: 15 min, 30 min, 1h30, 2h; exibição amigável", async () => {
  const casos: [string, string, number, string][] = [["0", "15", 15, "15 min"], ["", "30", 30, "30 min"], ["1", "30", 90, "1h30"], ["2", "", 120, "2h"], ["2", "0", 120, "2h"]];
  for (const [h, m, min, txt] of casos) {
    const v = rotDur.lerHorasMinutos(h, m);
    if (v !== min || rotDur.formatarCarga(v) !== txt) throw new Error(`${h}h${m} → ${v} (${rotDur.formatarCarga(v)})`);
    const volta = rotDur.paraHorasMinutos(v);
    if (rotDur.lerHorasMinutos(volta.horas, volta.minutos) !== min) throw new Error("ida e volta " + min);
  }
  if (rotDur.lerHorasMinutos("", "") !== null) throw new Error("vazio = não informado");
});
await t("CH2. duração zero, minutos > 59 e valores inválidos bloqueados (tela e servidor)", async () => {
  for (const [h, m] of [["0", "0"], ["0", ""], ["1", "60"], ["1,5", ""], ["-1", "10"]]) {
    let erro = "";
    try { rotDur.lerHorasMinutos(h, m); } catch (e) { erro = String(e); }
    if (!erro) throw new Error(`deveria bloquear ${h}h${m}`);
  }
  await espera("rh", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Duração zero", carga_horaria_min: 0 }), 422);
});
await t("CH3. carga planejada × realizada preservadas em minutos", async () => {
  const tr = await espera("rh", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Curto 15 min", carga_horaria_min: 15 }), 200);
  if (tr.carga_horaria_min !== 15) throw new Error("planejada");
  await espera("rh", "treinamento_realizacao", { id: tr.id, carga_realizada_min: 90 }, 200);
  const l = (await q(`select carga_horaria_min, carga_realizada_min from public.peopleflow_dev_treinamentos where id=${tr.id}`))[0];
  if (l.carga_horaria_min !== 15 || l.carga_realizada_min !== 90) throw new Error(JSON.stringify(l));
  await espera("rh", "treinamento_cancelar", { id: tr.id, motivo: "Teste" }, 200);
});
await t("DP1. data prevista: ontem bloqueada (novo e reposição); hoje e futura aceitas; edição de histórico não é invalidada", async () => {
  const hojeSP = acoes.hojeSaoPaulo();
  const d = (n: number) => { const x = new Date(`${hojeSP}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const r = await chamar("rh", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Ontem", data_inicio: d(-1) }));
  if (r.c !== 422 || r.b?.error !== "A data prevista não pode ser anterior à data de registro do treinamento. O treinamento deve ser registrado antes de sua realização.") throw new Error(JSON.stringify(r));
  await espera("gestor", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Ontem gestor", data_inicio: d(-1) }), 422);
  const h = await espera("rh", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Hoje", data_inicio: d(0) }), 200);
  const f = await espera("rh", "treinamento_salvar", base("desenvolvimento", "externo", { titulo: "Futuro", data_inicio: d(30) }), 200);
  // histórico: treinamento já gravado com data passada continua editável (regra só vale para novos registros)
  await db.exec(`update public.peopleflow_dev_treinamentos set data_inicio='${d(-40)}' where id=${h.id}`);
  const ed = await espera("rh", "treinamento_salvar", base("desenvolvimento", "externo", { id: h.id, titulo: "Hoje (editado)", data_inicio: d(-40) }), 200);
  if (ed.data_inicio.toString().slice(0, 10) !== d(-40) && new Date(ed.data_inicio).toISOString().slice(0, 10) !== d(-40)) throw new Error("histórico alterado: " + ed.data_inicio);
  for (const id of [h.id, f.id]) await espera("rh", "treinamento_cancelar", { id, motivo: "Teste" }, 200);
});

console.log("Auditoria, permissões e banco");
await t("21. auditoria dos eventos do fluxo", async () => {
  const esperados = ["treinamento_planejado", "treinamento_iniciado", "treinamento_concluido", "treinamento_cancelado", "participantes_incluidos", "participante_retirado", "necessidades_vinculadas", "necessidade_planejada", "necessidade_atendida", "necessidade_validada", "presenca_qr", "presenca_manual", "qr_gerado", "qr_encerrado", "evidencia_anexada", "eficacia_registrada", "treinamento_editado", "treinamento_retificado", "reposicao_criada", "lista_presenca_gerada"];
  const faltam = [];
  for (const a of esperados) if ((await aud(a)) === 0) faltam.push(a);
  if (faltam.length) throw new Error(faltam.join(","));
});
await t("22. RLS: Responsável só vê o que conduz; Gestor vê equipe e o que solicitou; QR ilegível", async () => {
  const conduz = (await q("select id from public.peopleflow_dev_treinamentos where 7 in (responsavel_colaborador_id, instrutor_colaborador_id) order by id")).map((x) => Number(x.id)).join();
  const r = await como(U.resp, "select id from public.peopleflow_dev_treinamentos order by id");
  if (r.map((x) => Number(x.id)).join() !== conduz) throw new Error("resp vê: " + JSON.stringify(r) + " esperado " + conduz);
  const rp = await como(U.resp, `select count(*)::int n from public.peopleflow_dev_participantes where treinamento_id=${tPop}`);
  if (rp[0].n !== 0) throw new Error("resp vê participantes de outro treinamento");
  const g = await como(U.ge, "select id from public.peopleflow_dev_treinamentos");
  if (!g.some((x) => Number(x.id) === tGe) || g.some((x) => Number(x.id) === tPop)) throw new Error("gestor vê: " + JSON.stringify(g));
  const ge4 = await como(U.ge, `select count(*)::int n from public.peopleflow_dev_v_participacoes where treinamento_id=${tExt}`);
  if (ge4[0].n !== 0) throw new Error("gestor vê participação de fora da equipe em treinamento que não gere");
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U.rh}',false);`);
  try { await q("select token from public.peopleflow_dev_qr_tokens"); throw new Error("leu token"); } catch (e) { if ((e as Error).message === "leu token") throw e; } finally { await db.exec("reset role;"); }
});
await t("23. navegador não grava em nenhuma tabela nova", async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U.rh}',false);`);
  try {
    for (const sql of [`update public.peopleflow_dev_treinamentos set status='concluido'`, `insert into public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id) values (${tGe}, 1)`, `update public.peopleflow_dev_participantes set presenca_status='presente'`, `update public.peopleflow_dev_treinamentos set reposicao_de_id=null`]) {
      try { await db.exec(sql); throw new Error("gravou: " + sql); } catch (e) { if ((e as Error).message.startsWith("gravou")) throw e; }
    }
  } finally { await db.exec("reset role;"); }
});
await t("sem exclusão física em treinamentos, vínculos e QR", async () => {
  for (const tb of ["peopleflow_dev_treinamentos", "peopleflow_dev_treinamento_necessidades", "peopleflow_dev_qr_tokens"]) {
    try { await db.exec(`delete from public.${tb}`); throw new Error("apagou " + tb); } catch (e) { if ((e as Error).message.startsWith("apagou")) throw e; }
  }
});
console.log("Rollback");
await t("rollback da Fase 5 aplica com dados, volta os nomes da Fase 1 e é repetível; bucket com arquivo fica", async () => {
  await db.exec("insert into storage.objects values ('desenvolvimento-evidencias','x')");
  const indicadasAntes = (await q("select count(*)::int n from public.peopleflow_dev_treinamento_necessidades where situacao='indicada' and ativo"))[0].n;
  await db.exec(RB5D);
  await db.exec(RB5D); // regra antiga volta NOT VALID: sugestões já decididas continuam gravadas
  await db.exec(RB5C);
  await db.exec(RB5C);
  if ((await q("select count(*)::int n from information_schema.tables where table_name='peopleflow_dev_responsaveis_gestao'"))[0].n !== 0) throw new Error("rollback 5c deixou a tabela");
  if ((await q("select count(*)::int n from information_schema.columns where table_name='peopleflow_dev_treinamento_necessidades' and column_name='situacao'"))[0].n !== 0) throw new Error("rollback 5c deixou a coluna");
  void indicadasAntes;
  await db.exec(RB5B);
  await db.exec(RB5B);
  if ((await q("select count(*)::int n from information_schema.columns where table_name='peopleflow_dev_treinamentos' and column_name='homologacao'"))[0].n !== 0) throw new Error("rollback 5b deixou a coluna");
  await db.exec(RB5);
  await db.exec(RB5);
  const cols = (await q("select column_name from information_schema.columns where table_name='peopleflow_dev_treinamentos'")).map((c) => c.column_name);
  if (cols.includes("formato") || cols.includes("reposicao_de_id") || !cols.includes("tipo") || !cols.includes("modalidade")) throw new Error(cols.join());
  const tipos = (await q("select distinct tipo from public.peopleflow_dev_treinamentos")).map((x) => x.tipo).sort().join();
  if (tipos !== "externo,interno") throw new Error("tipo deveria voltar a interno/externo: " + tipos);
  const b = await q("select count(*)::int n from storage.buckets where id='desenvolvimento-evidencias'");
  if (b[0].n !== 1) throw new Error("apagou bucket com arquivo");
  if ((await q("select count(*)::int n from pg_views where viewname='peopleflow_dev_v_participacoes'"))[0].n !== 0) throw new Error("view nova ficou");
});
await t("reaplicar as Fases 5, 5b e 5c após o rollback (com dados)", async () => {
  await db.exec(F5);
  await db.exec(F5B);
  await db.exec(F5C);
  await db.exec(F5D);
  const m = (await q("select distinct modalidade from public.peopleflow_dev_treinamentos")).map((x) => x.modalidade).sort().join();
  if (m !== "externo,interno") throw new Error(m);
});
await t("ciclo aplicar → reverter → reaplicar num banco limpo", async () => {
  const d = new PGlite();
  await d.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$; create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (bucket_id text, name text); create table public.colaboradores (id bigint primary key, nome text, cargo text, admissao date, desligado boolean, empresa_afiliada boolean); create table public.peopleflow_descricoes_cargo (cargo_nome text primary key, obsoleto boolean default false); create table public.peopleflow_pdi (id bigint primary key);");
  for (const f of [F1, F2, F4, F5, F5B, F5C, F5D, RB5D, F5D, F5D, RB5D, RB5C, F5C, RB5C, RB5B, RB5, F5, F5B, F5C, F5C, F5D]) await d.exec(f);
});
console.log(`\n${ok} passaram, ${falhas} falharam`);
