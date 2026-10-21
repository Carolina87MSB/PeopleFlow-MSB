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
for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_avaliacao_reacao.sql"]) await db.exec(SQL(f));
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

console.log("Confirmação de presença por QR: identidade, prazo, duplicidade e auditoria");
await t("Só a pessoa autenticada confirma, e só a PRÓPRIA presença (o corpo da requisição não escolhe a pessoa); duplicidade não duplica nada", async () => {
  const rep = (await q(`select id from public.peopleflow_dev_treinamentos where reposicao_de_id=${tPop}`))[0].id as number;
  await espera("ge", "treinamento_iniciar", { id: rep }, 200);
  await espera("hugo", "participantes_adicionar", { treinamento_id: rep, colaborador_ids: [3] }, 200); // Caio entra na turma, mas só ELE poderá confirmar a própria presença
  const tk = (await espera("resp", "qr_gerar", { treinamento_id: rep }, 200)).token;
  await espera("", "presenca_confirmar", { token: tk }, 401); // anônimo
  await espera("semcadastro", "presenca_confirmar", { token: tk }, 409); // conta que não bate com o cadastro
  const pCaio = await part(rep, 3);
  const pCaioRep = pCaio.id;
  // Íris tenta "confirmar pelo Caio": o servidor ignora qualquer pessoa/participante enviados no corpo
  await espera("p9", "presenca_confirmar", { token: tk, colaborador_id: 3, participante_id: pCaio.id, user_id: U.p3 }, 200);
  if ((await part(rep, 3)).presenca_status !== "pendente") throw new Error("confirmou em nome de terceiro");
  if ((await part(rep, 9)).presenca_status !== "presente" || (await part(rep, 9)).presenca_metodo !== "qr") throw new Error("Íris deveria ter confirmado a própria");
  const em = (await part(rep, 9)).presenca_em;
  const r2 = await espera("p9", "presenca_confirmar", { token: tk }, 200); // segunda leitura do QR
  if (r2.situacao !== "confirmada") throw new Error(JSON.stringify(r2));
  const ps = await part(rep, 9);
  if (String(ps.presenca_em) !== String(em)) throw new Error("repetir a confirmação alterou o horário original");
  const a = await q(`select colaborador_id, user_id from public.peopleflow_dev_auditoria where acao='presenca_qr' and entidade_id='${ps.id}'`);
  if (a.length !== 1 || Number(a[0].colaborador_id) !== 9 || a[0].user_id !== U.p9) throw new Error("auditoria da presença por QR: " + JSON.stringify(a));
  // QR vencido, encerrado e código malformado não registram nada
  await db.exec(`update public.peopleflow_dev_qr_tokens set expira_em = now() - interval '1 minute' where treinamento_id=${rep}`);
  await espera("p3", "presenca_confirmar", { token: tk }, 404);
  await db.exec(`update public.peopleflow_dev_qr_tokens set expira_em = now() + interval '1 hour' where treinamento_id=${rep}`);
  await espera("p3", "presenca_info", { token: tk }, 200);
  await espera("p3", "presenca_info", { token: "curto" }, 404);
  await espera("resp", "qr_encerrar", { treinamento_id: rep }, 200);
  await espera("p3", "presenca_confirmar", { token: tk }, 404);
  if ((await part(rep, 3)).presenca_status !== "pendente") throw new Error("registrou com QR encerrado");
  await espera("ge", "participante_remover", { participante_id: pCaioRep, motivo: "Só para o teste de identidade" }, 200); // mantém o histórico dos testes seguintes
});

console.log("Data de realização: efetiva ≠ planejada");
const { dataEfetivaDeRealizacao } = await import(pathToFileURL(`${PF}/src/domain/dataRealizacao.ts`).href);
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = diaSP.format(new Date());
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dataBRde = (iso: string) => iso.split("-").reverse().join("/");
const isoDe = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
/** Treinamento de desenvolvimento (RH como participante, para não interferir no histórico dos demais), iniciado e com a presença resolvida. */
async function realizado(extra: Record<string, unknown>) {
  const d = await espera("rh", "treinamento_salvar", { tipo: "desenvolvimento", modalidade: "interno", titulo: "Reunião de alinhamento", responsavel_colaborador_id: 1, data_inicio: hojeSP, ...extra }, 200);
  await espera("rh", "participantes_adicionar", { treinamento_id: d.id, colaborador_ids: [1] }, 200);
  await espera("rh", "treinamento_iniciar", { id: d.id }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: d.id, participante_ids: [(await part(d.id, 1)).id], presenca: "presente", motivo: "Lista física" }, 200);
  return d.id as number;
}
const dataDoPdf = async (tid: number) => {
  const ls = await q(`select storage_path from public.peopleflow_dev_evidencias where treinamento_id=${tid} and tipo='lista_presenca' and substituida_em is null`);
  const m = textoDoPdf(fake.storage.conteudos.get(`desenvolvimento-evidencias/${ls[0].storage_path}`)!).match(/DATA DA REALIZAÇÃO\n(\d\d\/\d\d\/\d{4})\n/);
  return m?.[1];
};
const auditoriaDaData = async (tid: number) => (await q(`select detalhe from public.peopleflow_dev_auditoria where acao='treinamento_concluido' and entidade_id='${tid}'`))[0].detalhe.data_realizacao;
const dataGravada = async (tid: number) => isoDe((await q(`select data_realizacao from public.peopleflow_dev_treinamentos where id=${tid}`))[0].data_realizacao);
await t("Regra (pura): informada vence; senão o dia do início em Brasília (fronteira da meia-noite); sem início, nada a presumir; data final planejada nunca entra", async () => {
  const r = (x: any) => dataEfetivaDeRealizacao(x);
  if (r({ data_realizacao: "2026-10-18", iniciado_em: "2026-10-20T19:47:55Z", data_fim: "2026-10-21" })?.data !== "2026-10-18" || r({ data_realizacao: "2026-10-18", iniciado_em: "2026-10-20T19:47:55Z" })?.origem !== "informada") throw new Error("informada deve ser preservada");
  if (r({ iniciado_em: "2026-10-20T19:47:55Z" })?.data !== "2026-10-20") throw new Error("início à tarde");
  if (r({ iniciado_em: "2026-10-21T02:59:59Z" })?.data !== "2026-10-20") throw new Error("23:59 de Brasília ainda é o dia 20");
  if (r({ iniciado_em: "2026-10-21T03:00:00Z" })?.data !== "2026-10-21") throw new Error("00:00 de Brasília já é o dia 21");
  if (r({ data_fim: "2026-10-21", data_inicio: "2026-10-20" }) !== null) throw new Error("sem início nem data informada não há data a presumir");
});
await t("Planejado de hoje até daqui a 2 dias, iniciado hoje, sem data informada: conclui com o DIA DO INÍCIO (não a data final planejada); auditoria e PDF coerentes", async () => {
  const id = await realizado({ data_fim: somaDias(hojeSP, 2) });
  if ((await q(`select data_realizacao from public.peopleflow_dev_treinamentos where id=${id}`))[0].data_realizacao !== null) throw new Error("a data efetiva não deve ser preenchida sozinha antes da conclusão");
  await espera("ge", "treinamento_concluir", { id }, 403); // só o RH conclui
  await espera("rh", "treinamento_concluir", { id }, 200);
  if ((await dataGravada(id)) !== hojeSP) throw new Error("gravou " + (await dataGravada(id)));
  const a = await auditoriaDaData(id);
  if (a.origem !== "inicio_da_realizacao" || a.valor !== hojeSP || isoDe(a.planejada_fim) !== somaDias(hojeSP, 2)) throw new Error(JSON.stringify(a));
  if ((await dataDoPdf(id)) !== dataBRde(hojeSP)) throw new Error("PDF com data diferente da gravada: " + (await dataDoPdf(id)));
});
await t("Planejado para daqui a 3 dias mas realizado hoje: a data efetiva é hoje, nem a prevista nem a final", async () => {
  const id = await realizado({ data_inicio: somaDias(hojeSP, 3), data_fim: somaDias(hojeSP, 4) });
  await espera("rh", "treinamento_concluir", { id }, 200);
  if ((await dataGravada(id)) !== hojeSP) throw new Error("gravou " + (await dataGravada(id)));
  if ((await dataDoPdf(id)) !== dataBRde(hojeSP)) throw new Error("PDF");
});
await t("Data efetiva INFORMADA (diferente do planejado e do início) é preservada, auditada como informada e usada no PDF; quem não conduz não a altera", async () => {
  const id = await realizado({ data_fim: somaDias(hojeSP, 2) });
  const informada = somaDias(hojeSP, -2);
  await espera("hugo", "treinamento_realizacao", { id, data_realizacao: informada }, 403);
  await espera("rh", "treinamento_realizacao", { id, data_realizacao: informada }, 200);
  await espera("rh", "treinamento_concluir", { id }, 200);
  const a = await auditoriaDaData(id);
  if (a.origem !== "informada" || isoDe(a.valor) !== informada) throw new Error(JSON.stringify(a));
  if ((await dataGravada(id)) !== informada || (await dataDoPdf(id)) !== dataBRde(informada)) throw new Error("PDF/gravação devem trazer a data informada: " + (await dataDoPdf(id)));
});
await t("Fuso: início às 23:30 de Brasília (02:30 UTC do dia seguinte) conta como o dia do início em Brasília", async () => {
  const id = await realizado({});
  await db.exec(`update public.peopleflow_dev_treinamentos set iniciado_em='${somaDias(hojeSP, 1)}T02:30:00Z' where id=${id}`); // 23:30 de hojeSP em Brasília
  await espera("rh", "treinamento_concluir", { id }, 200);
  if ((await dataGravada(id)) !== hojeSP) throw new Error("deveria ser " + hojeSP + ": " + (await dataGravada(id)));
});
await t("Externo concluído a partir de 'planejado' (sem início no sistema): sem data informada não conclui; com data informada conclui", async () => {
  const e = await espera("rh", "treinamento_salvar", { tipo: "capacitacao_tecnica", modalidade: "externo", titulo: "Curso externo", formato: "online", instrutor_externo: "Instituição X", data_inicio: hojeSP, data_fim: somaDias(hojeSP, 1), responsavel_colaborador_id: 1 }, 200);
  await espera("rh", "participantes_adicionar", { treinamento_id: e.id, colaborador_ids: [1] }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: e.id, participante_ids: [(await part(e.id, 1)).id], presenca: "presente", motivo: "Certificado" }, 200);
  const u = await espera("rh", "evidencia_upload_url", { treinamento_id: e.id, tipo: "certificado", file_name: "c.pdf", mime: "application/pdf", tamanho_bytes: 500 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 500, "application/pdf");
  await espera("rh", "evidencia_registrar", { treinamento_id: e.id, path: u.path, tipo: "certificado", file_name: "c.pdf" }, 200);
  const r = await chamar("rh", "treinamento_concluir", { id: e.id });
  if (r.c !== 422 || !/data de realização/i.test(r.b.error)) throw new Error(JSON.stringify(r));
  await espera("rh", "treinamento_realizacao", { id: e.id, data_realizacao: somaDias(hojeSP, -1) }, 200);
  await espera("rh", "treinamento_concluir", { id: e.id }, 200);
  if ((await dataGravada(e.id)) !== somaDias(hojeSP, -1)) throw new Error("data informada do externo");
});
await t("Tela: o RH vê a data efetiva e a origem antes de concluir; nenhum ponto do app/servidor usa a data final planejada como data efetiva", async () => {
  const tela = fs.readFileSync(`${PF}/src/features/desenvolvimento/TreinamentoPage.tsx`, "utf8");
  if (!/dataEfetivaDeRealizacao\(t\)/.test(tela) || !/Confira antes de concluir/.test(tela) || !/informe a data de realização para concluir/.test(tela)) throw new Error("tela sem a conferência da data efetiva");
  for (const f of ["api/_lib/desenvolvimentoAcoes.ts", "src/features/desenvolvimento/TreinamentoPage.tsx", "src/features/desenvolvimento/TreinamentosPage.tsx", "src/features/desenvolvimento/devRepository.ts"]) {
    if (/data_realizacao\s*\?\?\s*(t\.|r\.)?data_fim/.test(fs.readFileSync(`${PF}/${f}`, "utf8"))) throw new Error(f + " ainda usa data_fim como data efetiva");
  }
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
await t("Meus treinamentos no celular: cartões com os mesmos dados da tabela (título, código, documento, data, carga, situação); tabela preservada no desktop; sem alterar a consulta", async () => {
  const pg = fs.readFileSync(`${PF}/src/features/desenvolvimento/MeusTreinamentosPage.tsx`, "utf8");
  const css = fs.readFileSync(`${PF}/src/features/desenvolvimento/MeusTreinamentos.module.css`, "utf8");
  const cartao = pg.slice(pg.indexOf("mobile.cartoes"));
  for (const campo of ["t.titulo", "t.codigo", "t.documento", "formatarData(t.data)", "formatarCarga(t.carga_min)", "SITUACAO[t.situacao]", "PRESENCA[t.presenca].rotulo"]) if (!cartao.includes(campo)) throw new Error("cartão sem " + campo);
  if (!/<table/.test(pg) || !/<th>Treinamento<\/th>/.test(pg)) throw new Error("tabela do desktop removida");
  if (!/@media \(max-width: 700px\)[\s\S]*\.tabela\s*\{\s*display:\s*none/.test(css) || !/\.cartoes\s*\{\s*display:\s*none/.test(css)) throw new Error("alternância tabela/cartões só no celular");
  if (!/meuHistorico\(\)/.test(pg) || /homologacao/.test(pg)) throw new Error("a página não deve mexer na consulta nem na regra de homologação (fica no servidor)");
});
await t("Visão oficial do histórico guarda a revisão efetivamente treinada (04), não a vigente (05)", async () => {
  const h = await q(`select lista_mestra_revisao from public.peopleflow_dev_v_historico where colaborador_id=3 and lista_mestra_codigo='P-PR-001'`);
  if (h.length !== 1 || h[0].lista_mestra_revisao !== "04") throw new Error(JSON.stringify(h));
});

console.log("Histórico individual (RH/Gestor): presença, eficácia, evidências e acesso");
const hist = await import(pathToFileURL(`${PF}/src/features/desenvolvimento/historicoColaborador.ts`).href);
const como = async (uid: string, sql: string) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return await q(sql); } finally { await db.exec("reset role;"); }
};
// as 3 consultas que a tela faz (visão de participações, prazo da eficácia e evidências), com o papel real de quem consulta (RLS valendo)
const COLS_VIEW = "participante_id, treinamento_id, treinamento_codigo, titulo, situacao, presenca_status, presenca_metodo, status_treinamento, exige_eficacia, eficacia_resultado";
const visao = (uid: string, colab: number) => como(uid, `select ${COLS_VIEW} from public.peopleflow_dev_v_participacoes where colaborador_id=${colab} order by participante_id`);
const evid = (uid: string, tid: number) => como(uid, `select id, tipo, participante_id from public.peopleflow_dev_evidencias where treinamento_id=${tid} and substituida_em is null order by id`);

await t("RH: a visão traz presença, método e eficácia de cada participação (QR, manual, eficaz, ausente) — previstos, ausências e reposições preservados", async () => {
  const caio = (await visao(U.rh, 3)).find((r) => r.treinamento_id === tPop);
  if (!caio || caio.presenca_status !== "presente" || caio.presenca_metodo !== "qr" || caio.eficacia_resultado !== "eficaz" || caio.exige_eficacia !== true || caio.situacao !== "realizado" || caio.status_treinamento !== "concluido") throw new Error(JSON.stringify(caio));
  const davi = (await visao(U.rh, 4)).find((r) => r.treinamento_id === tPop);
  if (davi?.presenca_status !== "presente" || davi.presenca_metodo !== "manual" || davi.eficacia_resultado !== null) throw new Error("Davi: presente por retificação manual, sem eficácia: " + JSON.stringify(davi));
  const iris = await visao(U.rh, 9);
  const sit = iris.map((r) => r.situacao).sort().join();
  if (sit !== "ausente,previsto") throw new Error("Íris: ausente no original e reposição prevista: " + sit);
  if (iris.find((r) => r.situacao === "ausente")?.presenca_metodo !== "manual") throw new Error("método da ausência");
});
await t("Homologação/teste fora do histórico oficial (nem para o RH)", async () => {
  const testes = (await q(`select id from public.peopleflow_dev_treinamentos where homologacao`)).map((r) => r.id);
  if (testes.length === 0) throw new Error("o cenário deveria ter um treinamento de teste");
  const rh = await como(U.rh, `select treinamento_id from public.peopleflow_dev_v_participacoes where treinamento_id = any(array[${testes.join(",")}])`);
  if (rh.length !== 0) throw new Error("teste apareceu no histórico: " + JSON.stringify(rh));
});
await t("Acesso: RH consulta qualquer colaborador; Gestor a equipe pela tela; colaborador comum não lê nada direto (só o próprio histórico, pelo servidor)", async () => {
  if ((await visao(U.ge, 3)).length === 0 || (await visao(U.ge, 5)).length === 0) throw new Error("Bia deveria ver a própria equipe");
  if ((await visao(U.gil, 4)).length === 0) throw new Error("Gil deveria ver Davi (liderado)");
  if ((await visao(U.gil, 3)).length !== 0) throw new Error("Gil não vê Caio (outra equipe, sem relação com o treinamento)");
  for (const tabela of ["peopleflow_dev_v_participacoes", "peopleflow_dev_participantes", "peopleflow_dev_evidencias", "peopleflow_dev_treinamentos"]) {
    if ((await como(U.p3, `select 1 from public.${tabela}`)).length !== 0) throw new Error("colaborador comum leu " + tabela);
  }
  const meu = await espera("p3", "meu_historico", {}, 200);
  const doCaio = meu.treinamentos.find((x: any) => x.documento === "P-PR-001 rev. 04");
  if (!doCaio || doCaio.presenca !== "presente") throw new Error(JSON.stringify(meu));
});
await t("Evidências: lista de presença vigente e certificado individual aparecem; o RH abre qualquer uma; o gestor só as da própria equipe (link emitido pelo servidor)", async () => {
  const davi = (await part(tPop, 4)).id, caio = (await part(tPop, 3)).id;
  const subir = async (pid: number, nome: string) => {
    const u = await espera("rh", "evidencia_upload_url", { treinamento_id: tPop, participante_id: pid, tipo: "certificado", file_name: nome, mime: "application/pdf", tamanho_bytes: 500 }, 200);
    fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 500, "application/pdf");
    return (await espera("rh", "evidencia_registrar", { treinamento_id: tPop, participante_id: pid, path: u.path, tipo: "certificado", file_name: nome }, 200)).id as number;
  };
  const certDavi = await subir(davi, "cert-davi.pdf"), certCaio = await subir(caio, "cert-caio.pdf");
  const rh = await evid(U.rh, tPop);
  const lista = rh.filter((e) => e.tipo === "lista_presenca");
  if (lista.length !== 1) throw new Error("só a versão vigente da lista deve aparecer: " + JSON.stringify(rh));
  // o que a tela monta para o Caio: lista + certificado dele; nunca o certificado do Davi nem a foto da sala
  const linhaCaio = { participante_id: caio, treinamento_id: tPop };
  const paraCaio = hist.evidenciasDaParticipacao(linhaCaio, rh.map((e) => ({ ...e, treinamento_id: tPop, file_name: "x", enviado_em: "" })));
  const tipos = paraCaio.map((e: any) => `${e.tipo}:${e.participante_id ?? "-"}`).sort().join();
  if (tipos !== `certificado:${caio},lista_presenca:-`) throw new Error("evidências do Caio: " + tipos);
  await espera("rh", "evidencia_url", { id: certDavi }, 200);
  await espera("rh", "evidencia_url", { id: lista[0].id }, 200);
  await espera("ge", "evidencia_url", { id: certCaio }, 200); // Caio é da equipe da Bia
  await espera("ge", "evidencia_url", { id: lista[0].id }, 200);
  await espera("ge", "evidencia_url", { id: certDavi }, 403); // Davi é da equipe do Gil
  await espera("gil", "evidencia_url", { id: certDavi }, 200);
  await espera("gil", "evidencia_url", { id: certCaio }, 403);
  await espera("p3", "evidencia_url", { id: certCaio }, 401); // colaborador comum não abre evidência (nem a própria) nesta etapa
});
await t("Regra de eficácia na tela: não exigida, resultado, pendente (prazo e vencimento), não se aplica e 'após a realização'", async () => {
  const base = { exige_eficacia: true, eficacia_resultado: null, presenca_status: "presente", status_treinamento: "concluido", eficacia_prazo: "2026-12-01" };
  const s = (x: any, hoje = "2026-10-21") => hist.situacaoEficacia({ ...base, ...x }, hoje);
  if (s({ exige_eficacia: false }).texto !== "Não exigida") throw new Error("não exigida");
  if (s({ eficacia_resultado: "eficaz" }).texto !== "Eficaz" || s({ eficacia_resultado: "nao_eficaz" }).tom !== "danger" || s({ eficacia_resultado: "parcialmente_eficaz" }).texto !== "Parcialmente eficaz") throw new Error("resultado");
  const pend = s({});
  if (pend.texto !== "Pendente" || pend.tom !== "warning" || pend.prazo !== "2026-12-01" || pend.vencida) throw new Error("pendente no prazo: " + JSON.stringify(pend));
  const venc = s({ eficacia_prazo: "2026-10-01" });
  if (venc.texto !== "Pendente" || venc.tom !== "danger" || !venc.vencida) throw new Error("pendente vencida: " + JSON.stringify(venc));
  if (s({ eficacia_prazo: null }).prazo !== null) throw new Error("sem prazo");
  if (s({ presenca_status: "ausente" }).texto !== "Não se aplica") throw new Error("ausente não é avaliado");
  if (s({ presenca_status: "pendente", status_treinamento: "planejado" }).texto !== "Após a realização") throw new Error("previsto");
  if (s({ presenca_status: "presente", status_treinamento: "em_andamento" }).texto !== "Pendente") throw new Error("em andamento com presença já pode ser avaliado (regra do servidor)");
});
await t("Evidências na tela: lista de presença e certificado do treinamento + anexos da própria pessoa; ordem fixa e numeração quando há mais de um do mesmo tipo", async () => {
  const ev = (id: number, tipo: string, participante_id: number | null) => ({ id, treinamento_id: 7, participante_id, tipo, file_name: "f", enviado_em: "" });
  const todas = [ev(5, "foto", null), ev(4, "certificado", 2), ev(3, "certificado", 1), ev(2, "lista_presenca", null), ev(1, "certificado", 1), ev(9, "outro", 1), { ...ev(8, "lista_presenca", null), treinamento_id: 99 }];
  const r = hist.evidenciasDaParticipacao({ participante_id: 1, treinamento_id: 7 }, todas).map((e: any) => `${e.id}:${e.rotulo}`).join(" | ");
  if (r !== "2:Lista de presença | 1:Certificado 1 | 3:Certificado 2 | 9:Outro") throw new Error(r);
});
await t("Meus treinamentos: só a PRESENÇA é acrescentada (nada de eficácia, método ou observações); cada pessoa vê a própria", async () => {
  const caio = await espera("p3", "meu_historico", {}, 200);
  const txt = JSON.stringify(caio);
  if (/eficaci|metodo|observ|motivo|qr/i.test(txt)) throw new Error("vazou informação além da presença: " + txt);
  if (caio.treinamentos.some((x: any) => !["presente", "ausente", "pendente"].includes(x.presenca))) throw new Error(txt);
  const iris = (await espera("p9", "meu_historico", {}, 200)).treinamentos.map((x: any) => `${x.situacao}:${x.presenca}`).sort().join();
  if (iris !== "agendado:presente,ausente:ausente") throw new Error("Íris (confirmou pelo QR a reposição em andamento): " + iris);
  const davi = (await espera("p4", "meu_historico", {}, 200)).treinamentos.find((x: any) => x.situacao === "realizado");
  if (davi?.presenca !== "presente") throw new Error("Davi (retificado): " + JSON.stringify(davi));
});
await t("Visualização e responsividade: tabela com 7 colunas no desktop, cartões abaixo de 1100 px, link para o treinamento, mesmos dados nos dois; página 'Por colaborador' usa o componente", async () => {
  const comp = fs.readFileSync(`${PF}/src/features/desenvolvimento/HistoricoTreinamentos.tsx`, "utf8");
  const css = fs.readFileSync(`${PF}/src/features/desenvolvimento/HistoricoTreinamentos.module.css`, "utf8");
  for (const col of ["Data", "Treinamento", "Carga", "Situação", "Presença", "Eficácia", "Evidências"]) if (!new RegExp(`<th>${col}</th>`).test(comp)) throw new Error("coluna " + col);
  const cartao = comp.slice(comp.indexOf("visual.cartoes"));
  for (const campo of ["h.titulo", "h.treinamento_codigo", "formatarData(h.data_referencia)", "formatarCarga(h.carga_horaria_min)", "presencaDe(h)", "eficacia.texto", "abrirTreinamento(h.treinamento_id)", "abrirEvidencia(e.id)", "SITUACAO_PARTICIPACAO[h.situacao]"]) if (!cartao.includes(campo)) throw new Error("cartão sem " + campo);
  if (!comp.includes("/desenvolvimento/treinamento/${id}")) throw new Error("link do treinamento");
  if (!/@media \(max-width: 1100px\)[\s\S]*\.tabela\s*\{\s*display:\s*none/.test(css) || !/\.cartoes\s*\{\s*display:\s*none/.test(css)) throw new Error("alternância tabela/cartões");
  if (!/<HistoricoTreinamentos linhas=\{historico\.dados\}/.test(fs.readFileSync(`${PF}/src/features/desenvolvimento/HabilidadesPage.tsx`, "utf8"))) throw new Error("a aba Por colaborador não usa o componente");
  if (/homologacao/.test(comp)) throw new Error("a tela não decide homologação (a visão do banco já a exclui)");
});

console.log("Avaliação de reação");
const reac = await import(pathToFileURL(`${PF}/src/domain/avaliacaoReacao.ts`).href);
const jsonDe = (v: unknown) => JSON.stringify(v);
const codigoDe = async (tid: number) => (await q(`select codigo from public.peopleflow_dev_treinamentos where id=${tid}`))[0].codigo as string;
const qtdReacoes = async (where = "true") => (await q(`select count(*)::int n from public.peopleflow_dev_avaliacoes_reacao where ${where}`))[0].n as number;
const BOAS = [5, 4, 5, 3, 4];
let tRep = 0, tHom = 0;

await t("Migration: aditiva, idempotente (a data de ativação não muda ao reaplicar), reversível e sem apagar avaliações respondidas", async () => {
  const antes = (await q("select ativa_desde from public.peopleflow_dev_reacao_config"))[0].ativa_desde;
  await db.exec(SQL("desenvolvimento_avaliacao_reacao.sql"));
  const depois = (await q("select ativa_desde, count(*) over ()::int n from public.peopleflow_dev_reacao_config"))[0];
  if (String(antes) !== String(depois.ativa_desde) || depois.n !== 1) throw new Error("reaplicar alterou a ativação ou duplicou a configuração");
  const rls = await q("select relname, relrowsecurity from pg_class where relname in ('peopleflow_dev_avaliacoes_reacao','peopleflow_dev_reacao_config')");
  if (rls.length !== 2 || rls.some((r) => !r.relrowsecurity)) throw new Error("RLS desligada");
  const sem = await q("select count(*)::int n from pg_policies where tablename in ('peopleflow_dev_avaliacoes_reacao','peopleflow_dev_reacao_config')");
  if (sem[0].n !== 0) throw new Error("não deveria haver políticas (somente o servidor lê/grava)");
  const priv = await q("select has_table_privilege('authenticated','public.peopleflow_dev_avaliacoes_reacao','select') a, has_table_privilege('anon','public.peopleflow_dev_avaliacoes_reacao','select') b, has_table_privilege('service_role','public.peopleflow_dev_avaliacoes_reacao','insert') c");
  if (priv[0].a || priv[0].b || !priv[0].c) throw new Error("privilégios: " + jsonDe(priv));
});

await t("Reversão: recusada enquanto houver avaliações respondidas (nada é apagado); ciclo aplicar → reverter → reaplicar num banco limpo", async () => {
  // (o bloqueio com respostas existentes é verificado mais adiante, depois que há respostas)
  const d = new PGlite();
  await d.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$; create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (bucket_id text, name text); create table public.colaboradores (id bigint primary key, nome text, cargo text, admissao date, desligado boolean, empresa_afiliada boolean); create table public.peopleflow_descricoes_cargo (cargo_nome text primary key, obsoleto boolean default false); create table public.peopleflow_pdi (id bigint primary key);");
  for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_avaliacao_reacao.sql", "desenvolvimento_avaliacao_reacao_rollback.sql", "desenvolvimento_avaliacao_reacao_rollback.sql", "desenvolvimento_avaliacao_reacao.sql", "desenvolvimento_avaliacao_reacao.sql"]) await d.exec(SQL(f));
  if ((await d.query("select count(*)::int n from public.peopleflow_dev_reacao_config")).rows[0].n !== 1) throw new Error("configuração após o ciclo");
});

await t("Regras puras: elegível = presença confirmada em treinamento OFICIAL a partir da ativação, por qualquer método; nada de retroativo, teste, removido ou sem presença", async () => {
  const ativa = "2026-10-21T12:00:00Z";
  const ok = { presenca_status: "presente", presenca_em: "2026-10-21T15:00:00Z" };
  const T = { homologacao: false, status: "concluido" };
  const e = (p: any, tr: any = T, a: string | null = ativa) => reac.elegivelParaReacao({ ...ok, ...p }, { ...T, ...tr }, a);
  if (!e({}) || !e({}, { status: "em_andamento" })) throw new Error("presença confirmada em andamento/concluído é elegível");
  if (e({}, { homologacao: true })) throw new Error("teste/homologação nunca");
  if (e({ presenca_em: "2026-10-20T15:00:00Z" })) throw new Error("presença anterior à ativação não é retroativa");
  if (e({ presenca_status: "ausente" }) || e({ presenca_status: "pendente" }) || e({ presenca_em: null })) throw new Error("só presente");
  if (e({ removido_em: "2026-10-21T16:00:00Z" })) throw new Error("removido");
  if (e({}, { status: "planejado" }) || e({}, { status: "cancelado" })) throw new Error("planejado/cancelado");
  if (e({}, T, null)) throw new Error("recurso não ativado: nada é elegível");
  // independe do método de presença (qr, manual, importação ou um futuro 'gravação'): a função nem olha o método
  for (const metodo of ["qr", "manual", "importacao", "gravacao"]) if (!e({ presenca_metodo: metodo })) throw new Error("método " + metodo);
  if (reac.QUESTOES.length !== 5 || reac.ESCALA.map((x: any) => x.valor).join() !== "1,2,3,4,5") throw new Error("formulário padrão: 5 perguntas, escala 1 a 5");
  if (reac.validarRespostas([1, 2, 3, 4]) !== null || reac.validarRespostas([1, 2, 3, 4, 6]) !== null || reac.validarRespostas([0, 1, 2, 3, 4]) !== null || reac.validarRespostas([1, 2, 3, 4, 2.5]) !== null || reac.validarRespostas("12345") !== null || reac.validarRespostas([1, 2, 3, 4, ""]) !== null) throw new Error("respostas inválidas aceitas");
  if (jsonDe(reac.validarRespostas([1, "2", 3, 4, 5])) !== "[1,2,3,4,5]") throw new Error("respostas válidas");
  if (jsonDe(reac.indicadorAdesao(4, 3)) !== '{"elegiveis":4,"respondidos":3,"pendentes":1,"taxa":75}' || reac.indicadorAdesao(0, 0).taxa !== null) throw new Error("adesão");
  if (jsonDe(reac.mediaPorQuestao([[5, 4, 5, 3, 4], [3, 4, 5, 3, 2]])) !== "[4,4,5,3,3]" || reac.mediaPorQuestao([])[0] !== null) throw new Error("médias");
});

await t("Retroativo: com a ativação no futuro ninguém é elegível (nem recebe a avaliação) e o servidor recusa; voltando à data real, volta a valer", async () => {
  const iso = (await q("select ativa_desde from public.peopleflow_dev_reacao_config"))[0].ativa_desde;
  await db.exec("update public.peopleflow_dev_reacao_config set ativa_desde = now() + interval '1 day'");
  try {
    const eva = await espera("p5", "meu_historico", {}, 200);
    if (eva.treinamentos.some((x: any) => x.avaliacao !== null)) throw new Error("avaliação disponível antes da ativação: " + jsonDe(eva));
    const r = await chamar("p5", "reacao_responder", { codigo: await codigoDe(tPop), respostas: BOAS });
    if (r.c !== 422) throw new Error("deveria recusar participação anterior à ativação: " + r.c);
    if ((await espera("rh", "reacao_resumo", {}, 200)).geral.elegiveis !== 0) throw new Error("resumo deveria estar zerado");
  } finally {
    await db.exec(`update public.peopleflow_dev_reacao_config set ativa_desde = '${new Date(iso).toISOString()}'`);
  }
  if ((await espera("p5", "meu_historico", {}, 200)).treinamentos.find((x: any) => x.documento === "P-PR-001 rev. 04")?.avaliacao !== "disponivel") throw new Error("deveria voltar a ficar disponível");
});

await t("O colaborador responde a PRÓPRIA avaliação, uma vez só: login obrigatório, 5 notas de 1 a 5, data/hora, usuário e auditoria; a conclusão já havia ocorrido sem nenhuma resposta", async () => {
  if ((await q(`select status from public.peopleflow_dev_treinamentos where id=${tPop}`))[0].status !== "concluido" || (await qtdReacoes()) !== 0) throw new Error("o treinamento concluiu sem depender das respostas");
  const cod = await codigoDe(tPop);
  await espera("", "reacao_responder", { codigo: cod, respostas: BOAS }, 401);
  await espera("semcadastro", "reacao_responder", { codigo: cod, respostas: BOAS }, 409);
  for (const ruins of [[5, 4, 5, 3], [5, 4, 5, 3, 6], [0, 4, 5, 3, 4], [5, 4, 5, 3, "x"], "54534", null]) await espera("p3", "reacao_responder", { codigo: cod, respostas: ruins }, 422);
  await espera("p3", "reacao_responder", { codigo: "TRN-0000-0000", respostas: BOAS }, 404);
  const r = await espera("p3", "reacao_responder", { codigo: cod, respostas: BOAS }, 200);
  if (!r.respondida_em) throw new Error("sem data/hora");
  await espera("p3", "reacao_responder", { codigo: cod, respostas: [1, 1, 1, 1, 1] }, 409); // uma resposta por colaborador e treinamento
  const linhas = await q(`select colaborador_id, treinamento_id, q1, q2, q3, q4, q5, respondido_por, respondido_em, versao_formulario from public.peopleflow_dev_avaliacoes_reacao`);
  if (linhas.length !== 1 || Number(linhas[0].colaborador_id) !== 3 || linhas[0].respondido_por !== U.p3 || jsonDe([linhas[0].q1, linhas[0].q2, linhas[0].q3, linhas[0].q4, linhas[0].q5]) !== jsonDe(BOAS) || !linhas[0].respondido_em || linhas[0].versao_formulario !== 1) throw new Error(jsonDe(linhas));
  const aud = await q(`select colaborador_id, user_id, detalhe from public.peopleflow_dev_auditoria where acao='reacao_respondida'`);
  if (aud.length !== 1 || Number(aud[0].colaborador_id) !== 3 || aud[0].user_id !== U.p3 || Number(aud[0].detalhe.treinamento_id) !== tPop) throw new Error("auditoria: " + jsonDe(aud));
});

await t("Identidade vem da sessão: o corpo não escolhe a pessoa; quem não participou (ausente, fora da turma, teste) não avalia; presença manual conta (independe do método)", async () => {
  const cod = await codigoDe(tPop);
  // Eva envia como se fosse o Caio/Íris: o servidor ignora e grava a dela
  await espera("p5", "reacao_responder", { codigo: cod, respostas: [4, 4, 4, 4, 4], colaborador_id: 3, participante_id: (await part(tPop, 3)).id, user_id: U.p3 }, 200);
  if ((await qtdReacoes("colaborador_id = 5")) !== 1 || (await qtdReacoes("colaborador_id = 3")) !== 1) throw new Error("gravou em nome de terceiro");
  await espera("p9", "reacao_responder", { codigo: cod, respostas: BOAS }, 422); // Íris faltou neste treinamento
  // Davi consta como presente por RETIFICAÇÃO MANUAL do RH: a avaliação independe do método
  await espera("p4", "reacao_responder", { codigo: cod, respostas: [3, 3, 4, 4, 5] }, 200);
  tRep = (await q(`select id from public.peopleflow_dev_treinamentos where reposicao_de_id=${tPop}`))[0].id;
  await espera("p4", "reacao_responder", { codigo: await codigoDe(tRep), respostas: BOAS }, 403); // Davi não consta na turma da reposição
  // treinamento de homologação/teste: o servidor recusa e o banco também
  tHom = (await espera("rh", "treinamento_salvar", { tipo: "desenvolvimento", modalidade: "interno", titulo: "Teste da avaliação", data_inicio: hojeSP, responsavel_colaborador_id: 1, homologacao: true }, 200)).id;
  await espera("rh", "participantes_adicionar", { treinamento_id: tHom, colaborador_ids: [1] }, 200);
  await espera("rh", "treinamento_iniciar", { id: tHom }, 200);
  await espera("rh", "presenca_manual", { treinamento_id: tHom, participante_ids: [(await part(tHom, 1)).id], presenca: "presente", motivo: "Teste" }, 200);
  await espera("rh", "reacao_responder", { codigo: await codigoDe(tHom), respostas: BOAS }, 422);
  let bloqueou = false;
  try { await db.exec(`insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, q1, q2, q3, q4, q5, respondido_por) select id, treinamento_id, colaborador_id, 5,5,5,5,5, '${U.rh}' from public.peopleflow_dev_participantes where treinamento_id=${tHom}`); } catch { bloqueou = true; }
  if (!bloqueou) throw new Error("o banco aceitou avaliação de treinamento de teste");
});

await t("Banco: nota fora de 1–5, segunda resposta, alteração, exclusão e participação ausente são recusadas; só o servidor acessa", async () => {
  const tenta = async (sql: string) => { try { await db.exec(sql); return false; } catch { return true; } };
  const pCaio = (await part(tPop, 3)).id;
  if (!(await tenta(`update public.peopleflow_dev_avaliacoes_reacao set q1 = 1 where participante_id=${pCaio}`))) throw new Error("alterou uma avaliação enviada");
  if (!(await tenta(`delete from public.peopleflow_dev_avaliacoes_reacao`)) || !(await tenta(`truncate public.peopleflow_dev_avaliacoes_reacao`))) throw new Error("apagou avaliação");
  if (!(await tenta(`insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, q1, q2, q3, q4, q5, respondido_por) values (${pCaio}, ${tPop}, 3, 5,5,5,5,5, '${U.rh}')`))) throw new Error("duas respostas para a mesma participação");
  const pIris = (await part(tPop, 9)).id;
  if (!(await tenta(`insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, q1, q2, q3, q4, q5, respondido_por) values (${pIris}, ${tPop}, 9, 5,5,5,5,5, '${U.rh}')`))) throw new Error("avaliação de quem faltou");
  if (!(await tenta(`insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, q1, q2, q3, q4, q5, respondido_por) values (${(await part(tPop, 2)).id}, ${tPop}, 2, 6,5,5,5,5, '${U.rh}')`))) throw new Error("nota 6");
  if (!(await tenta(`insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, q1, q2, q3, q4, q5, respondido_por) values (${(await part(tPop, 2)).id}, ${tPop}, 3, 5,5,5,5,5, '${U.rh}')`))) throw new Error("participação de outra pessoa");
  for (const uid of [U.p3, U.ge, U.rh]) {
    let linhas = -1;
    try { linhas = (await como(uid, "select 1 from public.peopleflow_dev_avaliacoes_reacao")).length; } catch { linhas = 0; } // sem privilégio = negado
    if (linhas !== 0) throw new Error("leitura direta pelo navegador deveria ser negada/vazia");
  }
});

await t("Meus treinamentos: disponível após a presença (também depois de concluído), respondida com data e hora, não se aplica a ausente/teste; as notas nunca voltam ao colaborador", async () => {
  const caio = await espera("p3", "meu_historico", {}, 200);
  const doCaio = caio.treinamentos.find((x: any) => x.documento === "P-PR-001 rev. 04");
  if (doCaio.avaliacao !== "respondida" || !doCaio.avaliacao_em) throw new Error(jsonDe(doCaio));
  if (/"q[1-5]"|respostas|nota/i.test(jsonDe(caio))) throw new Error("as notas não devem voltar ao colaborador: " + jsonDe(caio));
  const iris = (await espera("p9", "meu_historico", {}, 200)).treinamentos;
  if (iris.find((x: any) => x.situacao === "ausente")?.avaliacao !== null) throw new Error("ausente não avalia");
  if (iris.find((x: any) => x.situacao === "agendado")?.avaliacao !== "disponivel") throw new Error("reposição em andamento com presença por QR: disponível");
});

await t("Página de presença por QR: logo após confirmar, a avaliação já vem disponível; depois de enviada, aparece como respondida", async () => {
  const tk = (await espera("resp", "qr_gerar", { treinamento_id: tRep }, 200)).token;
  const info = await espera("p9", "presenca_info", { token: tk }, 200);
  if (info.situacao !== "confirmada" || info.avaliacao !== "disponivel" || info.codigo !== (await codigoDe(tRep))) throw new Error(jsonDe(info));
  await espera("p9", "reacao_responder", { codigo: info.codigo, respostas: [5, 5, 5, 5, 5] }, 200);
  if ((await espera("p9", "presenca_info", { token: tk }, 200)).avaliacao !== "respondida") throw new Error("deveria constar como respondida");
  await espera("resp", "qr_encerrar", { treinamento_id: tRep }, 200);
});

await t("Reversão com avaliações respondidas é recusada e preserva tudo", async () => {
  const n = await qtdReacoes();
  if (n === 0) throw new Error("o cenário deveria ter respostas");
  let recusou = false;
  try { await db.exec(SQL("desenvolvimento_avaliacao_reacao_rollback.sql")); } catch (e) { recusou = /Reversão bloqueada/.test((e as Error).message); await db.exec("rollback"); } // o SQL Editor também desfaz a transação ao falhar
  if (!recusou || (await qtdReacoes()) !== n) throw new Error("a reversão deveria ser recusada sem apagar nada");
});
await t("RH acompanha: respondidos, pendentes e taxa de adesão (geral e por treinamento) e quem respondeu/está pendente; só o RH; teste fora; conclusão independe", async () => {
  const resumo = await espera("rh", "reacao_resumo", {}, 200);
  const esp = (await q(`select count(*)::int n from public.peopleflow_dev_participantes p join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
    where p.removido_em is null and p.presenca_status = 'presente' and not t.homologacao and t.status in ('em_andamento','concluido') and p.presenca_em >= (select ativa_desde from public.peopleflow_dev_reacao_config)`))[0].n;
  if (resumo.geral.elegiveis !== esp || resumo.geral.respondidos !== (await qtdReacoes()) || resumo.geral.pendentes !== esp - resumo.geral.respondidos) throw new Error("geral: " + jsonDe(resumo.geral) + " esperado " + esp);
  if (resumo.treinamentos.some((x: any) => x.codigo === undefined || x.id === tHom)) throw new Error("treinamento de teste nos indicadores");
  const pop = resumo.treinamentos.find((x: any) => x.id === tPop);
  if (pop.elegiveis !== 4 || pop.respondidos !== 3 || pop.pendentes !== 1 || pop.taxa !== 75) throw new Error("tPop: " + jsonDe(pop));
  const rep = resumo.treinamentos.find((x: any) => x.id === tRep);
  if (rep.elegiveis !== 1 || rep.respondidos !== 1 || rep.taxa !== 100) throw new Error("reposição: " + jsonDe(rep));
  const det = await espera("rh", "reacao_detalhe", { treinamento_id: tPop }, 200);
  if (det.participantes.length !== 4 || det.participantes[0].estado !== "pendente" || det.participantes.filter((x: any) => x.estado === "respondida").length !== 3) throw new Error(jsonDe(det.participantes.map((x: any) => x.estado)));
  const caio = det.participantes.find((x: any) => x.colaborador_id === 3);
  if (jsonDe(caio.respostas) !== jsonDe(BOAS) || !caio.respondido_em) throw new Error("rastreabilidade: " + jsonDe(caio));
  if (jsonDe(det.medias) !== jsonDe([4, 3.7, 4.3, 3.7, 4.3])) throw new Error("médias: " + jsonDe(det.medias));
  if ((await espera("rh", "reacao_detalhe", { treinamento_id: tHom }, 200)).treinamento !== null) throw new Error("detalhe de teste");
  for (const quem of ["ge", "gil", "resp", "hugo"]) { await espera(quem, "reacao_resumo", {}, 403); await espera(quem, "reacao_detalhe", { treinamento_id: tPop }, 403); }
  await espera("p3", "reacao_resumo", {}, 401);
  // a conclusão não depende das respostas: um treinamento oficial com avaliação pendente conclui normalmente
  const id = await realizado({});
  await espera("rh", "treinamento_concluir", { id }, 200);
  const d = await espera("rh", "reacao_detalhe", { treinamento_id: id }, 200);
  if (d.pendentes !== 1 || d.respondidos !== 0) throw new Error("avaliação pendente após a conclusão: " + jsonDe(d));
  const fonte = fs.readFileSync(`${PF}/api/_lib/desenvolvimentoAcoes.ts`, "utf8");
  const concluir = fonte.slice(fonte.indexOf("async function treinamentoConcluir"), fonte.indexOf("async function treinamentoCancelar"));
  if (/reacao|Reacao/.test(concluir)) throw new Error("a conclusão não pode consultar a avaliação de reação");
});

await t("Telas: formulário de 5 perguntas na escala 1–5 (envio só completo); Meus treinamentos e página de presença usam o mesmo componente; aba do RH e seção do treinamento só para o RH e fora de teste", async () => {
  const lerTela = (f: string) => fs.readFileSync(`${PF}/${f}`, "utf8");
  const form = lerTela("src/features/desenvolvimento/FormularioReacao.tsx");
  if (!/QUESTOES\.map/.test(form) || !/ESCALA\.map/.test(form) || !/type="radio"/.test(form) || !/disabled=\{!completo \|\| enviando\}/.test(form) || !/Responder depois/.test(form)) throw new Error("formulário");
  const meus = lerTela("src/features/desenvolvimento/MeusTreinamentosPage.tsx");
  if (!/<FormularioReacao/.test(meus) || !/Avaliar treinamento/.test(meus) || !/t\.avaliacao === "disponivel"/.test(meus) || !/Respondida/.test(meus)) throw new Error("Meus treinamentos");
  const part2 = lerTela("src/participar/Participar.tsx");
  if (!/<FormularioReacao/.test(part2) || !/avaliacao === "disponivel"/.test(part2) || !/reacao_responder/.test(part2)) throw new Error("página de presença");
  const lista = lerTela("src/features/desenvolvimento/TreinamentosPage.tsx");
  if (!/perfil === "RH" \? \[\{ id: "avaliacao-reacao"/.test(lista) || !/<ReacaoAba \/>/.test(lista)) throw new Error("aba do RH");
  const pag = lerTela("src/features/desenvolvimento/TreinamentoPage.tsx");
  if (!/p\.ehRH && !t\.homologacao && \(t\.status === "em_andamento" \|\| t\.status === "concluido"\) \? <ReacaoDoTreinamento/.test(pag)) throw new Error("seção do treinamento");
  const css = lerTela("src/features/desenvolvimento/FormularioReacao.module.css");
  if (!/min-height:\s*44px/.test(css) || !/repeat\(5, 1fr\)/.test(css)) throw new Error("alvos de toque / escala em 5 colunas");
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
