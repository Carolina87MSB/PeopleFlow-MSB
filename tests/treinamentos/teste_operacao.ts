// Entrada em operação de Treinamentos (POPs): matriz de permissões por perfil e etapas críticas do fluxo, com a lógica REAL do servidor
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
for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql"]) await db.exec(SQL(f));
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
const hoje = new Date().toISOString().slice(0, 10);
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

let tPop = 0, tokenQr = "";

console.log("Sessão do módulo: quem entra e com qual perfil");
await t("RH e Gestor entram pelas regras do PeopleFlow; colaborador comum e quem não está no cadastro não entram", async () => {
  const rh = await sessao("rh"); if (rh.c !== 200 || rh.b.perfil !== "RH") throw new Error(JSON.stringify(rh));
  const ge = await sessao("ge"); if (ge.c !== 200 || ge.b.perfil !== "Gestor" || ge.b.podeRegistrar !== true) throw new Error(JSON.stringify(ge.b));
  const ids = ge.b.pessoas.map((p: any) => p.id).sort().join();
  if (ids !== "2,3,5,8,9") throw new Error("escopo da gestora: " + ids);
  const gil = await sessao("gil"); if (gil.b.perfil !== "Gestor" || gil.b.pessoas.map((p: any) => p.id).sort().join() !== "4,6") throw new Error("escopo do gestor da logística: " + JSON.stringify(gil.b));
  if ((await sessao("p4")).c !== 403) throw new Error("colaborador comum não deve abrir o módulo");
  if ((await sessao("semcadastro")).c !== 403) throw new Error("conta sem colaborador no cadastro não entra");
});
await t("Responsável SÓ vira perfil Responsavel quando indicado pelo gestor ou designado num treinamento — antes disso, 403", async () => {
  if ((await sessao("hugo")).c !== 403) throw new Error("hugo antes da indicação");
  if ((await sessao("resp")).c !== 403) throw new Error("fabio antes da designação");
  const ind = await espera("ge", "responsavel_gestao_indicar", { colaborador_id: 8 }, 200);
  if (!ind.id) throw new Error("indicação");
  const h = await sessao("hugo");
  if (h.c !== 200 || h.b.perfil !== "Responsavel" || h.b.podeRegistrar !== true) throw new Error(JSON.stringify(h.b));
});

console.log("Planejamento de um treinamento de POP");
const baseDoPop = { tipo: "novo_pop", modalidade: "interno", formato: "presencial", data_inicio: hoje, carga_horaria_min: 90, lista_mestra_codigo: "P-PR-001", responsavel_colaborador_id: 7, instrutor_colaborador_id: 7, exige_eficacia: true };
await t("Gestor registra o treinamento do POP: código, título oficial, revisão, data, carga, responsável/instrutor — nasce PLANEJADO", async () => {
  await espera("p4", "treinamento_salvar", baseDoPop, 401);
  await espera("resp", "treinamento_salvar", baseDoPop, 401); // ainda sem sessão do módulo
  const d = await espera("ge", "treinamento_salvar", baseDoPop, 200);
  tPop = d.id;
  if (d.status !== "planejado" || d.lista_mestra_codigo !== "P-PR-001" || d.lista_mestra_revisao !== "03" || d.titulo !== "MONTAGEM DA SONDA" || d.carga_horaria_min !== 90 || Number(d.solicitado_por_colaborador_id) !== 2 || Number(d.responsavel_colaborador_id) !== 7) throw new Error(JSON.stringify(d));
  await espera("ge", "treinamento_salvar", { ...baseDoPop, titulo: "x", lista_mestra_codigo: null }, 422); // POP sem documento
  await espera("ge", "treinamento_salvar", { ...baseDoPop, responsavel_colaborador_id: null }, 422); // sem responsável designado
});
await t("O responsável designado passa a abrir o módulo como Responsavel (sem escopo de equipe, sem registrar treinamentos)", async () => {
  const f = await sessao("resp");
  if (f.c !== 200 || f.b.perfil !== "Responsavel" || f.b.podeRegistrar !== false || f.b.pessoas.length !== 0) throw new Error(JSON.stringify(f.b));
  const outro = await chamar("resp", "treinamento_salvar", { ...baseDoPop, titulo: "x" });
  if (outro.c !== 403) throw new Error("designado sem indicação não registra treinamento: " + outro.c);
});
await t("Seleção de participantes pela gestão; colaborador sem conta do módulo e gestor de outra área não montam turma", async () => {
  await espera("ge", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [3, 5, 4] }, 200);
  await espera("gil", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [9] }, 403);
  await espera("p3", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [9] }, 401);
  await espera("ge", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [999] }, 422);
  if ((await q(`select count(*)::int n from public.peopleflow_dev_participantes where treinamento_id=${tPop}`))[0].n !== 3) throw new Error("turma");
});

console.log("Revisão do documento treinada");
await t("Documento revisado ENTRE o planejamento e o início: a revisão treinada passa a ser a vigente no início (auditada)", async () => {
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='04' where codigo='P-PR-001'");
  const antes = (await q(`select lista_mestra_revisao from public.peopleflow_dev_treinamentos where id=${tPop}`))[0].lista_mestra_revisao;
  if (antes !== "03") throw new Error("a revisão do planejamento não deveria mudar sozinha");
  const d = await espera("resp", "treinamento_iniciar", { id: tPop }, 200);
  if (d.status !== "em_andamento" || d.lista_mestra_revisao !== "04") throw new Error(JSON.stringify(d));
  const a = await q(`select detalhe from public.peopleflow_dev_auditoria where acao='treinamento_revisao_atualizada' and entidade_id='${tPop}'`);
  if (a.length !== 1 || a[0].detalhe.revisao.antes !== "03" || a[0].detalhe.revisao.depois !== "04") throw new Error(JSON.stringify(a));
});
await t("Depois do início a revisão treinada NUNCA mais muda, mesmo que o documento receba novas revisões", async () => {
  await db.exec("update public.peopleflow_dev_lista_mestra set revisao_atual='05' where codigo='P-PR-001'");
  await espera("ge", "presenca_manual", { treinamento_id: tPop, participante_ids: [(await part(tPop, 4)).id], presenca: "ausente", motivo: "Em férias" }, 200);
  const d = (await q(`select lista_mestra_revisao, titulo from public.peopleflow_dev_treinamentos where id=${tPop}`))[0];
  if (d.lista_mestra_revisao !== "04") throw new Error(JSON.stringify(d));
  await espera("ge", "treinamento_salvar", { ...baseDoPop, id: tPop }, 403); // gestão não edita depois do início
});
await t("Documento que ficou obsoleto antes do início: o treinamento não inicia com revisão que não vale mais", async () => {
  const d = await espera("ge", "treinamento_salvar", { ...baseDoPop, tipo: "instrucao_trabalho", lista_mestra_codigo: "I-PR-010", responsavel_colaborador_id: 2 }, 200);
  await db.exec("update public.peopleflow_dev_lista_mestra set situacao='obsoleto' where codigo='I-PR-010'");
  const r = await chamar("ge", "treinamento_iniciar", { id: d.id });
  if (r.c !== 422 || !/não está vigente/.test(r.b.error)) throw new Error(JSON.stringify(r));
  await espera("ge", "treinamento_cancelar", { id: d.id, motivo: "Documento obsoleto" }, 200);
});

console.log("Matriz de permissões — treinamento EM ANDAMENTO");
// resultado esperado por perfil: rh | ge (gestor que registrou) | resp (responsável designado) | hugo (Responsável indicado pela gestão, NÃO designado)
// | gil (gestor de outra área) | p4 (colaborador comum, sem sessão do módulo)
const matriz: { acao: string; corpo: () => Record<string, unknown>; esperado: Record<string, number> }[] = [
  { acao: "qr_gerar", corpo: () => ({ treinamento_id: tPop }), esperado: { rh: 200, ge: 200, resp: 200, hugo: 403, gil: 403, p4: 401 } },
  { acao: "treinamento_realizacao", corpo: () => ({ id: tPop, data_realizacao: hoje, carga_realizada_min: 90 }), esperado: { rh: 200, ge: 200, resp: 200, hugo: 403, gil: 403, p4: 401 } },
  { acao: "evidencia_upload_url", corpo: () => ({ treinamento_id: tPop, tipo: "material", file_name: "Treinamento.pdf", mime: "application/pdf", tamanho_bytes: 1200 }), esperado: { rh: 200, ge: 200, resp: 200, hugo: 403, gil: 403, p4: 401 } },
  { acao: "participantes_adicionar", corpo: () => ({ treinamento_id: tPop, colaborador_ids: [9] }), esperado: { rh: 200, ge: 200, resp: 200, hugo: 200, gil: 403, p4: 401 } },
  { acao: "treinamento_concluir", corpo: () => ({ id: tPop }), esperado: { rh: 422, ge: 403, resp: 403, hugo: 403, gil: 403, p4: 401 } }, // RH recebe 422 porque ainda há presença pendente
  { acao: "treinamento_cancelar", corpo: () => ({ id: tPop, motivo: "teste" }), esperado: { ge: 403, resp: 403, hugo: 403, gil: 403, p4: 401 } },
  { acao: "treinamento_salvar", corpo: () => ({ ...baseDoPop, id: tPop }), esperado: { ge: 403, resp: 403, hugo: 403, gil: 403, p4: 401 } },
  { acao: "lista_presenca_gerar", corpo: () => ({ treinamento_id: tPop }), esperado: { ge: 403, resp: 403, hugo: 403, gil: 403, p4: 401 } },
  { acao: "lista_mestra_salvar", corpo: () => ({ codigo: "X-1", titulo: "x", revisao_atual: "01", novo: true }), esperado: { ge: 403, resp: 403, hugo: 403, p4: 401 } },
  { acao: "habilidade_ativo", corpo: () => ({ id: 1, ativo: false, motivo: "x" }), esperado: { ge: 403, resp: 403, hugo: 403, p4: 401 } },
  { acao: "treinamento_planejar", corpo: () => ({ id: tPop }), esperado: { ge: 403, resp: 403, hugo: 403, p4: 401 } },
];
for (const m of matriz) {
  await t(`${m.acao}: ${Object.entries(m.esperado).map(([k, v]) => `${k} ${v}`).join(" · ")}`, async () => {
    for (const [quem, st] of Object.entries(m.esperado)) await espera(quem, m.acao, m.corpo(), st);
  });
}
await t("Presença manual em andamento: RH, gestor que registrou e responsável designado; Responsável não designado e outra gestão não", async () => {
  const p = (await part(tPop, 3)).id;
  await espera("hugo", "presenca_manual", { treinamento_id: tPop, participante_ids: [p], presenca: "presente", motivo: "x" }, 403);
  await espera("gil", "presenca_manual", { treinamento_id: tPop, participante_ids: [p], presenca: "presente", motivo: "x" }, 403);
  await espera("p4", "presenca_manual", { treinamento_id: tPop, participante_ids: [p], presenca: "presente", motivo: "x" }, 401);
  await espera("resp", "presenca_manual", { treinamento_id: tPop, participante_ids: [p], presenca: "presente" }, 422); // justificativa obrigatória
});

console.log("Presença: QR Code (colaborador confirma a própria) e manual (responsável/gestor)");
await t("Colaborador confirma a PRÓPRIA presença pelo QR; não inscrito é informado; QR encerrado não registra", async () => {
  tokenQr = (await espera("resp", "qr_gerar", { treinamento_id: tPop }, 200)).token;
  const i = await espera("p3", "presenca_info", { token: tokenQr }, 200);
  if (i.situacao !== "pendente" || i.documento !== "P-PR-001 rev. 04" || JSON.stringify(i).includes("Eva")) throw new Error(JSON.stringify(i));
  const c = await espera("p3", "presenca_confirmar", { token: tokenQr }, 200);
  if (c.situacao !== "confirmada") throw new Error(JSON.stringify(c));
  const d = await part(tPop, 3);
  if (d.presenca_status !== "presente" || d.presenca_metodo !== "qr") throw new Error(JSON.stringify(d));
  await espera("p5", "presenca_confirmar", { token: tokenQr }, 200); // Eva também está na turma
  await espera("semcadastro", "presenca_confirmar", { token: tokenQr }, 409); // conta que não bate com o cadastro
  await espera("", "presenca_info", { token: tokenQr }, 401);
});
await t("Presença manual (com justificativa) pelo responsável designado e pelo gestor; ausente fica registrado", async () => {
  await espera("resp", "presenca_manual", { treinamento_id: tPop, participante_ids: [(await part(tPop, 9)).id], presenca: "ausente", motivo: "Faltou — atestado" }, 200);
  const d = await part(tPop, 9);
  if (d.presenca_status !== "ausente" || d.presenca_metodo !== "manual" || d.presenca_motivo !== "Faltou — atestado") throw new Error(JSON.stringify(d));
  const a = await q(`select count(*)::int n from public.peopleflow_dev_auditoria where acao='presenca_manual' and detalhe->>'motivo' = 'Faltou — atestado'`);
  if (a[0].n !== 1) throw new Error("auditoria da presença manual");
});
await t("Evidência anexada pelo responsável designado (bucket privado), visível a quem conduz e ao gestor com liderado na turma; não ao Responsável não designado", async () => {
  const u = await espera("resp", "evidencia_upload_url", { treinamento_id: tPop, tipo: "foto", file_name: "Sala.pdf", mime: "application/pdf", tamanho_bytes: 1200 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 1200, "application/pdf");
  const e = await espera("resp", "evidencia_registrar", { treinamento_id: tPop, path: u.path, tipo: "foto", file_name: "Sala.pdf" }, 200);
  await espera("ge", "evidencia_url", { id: e.id }, 200);
  await espera("resp", "evidencia_url", { id: e.id }, 200);
  await espera("gil", "evidencia_url", { id: e.id }, 200); // gestor com liderado (Davi) na turma acompanha o treinamento, como na tela
  await espera("hugo", "evidencia_url", { id: e.id }, 403); // Responsável indicado, mas não designado neste treinamento
  await espera("p3", "evidencia_url", { id: e.id }, 401);
});

console.log("Conclusão pelo RH e Lista de Presença");
await t("Com presença pendente o RH não conclui; resolvida, o RH conclui — sem exigir certificado", async () => {
  // Íris (9) está ausente, Davi (4) ausente, Caio e Eva presentes; Íris foi incluída depois e já resolvida. Reabre uma pendência de propósito:
  await espera("hugo", "participantes_adicionar", { treinamento_id: tPop, colaborador_ids: [2] }, 200);
  const r = await chamar("rh", "treinamento_concluir", { id: tPop });
  if (r.c !== 422 || !/pendente/.test(r.b.error)) throw new Error(JSON.stringify(r));
  await espera("ge", "presenca_manual", { treinamento_id: tPop, participante_ids: [(await part(tPop, 2)).id], presenca: "presente", motivo: "Supervisora acompanhou a turma" }, 200);
  await espera("ge", "treinamento_concluir", { id: tPop }, 403);
  await espera("resp", "treinamento_concluir", { id: tPop }, 403);
  const d = await espera("rh", "treinamento_concluir", { id: tPop }, 200);
  if (d.status !== "concluido" || d.lista_mestra_revisao !== "04") throw new Error(JSON.stringify(d));
  if ((await q(`select count(*)::int n from public.peopleflow_dev_evidencias where treinamento_id=${tPop} and tipo='certificado'`))[0].n !== 0) throw new Error("não deveria exigir certificado");
  await espera("p3", "presenca_info", { token: tokenQr }, 404); // QR encerrado na conclusão
});
await t("Lista de Presença em PDF: código, título, REVISÃO TREINADA, data, carga, instrutor, responsável e a turma (presentes e ausentes)", async () => {
  const ls = await q(`select storage_path from public.peopleflow_dev_evidencias where treinamento_id=${tPop} and tipo='lista_presenca' and substituida_em is null`);
  if (ls.length !== 1) throw new Error("lista vigente: " + ls.length);
  const txt = textoDoPdf(fake.storage.conteudos.get(`desenvolvimento-evidencias/${ls[0].storage_path}`)!);
  for (const e of ["P-PR-001", "Montagem da sonda", "Novo POP", "Fabio Instrutor", "Caio Operador", "Davi Logistica", "Iris Operadora", "1h30"]) if (!txt.includes(e)) throw new Error(`PDF sem "${e}"`);
  if (!/REVISÃO TREINADA\n04\n/.test(txt)) throw new Error("revisão treinada deveria ser 04 (a vigente é 05)");
  if (!/[0-9a-f]{64}/.test(JSON.stringify(await q(`select detalhe from public.peopleflow_dev_auditoria where acao='lista_presenca_gerada' and detalhe->>'treinamento_id' = '${tPop}'`)))) throw new Error("hash sha256 do PDF não está na auditoria");
});
await t("Depois de concluído: gestor e responsável não alteram presença nem anexam; só o RH retifica (gera NOVA versão, a anterior fica substituída)", async () => {
  const dv = (await part(tPop, 4)).id;
  await espera("ge", "presenca_manual", { treinamento_id: tPop, participante_ids: [dv], presenca: "presente", motivo: "x" }, 403);
  await espera("resp", "presenca_manual", { treinamento_id: tPop, participante_ids: [dv], presenca: "presente", motivo: "x" }, 403);
  await espera("ge", "evidencia_upload_url", { treinamento_id: tPop, tipo: "ata", file_name: "a.pdf", mime: "application/pdf", tamanho_bytes: 10 }, 403);
  await espera("resp", "evidencia_upload_url", { treinamento_id: tPop, tipo: "ata", file_name: "a.pdf", mime: "application/pdf", tamanho_bytes: 10 }, 403);
  await espera("rh", "presenca_manual", { treinamento_id: tPop, participante_ids: [dv], presenca: "presente", motivo: "Assinou a lista física depois" }, 200);
  const ls = await q(`select substituida_em from public.peopleflow_dev_evidencias where treinamento_id=${tPop} and tipo='lista_presenca' order by id`);
  if (ls.length !== 2 || !ls[0].substituida_em || ls[1].substituida_em) throw new Error(JSON.stringify(ls));
  if ((await q(`select count(*)::int n from public.peopleflow_dev_auditoria where acao='presenca_retificada'`))[0].n < 1) throw new Error("retificação não auditada");
});

console.log("Eficácia, faltantes e reposição");
await t("Eficácia (exigida): RH ou gestor do participante; responsável designado, gestor de outra área e o próprio participante não", async () => {
  const pc = (await part(tPop, 3)).id;
  await espera("resp", "eficacia_registrar", { participante_id: pc, resultado: "eficaz" }, 403);
  await espera("hugo", "eficacia_registrar", { participante_id: pc, resultado: "eficaz" }, 403);
  await espera("gil", "eficacia_registrar", { participante_id: pc, resultado: "eficaz" }, 403);
  await espera("p3", "eficacia_registrar", { participante_id: pc, resultado: "eficaz" }, 401);
  await espera("ge", "eficacia_registrar", { participante_id: pc, resultado: "nao_eficaz" }, 422); // observação obrigatória
  await espera("ge", "eficacia_registrar", { participante_id: pc, resultado: "eficaz" }, 200);
  await espera("rh", "eficacia_registrar", { participante_id: (await part(tPop, 5)).id, resultado: "eficaz" }, 200);
  await espera("ge", "eficacia_registrar", { participante_id: (await part(tPop, 4)).id, resultado: "eficaz" }, 403); // Davi é da equipe de outro gestor
});
await t("Faltante (Íris) volta numa REPOSIÇÃO agendada pela gestão; o treinamento original não é reaberto", async () => {
  const f = await espera("ge", "reposicao_faltantes", { treinamento_id: tPop }, 200);
  if (f.length !== 1 || Number(f[0].colaborador_id ?? f[0].id) !== 9) throw new Error(JSON.stringify(f));
  await espera("gil", "reposicao_faltantes", { treinamento_id: tPop }, 403);
  const r = await espera("ge", "treinamento_reposicao", { ...baseDoPop, treinamento_id: tPop, colaborador_ids: [9] }, 200);
  if (r.status !== "planejado" || Number(r.reposicao_de_id) !== tPop) throw new Error(JSON.stringify(r));
  if ((await q(`select status from public.peopleflow_dev_treinamentos where id=${tPop}`))[0].status !== "concluido") throw new Error("original reaberto");
});

console.log("Colaborador: consulta ao próprio histórico");
await t("Cada colaborador vê SÓ o próprio histórico (documento e revisão treinada); ausência aparece como ausência; nada de outras pessoas", async () => {
  const caio = await espera("p3", "meu_historico", {}, 200);
  if (caio.treinamentos.length !== 1 || caio.treinamentos[0].situacao !== "realizado" || caio.treinamentos[0].documento !== "P-PR-001 rev. 04" || caio.treinamentos[0].carga_min !== 90) throw new Error(JSON.stringify(caio));
  const txt = JSON.stringify(caio);
  for (const outro of ["Eva", "Davi", "Iris", "Bia", "Fabio"]) if (txt.includes(outro)) throw new Error("vazou: " + outro);
  const iris = await espera("p9", "meu_historico", {}, 200);
  const s = iris.treinamentos.map((x: any) => x.situacao).sort().join();
  if (s !== "agendado,ausente") throw new Error("Íris: ausente no original + reposição agendada: " + s);
  const davi = await espera("p4", "meu_historico", {}, 200);
  if (davi.treinamentos.length !== 1 || davi.treinamentos[0].situacao !== "realizado") throw new Error("Davi retificado para presente: " + JSON.stringify(davi));
});
await t("Histórico não lista treinamento de homologação/teste; sem login não consulta; conta fora do cadastro não consulta", async () => {
  const h = await espera("rh", "treinamento_salvar", { tipo: "desenvolvimento", modalidade: "interno", titulo: "Teste do fluxo", data_inicio: hoje, responsavel_colaborador_id: 1, homologacao: true }, 200);
  await espera("rh", "participantes_adicionar", { treinamento_id: h.id, colaborador_ids: [3] }, 200);
  if ((await espera("p3", "meu_historico", {}, 200)).treinamentos.length !== 1) throw new Error("teste apareceu no histórico");
  await espera("", "meu_historico", {}, 401);
  await espera("semcadastro", "meu_historico", {}, 409);
});
await t("Visão oficial do histórico guarda a revisão efetivamente treinada (04), não a vigente (05)", async () => {
  const h = await q(`select lista_mestra_revisao from public.peopleflow_dev_v_historico where colaborador_id=3 and lista_mestra_codigo='P-PR-001'`);
  if (h.length !== 1 || h[0].lista_mestra_revisao !== "04") throw new Error(JSON.stringify(h));
});

console.log("Rastreabilidade");
await t("Auditoria cobre cada etapa do fluxo do POP", async () => {
  const acoesAud = new Set((await q(`select distinct acao from public.peopleflow_dev_auditoria`)).map((x) => x.acao));
  for (const e of ["treinamento_planejado", "participantes_incluidos", "treinamento_revisao_atualizada", "treinamento_iniciado", "qr_gerado", "presenca_qr", "presenca_manual", "evidencia_anexada", "treinamento_concluido", "lista_presenca_gerada", "presenca_retificada", "eficacia_registrada", "reposicao_criada", "responsavel_gestao_indicado", "sessao_iniciada"]) if (!acoesAud.has(e)) throw new Error("faltou auditar " + e);
});
await t("Nada é apagado: sem exclusão física em treinamentos, participantes e evidências", async () => {
  for (const tabela of ["peopleflow_dev_treinamentos", "peopleflow_dev_participantes", "peopleflow_dev_evidencias"]) {
    try { await db.exec(`delete from public.${tabela}`); throw new Error("apagou " + tabela); } catch (e) { if ((e as Error).message.startsWith("apagou")) throw e; }
  }
});

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
