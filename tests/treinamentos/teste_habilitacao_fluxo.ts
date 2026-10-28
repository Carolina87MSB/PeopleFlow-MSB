// Modelo de habilitação (RH habilita; responsável e instrutor internos habilitados administram; gestor acompanha) — cenários completos em réplica PGlite.
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
for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_avaliacao_reacao.sql", "desenvolvimento_participacao_gravacao.sql", "desenvolvimento_habilitacao_responsaveis.sql"]) await db.exec(SQL(f));
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
// Modelo de habilitação — cenários completos (código REAL do servidor + migrations REAIS em réplica PGlite; dados fictícios).
//   Fabio (7) = "Manuela", responsável de Garantia da Qualidade · Hugo (8) = "Juliana", instrutora interna · Davi (4) = outra área
//   Bia (2) = Gestora da área de Hugo (acompanha) · Gil (6) = Gestor de Davi · Ana (1) = RH · Caio/Eva/Iris/Bia/Gil = participantes
// ════════════════════════════════════════════════════════════════════════
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = diaSP.format(new Date());
const maisDias = (n: number) => new Date(Date.parse(hojeSP + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const jsonDe = (x: unknown) => JSON.stringify(x);
const isoData = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const como = async (uid: string, sql: string) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`); try { return await q(sql); } finally { await db.exec("reset role;"); } };
// Jade: colaboradora recém-contratada, ainda sem conta de acesso (a admissão fica nula na réplica: o servidor não depende dela para habilitar)
await db.exec("insert into public.colaboradores (id, nome, cargo, departamento, gestor) values (10,'Jade Recente','Auxiliar','Produção','Bia Gestora')");
// como em produção: module_access registra quem concedeu e quando
await db.exec("alter table public.module_access add column concedido_por text, add column concedido_em timestamptz default now()");
const REF = "E-mail da liderança ao RH, 20/10";
const ids = async (uid: string, sql = "select id from public.peopleflow_dev_treinamentos order by id") => (await como(uid, sql)).map((x) => Number(x.id));
const cad = (extra: Record<string, unknown>) => ({ tipo: "desenvolvimento", modalidade: "interno", formato: "presencial", data_inicio: hojeSP, ...extra });
const confirmaQr = async (tok: string, quem: string[], tid: number) => {
  const qr = (await espera(tok, "qr_gerar", { treinamento_id: tid }, 200)).token;
  for (const p of quem) await espera(p, "presenca_confirmar", { token: qr }, 200);
};
const sessaoOk = async (tok: string) => { const r = await sessao(tok); if (r.c !== 200) throw new Error(`${tok}: sessão ${r.c} ${jsonDe(r.b)}`); return r.b; };

console.log("1. Habilitação pelo RH (permanente, vinculada à gestão, rastreável; sem outros módulos)");
await t("Antes da habilitação ninguém além de RH/Gestor abre o módulo, nem sendo designado; Gestor SEM habilitação acompanha mas não registra", async () => {
  await sessaoOk("rh"); await sessaoOk("ge"); await sessaoOk("gil");
  for (const tok of ["resp", "hugo", "p4", "p3"]) if ((await sessao(tok)).c !== 403) throw new Error(tok + " não deveria abrir o módulo sem habilitação");
  const bia = await sessaoOk("ge");
  if (bia.perfil !== "Gestor" || bia.habilitado !== false || bia.podeRegistrar !== false) throw new Error("Gestora sem habilitação acompanha, não registra: " + jsonDe(bia));
  await espera("ge", "treinamento_salvar", cad({ titulo: "Sem habilitação", responsavel_colaborador_id: 2 }), 403);
});
await t("O RH habilita com a referência da liderança; os demais perfis não; uma habilitação ativa por colaborador; sem a referência não habilita", async () => {
  for (const [tok, st] of [["ge", 403], ["gil", 403], ["resp", 401], ["p4", 401]] as const) await espera(tok, "habilitacao_conceder", { colaborador_id: 7, referencia: REF }, st); // quem ainda nem abriu o módulo recebe 401
  await espera("rh", "habilitacao_conceder", { colaborador_id: 7, gestor_colaborador_id: 2 }, 422);
  await espera("rh", "habilitacao_conceder", { colaborador_id: 999, gestor_colaborador_id: 2, referencia: REF }, 422);
  await espera("rh", "habilitacao_conceder", { colaborador_id: 7, gestor_colaborador_id: 7, referencia: REF }, 422);
  const h7 = await espera("rh", "habilitacao_conceder", { colaborador_id: 7, gestor_colaborador_id: 2, referencia: REF }, 200);
  const h8 = await espera("rh", "habilitacao_conceder", { colaborador_id: 8, referencia: REF }, 200); // gestão = liderança imediata cadastrada (Bia)
  const h4 = await espera("rh", "habilitacao_conceder", { colaborador_id: 4, gestor_colaborador_id: 6, referencia: REF }, 200);
  if (!h7.id || !h8.id || !h4.id || h7.acesso !== "existente") throw new Error("habilitações");
  await espera("rh", "habilitacao_conceder", { colaborador_id: 7, gestor_colaborador_id: 6, referencia: REF }, 409);
  const l = await espera("rh", "habilitacao_listar", {}, 200);
  const hugo = l.find((x: any) => x.colaborador.id === 8);
  if (!hugo || hugo.gestao.id !== 2 || hugo.departamento !== "Produção" || !hugo.ativa || !hugo.habilitado_em || hugo.habilitado_por !== NOMES[1] || hugo.referencia !== REF || hugo.revogado_em) throw new Error("RH vê usuário, área, data, quem habilitou: " + jsonDe(hugo));
  await espera("p4", "habilitacao_listar", {}, 401); // Davi ainda não abriu o módulo (o 403 vale depois da sessão: ver o teste seguinte)
  const aud = await q("select count(*)::int n from public.peopleflow_dev_auditoria where acao='habilitacao_concedida'");
  if (aud[0].n !== 3) throw new Error("auditoria da habilitação");
  // a lista da liderança mostra só a sua gestão (somente leitura)
  const lb = await espera("ge", "habilitacao_listar", {}, 200);
  if (lb.map((x: any) => x.colaborador.id).sort().join() !== "7,8") throw new Error("Bia vê os habilitados da sua gestão: " + jsonDe(lb.map((x: any) => x.colaborador.id)));
  const lg = await espera("gil", "habilitacao_listar", {}, 200);
  if (lg.map((x: any) => x.colaborador.id).join() !== "4") throw new Error("Gil vê só os da sua gestão");
});
await t("Habilitado abre o módulo como Responsavel (perfil restrito aos Treinamentos): sem acesso a outros módulos nem a dados de outras áreas", async () => {
  const f = await sessaoOk("resp");
  if (f.perfil !== "Responsavel" || f.habilitado !== true || f.podeRegistrar !== true) throw new Error(jsonDe(f));
  await sessaoOk("hugo"); await sessaoOk("p4");
  // nada além da Gestão de Treinamentos: ações do RH/necessidades/LNT recusadas e leitura direta vazia
  for (const [acao, corpo] of [["lista_mestra_salvar", { codigo: "X-1", titulo: "x", revisao_atual: "01", novo: true }], ["habilidade_ativo", { id: 1, ativo: false, motivo: "x" }], ["necessidade_registrar", { colaborador_id: 3, descricao: "x", categoria: "tecnica", justificativa: "x" }], ["treinamento_planejar", { id: 1 }], ["habilitacao_revogar", { id: 1, motivo: "x" }], ["habilitacao_opcoes", {}], ["reacao_resumo", {}], ["transferencias_listar", {}]] as const)
    await espera("resp", acao, corpo as Record<string, unknown>, 403);
  for (const tabela of ["peopleflow_dev_necessidades", "peopleflow_dev_v_conformidade", "peopleflow_dev_auditoria", "peopleflow_dev_transferencias_responsabilidade", "peopleflow_dev_lnt_ciclos"]) {
    const ex = await q(`select to_regclass('public.${tabela}') is not null as existe`);
    if (ex[0].existe && (await como(U.resp, `select count(*)::int n from public.${tabela}`).catch(() => [{ n: 0 }]))[0].n !== 0) throw new Error("habilitado leu " + tabela);
  }
});
await t("Colaborador com menos de seis meses e sem conta: o RH cria SOMENTE o acesso ao PeopleFlow (sem SST/AVD) ao habilitar — com confirmação explícita", async () => {
  const antes = (await q("select count(*)::int n from public.module_access"))[0].n;
  const opc = await espera("rh", "habilitacao_opcoes", {}, 200);
  const jade = opc.find((o: any) => o.id === 10);
  if (!jade || jade.tem_acesso !== false || jade.habilitado !== false || jade.gestor_id !== 2) throw new Error(jsonDe(jade));
  await espera("rh", "habilitacao_conceder", { colaborador_id: 10, referencia: REF }, 422); // sem conta: exige marcar "criar acesso"
  const r = await espera("rh", "habilitacao_conceder", { colaborador_id: 10, referencia: REF, criar_acesso: true }, 200);
  if (r.acesso !== "criado") throw new Error(jsonDe(r));
  const mods = await q("select modulo, concedido_por from public.module_access where user_id not in (select id from auth.users where id::text like '00000000-0000-0000-0000-0000000000%') order by modulo");
  if (jsonDe(mods) !== jsonDe([{ modulo: "peopleflow", concedido_por: "habilitacao-treinamentos" }])) throw new Error("só o módulo peopleflow, nunca sst: " + jsonDe(mods));
  if ((await q("select count(*)::int n from public.module_access"))[0].n !== antes + 1) throw new Error("só uma concessão");
  if ((await espera("rh", "habilitacao_opcoes", {}, 200)).find((o: any) => o.id === 10).tem_acesso !== true) throw new Error("acesso criado");
});

console.log("2. Responsável e instrutor: os dois administram; ninguém mais");
let TQ = 0, TX = 0, TD = 0;
await t("Hugo registra (é o responsável principal) com Fabio como instrutor interno; o habilitado só registra o que ele mesmo administra; responsável precisa ser habilitado ou do RH", async () => {
  await espera("hugo", "treinamento_salvar", cad({ titulo: "Para outra pessoa", responsavel_colaborador_id: 7 }), 422); // registrar para outro o deixaria sem acesso
  await espera("hugo", "treinamento_salvar", cad({ titulo: "Responsável sem habilitação", responsavel_colaborador_id: 3 }), 422);
  await espera("hugo", "treinamento_salvar", cad({ titulo: "Sem responsável", responsavel_colaborador_id: null }), 422);
  const d = await espera("hugo", "treinamento_salvar", cad({ titulo: "Garantia da Qualidade — pesagem", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 }), 200);
  TQ = d.id;
  if (d.status !== "planejado" || Number(d.solicitado_por_colaborador_id) !== 8 || Number(d.responsavel_colaborador_id) !== 8 || Number(d.instrutor_colaborador_id) !== 7) throw new Error(jsonDe(d));
  // responsável e instrutor são papéis distintos: a troca do responsável principal só pelo RH (transferência com motivo)
  await espera("hugo", "treinamento_salvar", cad({ id: TQ, titulo: "Garantia da Qualidade — pesagem", responsavel_colaborador_id: 7, instrutor_colaborador_id: 7 }), 422);
  await espera("resp", "treinamento_salvar", cad({ id: TQ, titulo: "Garantia da Qualidade — pesagem 2", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 }), 200); // o instrutor habilitado edita
});
await t("Os DOIS (responsável e instrutor internos habilitados) administram o ciclo inteiro; quem não tem o vínculo, não — mesmo habilitado", async () => {
  const ops = (tok: string): [string, Record<string, unknown>][] => [
    ["participantes_opcoes", { treinamento_id: TQ }], ["treinamento_conferir", { id: TQ }], ["participantes_adicionar", { treinamento_id: TQ, colaborador_ids: tok === "hugo" ? [3, 5, 9] : [2, 10] }],
  ];
  for (const tok of ["hugo", "resp"]) for (const [acao, corpo] of ops(tok)) await espera(tok, acao, corpo, 200);
  // habilitado de OUTRA área (Davi), a Gestora que acompanha e a Gestora de outra área: nenhuma operação
  for (const tok of ["p4", "ge", "gil"]) {
    for (const [acao, corpo] of [["participantes_adicionar", { treinamento_id: TQ, colaborador_ids: [1] }], ["participantes_opcoes", { treinamento_id: TQ }], ["treinamento_iniciar", { id: TQ }], ["treinamento_realizacao", { id: TQ, carga_realizada_min: 60 }], ["qr_gerar", { treinamento_id: TQ }], ["treinamento_conferir", { id: TQ }], ["treinamento_concluir", { id: TQ }], ["treinamento_cancelar", { id: TQ, motivo: "x" }], ["lista_presenca_gerar", { treinamento_id: TQ }], ["gravacao_definir", { treinamento_id: TQ, permitir: true }], ["evidencia_upload_url", { treinamento_id: TQ, tipo: "ata", file_name: "a.pdf", mime: "application/pdf", tamanho_bytes: 10 }], ["treinamento_reposicao", { treinamento_id: TQ }], ["reposicao_faltantes", { treinamento_id: TQ }], ["treinamento_transferir", { treinamento_id: TQ, para_colaborador_id: 4, motivo_tipo: "outro", motivo: "x" }]] as const)
      await espera(tok, acao, corpo as Record<string, unknown>, 403);
  }
  await espera("hugo", "treinamento_iniciar", { id: TQ }, 200);
  await espera("resp", "treinamento_realizacao", { id: TQ, carga_realizada_min: 60 }, 200);
  await espera("resp", "gravacao_definir", { treinamento_id: TQ, permitir: true }, 200);
  await confirmaQr("hugo", ["p3", "p5"], TQ);
  await espera("resp", "presenca_manual", { treinamento_id: TQ, participante_ids: [(await part(TQ, 2)).id, (await part(TQ, 10)).id], presenca: "presente", motivo: "Lista física" }, 200);
  const u = await espera("hugo", "evidencia_upload_url", { treinamento_id: TQ, tipo: "ata", file_name: "ata.pdf", mime: "application/pdf", tamanho_bytes: 1200 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 1200, "application/pdf");
  await espera("resp", "evidencia_registrar", { treinamento_id: TQ, path: u.path, tipo: "ata", file_name: "ata.pdf" }, 200);
  for (const tok of ["hugo", "resp"]) await espera(tok, "reacao_detalhe", { treinamento_id: TQ }, 200);
  // a conclusão registra usuário, data e horário (e o QR se encerra)
  await encaminharAusentes(TQ);
  await espera("p9", "presenca_manual", { treinamento_id: TQ, participante_ids: [(await part(TQ, 9)).id], presenca: "presente", motivo: "x" }, 401); // participante comum: sem módulo
  await espera("hugo", "presenca_manual", { treinamento_id: TQ, participante_ids: [(await part(TQ, 9)).id], presenca: "presente", motivo: "Chegou depois" }, 200);
  const c = await espera("resp", "treinamento_concluir", { id: TQ }, 200); // o INSTRUTOR habilitado conclui
  if (c.status !== "concluido" || !c.concluido_em) throw new Error(jsonDe(c));
  const reg = (await q(`select concluido_por, concluido_em from public.peopleflow_dev_treinamentos where id=${TQ}`))[0];
  if (reg.concluido_por !== U.resp || !reg.concluido_em) throw new Error("quem e quando concluiu");
  const a = (await q(`select user_id, detalhe from public.peopleflow_dev_auditoria where acao='treinamento_concluido' and entidade_id='${TQ}'`))[0];
  if (a.user_id !== U.resp || a.detalhe.concluido_por_perfil !== "Responsavel" || a.detalhe.realizaram !== 5 || a.detalhe.ausentes !== 0) throw new Error("auditoria da conclusão: " + jsonDe(a));
  // lista de presença gerada, concluída: o administrador a regenera (com motivo); outros não
  const ls = await q(`select count(*)::int n from public.peopleflow_dev_evidencias where treinamento_id=${TQ} and tipo='lista_presenca' and substituida_em is null`);
  if (ls[0].n !== 1) throw new Error("lista gerada na conclusão");
  await espera("hugo", "lista_presenca_gerar", { treinamento_id: TQ }, 422); // já existe: nova versão exige motivo
  await espera("hugo", "lista_presenca_gerar", { treinamento_id: TQ, motivo: "Conferência do responsável" }, 200);
  await espera("p4", "lista_presenca_gerar", { treinamento_id: TQ, motivo: "x" }, 403);
  // depois de concluído: o responsável não edita, não retifica presença, não anexa (só o RH, com histórico)
  await espera("hugo", "treinamento_salvar", cad({ id: TQ, titulo: "x", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7, motivo: "x" }), 403);
  await espera("hugo", "presenca_manual", { treinamento_id: TQ, participante_ids: [(await part(TQ, 3)).id], presenca: "ausente", motivo: "x" }, 403);
  await espera("hugo", "evidencia_upload_url", { treinamento_id: TQ, tipo: "ata", file_name: "b.pdf", mime: "application/pdf", tamanho_bytes: 10 }, 403);
});
await t("Instrutor EXTERNO é só um nome (sem login): a responsável conduz e conclui; o treinamento externo exige evidência (certificado) antes da conclusão", async () => {
  const d = await espera("hugo", "treinamento_salvar", cad({ modalidade: "externo", tipo: "capacitacao_tecnica", titulo: "Palestra de calibração", responsavel_colaborador_id: 8, instrutor_externo: "João da Silva (palestrante externo)" }), 200);
  TX = d.id;
  if (d.instrutor_externo !== "João da Silva (palestrante externo)" || d.instrutor_colaborador_id !== null) throw new Error(jsonDe(d));
  await espera("hugo", "participantes_adicionar", { treinamento_id: TX, colaborador_ids: [3, 5] }, 200);
  await espera("hugo", "presenca_manual", { treinamento_id: TX, participante_ids: [(await part(TX, 3)).id, (await part(TX, 5)).id], presenca: "presente", motivo: "Certificado de presença" }, 200); // externo registra presença ainda planejado
  await espera("hugo", "treinamento_realizacao", { id: TX, data_realizacao: hojeSP, carga_realizada_min: 120 }, 200);
  const c1 = await espera("hugo", "treinamento_conferir", { id: TX }, 200);
  if (c1.pode_concluir || !c1.impedimentos.some((i: any) => i.codigo === "evidencia_externo")) throw new Error("externo sem evidência não conclui: " + jsonDe(c1));
  const rc = await chamar("hugo", "treinamento_concluir", { id: TX });
  if (rc.c !== 422 || !/evidência/.test(rc.b.error)) throw new Error(jsonDe(rc));
  const u = await espera("hugo", "evidencia_upload_url", { treinamento_id: TX, tipo: "certificado", file_name: "certificado.pdf", mime: "application/pdf", tamanho_bytes: 900 }, 200);
  fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 900, "application/pdf");
  await espera("hugo", "evidencia_registrar", { treinamento_id: TX, path: u.path, tipo: "certificado", file_name: "certificado.pdf" }, 200);
  const c2 = await espera("hugo", "treinamento_conferir", { id: TX }, 200);
  if (!c2.pode_concluir) throw new Error(jsonDe(c2));
  await espera("hugo", "treinamento_concluir", { id: TX }, 200);
  // João não tem conta nem vínculo: nada nele aparece como colaborador/participante e nenhum login é criado
  if ((await q("select count(*)::int n from public.colaboradores where nome ilike '%João da Silva%'"))[0].n !== 0) throw new Error("instrutor externo não é colaborador");
});
await t("Instrutor interno SEM habilitação não tem poderes (nem módulo); a atuação em um treinamento não abre registros de outras áreas ou de outros responsáveis", async () => {
  // Íris (sem habilitação) é a instrutora: o treinamento é do Hugo; ela só participa/avalia pelo "Meus treinamentos"
  const d = await espera("hugo", "treinamento_salvar", cad({ titulo: "Instrutora sem habilitação", responsavel_colaborador_id: 8, instrutor_colaborador_id: 9 }), 200);
  if ((await sessao("p9")).c !== 403) throw new Error("instrutora sem habilitação não abre o módulo");
  for (const acao of ["qr_gerar", "treinamento_iniciar", "participantes_adicionar", "treinamento_concluir"]) await espera("p9", acao, { id: d.id, treinamento_id: d.id, colaborador_ids: [3] }, 401);
  await espera("hugo", "treinamento_cancelar", { id: d.id, motivo: "Fim do cenário" }, 200);
  // Davi (habilitado, outra área) registra o treinamento DELE; Hugo/Fabio não o veem nem administram, e vice-versa
  TD = (await espera("p4", "treinamento_salvar", cad({ titulo: "Logística — recebimento", responsavel_colaborador_id: 4 }), 200)).id;
  await espera("p4", "participantes_adicionar", { treinamento_id: TD, colaborador_ids: [6] }, 200);
  await espera("hugo", "participantes_adicionar", { treinamento_id: TD, colaborador_ids: [3] }, 403);
  const alvo = (await espera("hugo", "treinamento_salvar", cad({ titulo: "Alvo do isolamento", responsavel_colaborador_id: 8 }), 200)).id;
  await espera("p4", "participantes_adicionar", { treinamento_id: alvo, colaborador_ids: [3] }, 403); // habilitado, mas de outro responsável
  await espera("hugo", "treinamento_cancelar", { id: alvo, motivo: "Fim do cenário" }, 200);
  await espera("p4", "habilitacao_listar", {}, 403); // habilitado não vê as habilitações
  const vis = { hugo: await ids(U.hugo), resp: await ids(U.resp), p4: await ids(U.p4), ge: await ids(U.ge), gil: await ids(U.gil), rh: await ids(U.rh) };
  if (vis.hugo.includes(TD) || vis.resp.includes(TD) || !vis.hugo.includes(TQ) || !vis.resp.includes(TQ) || !vis.hugo.includes(TX)) throw new Error("isolamento (Hugo/Fabio × Davi): " + jsonDe(vis));
  if (vis.resp.includes(TX)) throw new Error("Fabio não é vinculado à palestra externa do Hugo");
  if (vis.p4.includes(TQ) || vis.p4.includes(TX) || !vis.p4.includes(TD)) throw new Error("Davi só vê o próprio: " + jsonDe(vis.p4));
  if (!vis.ge.includes(TQ) || vis.ge.includes(TD)) throw new Error("Bia acompanha a área dela (Hugo): " + jsonDe(vis.ge));
  if (!vis.gil.includes(TD) || vis.gil.includes(TX)) throw new Error("Gil acompanha a área dele");
  if (![TQ, TX, TD].every((x) => vis.rh.includes(x))) throw new Error("o RH vê todos");
  // participantes, evidências e eficácia também isolados (leitura direta, RLS) e no servidor
  const parts = async (uid: string, tid: number) => (await como(uid, `select count(*)::int n from public.peopleflow_dev_participantes where treinamento_id=${tid}`))[0].n;
  if ((await parts(U.p4, TQ)) !== 0 || (await parts(U.hugo, TD)) !== 0 || (await parts(U.hugo, TQ)) === 0 || (await parts(U.resp, TQ)) === 0) throw new Error("turma isolada");
  const evTQ = (await q(`select id from public.peopleflow_dev_evidencias where treinamento_id=${TQ} and tipo='ata' limit 1`))[0].id;
  if ((await como(U.p4, `select count(*)::int n from public.peopleflow_dev_evidencias where treinamento_id=${TQ}`))[0].n !== 0) throw new Error("evidências de outro responsável");
  await espera("p4", "evidencia_url", { id: evTQ }, 403);
  await espera("hugo", "evidencia_url", { id: evTQ }, 200);
  await espera("hugo", "eficacia_registrar", { participante_id: (await part(TQ, 3)).id, resultado: "eficaz" }, 422); // este treinamento não exige eficácia
  const exige = await espera("hugo", "treinamento_salvar", cad({ titulo: "Com eficácia", responsavel_colaborador_id: 8, exige_eficacia: true }), 200);
  await espera("hugo", "participantes_adicionar", { treinamento_id: exige.id, colaborador_ids: [3] }, 200);
  await espera("hugo", "treinamento_iniciar", { id: exige.id }, 200);
  await espera("hugo", "presenca_manual", { treinamento_id: exige.id, participante_ids: [(await part(exige.id, 3)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("hugo", "eficacia_registrar", { participante_id: (await part(exige.id, 3)).id, resultado: "eficaz" }, 403); // a eficácia segue sendo do RH ou do gestor do participante
  await espera("ge", "eficacia_registrar", { participante_id: (await part(exige.id, 3)).id, resultado: "eficaz" }, 200);
  await encaminharAusentes(exige.id);
  await espera("hugo", "treinamento_concluir", { id: exige.id }, 200);
});

console.log("3. Ausências, justificativas e reposições: concluir a SESSÃO ≠ regularizar o participante");
let TS = 0, repId = 0;
await t("Sessão com ausentes: a conferência exige justificativa e encaminhamento; reposição pendente NÃO impede concluir e a pendência individual permanece aberta, vinculada ao original", async () => {
  TS = (await espera("hugo", "treinamento_salvar", cad({ titulo: "Sessão com ausentes", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 }), 200)).id;
  await espera("hugo", "participantes_adicionar", { treinamento_id: TS, colaborador_ids: [3, 5, 9, 2, 6] }, 200);
  await espera("hugo", "treinamento_iniciar", { id: TS }, 200);
  await confirmaQr("hugo", ["p3", "p5"], TS);
  await espera("hugo", "presenca_manual", { treinamento_id: TS, participante_ids: [(await part(TS, 2)).id], presenca: "presente", motivo: "Lista física" }, 200);
  await espera("hugo", "presenca_manual", { treinamento_id: TS, participante_ids: [(await part(TS, 9)).id], presenca: "ausente", motivo: "De férias" }, 200); // a justificativa já nasce com o motivo
  let c = await espera("hugo", "treinamento_conferir", { id: TS }, 200);
  const cod = c.impedimentos.map((i: any) => i.codigo).sort();
  if (jsonDe(cod) !== jsonDe(["ausencia_sem_encaminhamento", "presenca_pendente"]) || c.pode_concluir) throw new Error("pendente (Gil) e ausente sem encaminhamento: " + jsonDe(c));
  const rc = await chamar("hugo", "treinamento_concluir", { id: TS });
  if (rc.c !== 422 || !/Registre a presença/.test(rc.b.error) || !/encaminhamento/.test(rc.b.error)) throw new Error("a mensagem diz tudo o que impede: " + jsonDe(rc.b));
  await espera("hugo", "presenca_manual", { treinamento_id: TS, participante_ids: [(await part(TS, 6)).id], presenca: "ausente", motivo: "Em reunião externa" }, 200);
  // um ausente não se "resolve" retirando-o da turma
  await espera("hugo", "participante_remover", { participante_id: (await part(TS, 6)).id, motivo: "Tentativa de sumir com a pendência" }, 422);
  await espera("rh", "participante_remover", { participante_id: (await part(TS, 6)).id, motivo: "Nem o RH: usa a dispensa" }, 422);
  // encaminhamentos: reposição com data prevista (Íris) e justificativa explícita
  await espera("hugo", "ausencia_encaminhar", { participante_id: (await part(TS, 9)).id, encaminhamento: "reposicao" }, 422); // justificativa obrigatória
  await espera("hugo", "ausencia_encaminhar", { participante_id: (await part(TS, 3)).id, justificativa: "x", encaminhamento: "reposicao" }, 422); // só ausentes
  await espera("hugo", "ausencia_encaminhar", { participante_id: (await part(TS, 9)).id, justificativa: "Férias até o dia 20", encaminhamento: "reposicao", reposicao_prevista_em: maisDias(15) }, 200);
  await espera("hugo", "ausencia_encaminhar", { participante_id: (await part(TS, 6)).id, justificativa: "Em reunião externa", encaminhamento: "reposicao" }, 200); // sem data conhecida
  await espera("p4", "ausencia_encaminhar", { participante_id: (await part(TS, 6)).id, justificativa: "x", encaminhamento: "reposicao" }, 403);
  c = await espera("hugo", "treinamento_conferir", { id: TS }, 200);
  const apos = c.pendencias_apos.find((i: any) => i.codigo === "reposicao_pendente");
  if (!c.pode_concluir || !apos || apos.participantes.length !== 2 || !/2 reposição\(ões\).*1 com data prevista/.test(apos.mensagem)) throw new Error("conclui, e informa o que permanece: " + jsonDe(c));
  if (!c.pendencias_apos.some((i: any) => i.codigo === "reacao_pendente")) throw new Error("a avaliação de reação não se confunde com a conclusão da sessão");
  const concl = await espera("hugo", "treinamento_concluir", { id: TS }, 200);
  if (concl.status !== "concluido") throw new Error("concluiu");
  // a pendência individual NÃO foi encerrada: ausentes continuam ausentes, com encaminhamento, vinculados ao original
  const ab = await q(`select colaborador_id, presenca_status, ausencia_encaminhamento, reposicao_prevista_em, ausencia_justificativa, removido_em from public.peopleflow_dev_participantes where treinamento_id=${TS} and presenca_status='ausente' order by colaborador_id`);
  if (ab.length !== 2 || ab.some((x) => x.removido_em || x.ausencia_encaminhamento !== "reposicao" || !x.ausencia_justificativa) || isoData(ab[1].reposicao_prevista_em) !== maisDias(15)) throw new Error("pendência individual aberta: " + jsonDe(ab));
  const pend = await espera("rh", "pendencias_listar", {}, 200);
  const doTS = pend.reposicoes.filter((r: any) => r.treinamento_id === TS);
  if (doTS.map((r: any) => `${r.colaborador_id}:${r.situacao}`).sort().join() !== "6:a_programar,9:a_programar" || doTS.find((r: any) => r.colaborador_id === 9).prevista_em !== maisDias(15) || doTS.find((r: any) => r.colaborador_id === 9).justificativa !== "Férias até o dia 20") throw new Error("RH acompanha a pendência: " + jsonDe(doTS));
  // quem acompanha: o responsável (Hugo), o instrutor (Fabio) e a Gestora da área; não Davi (outra área) nem o participante
  for (const [tok, esp] of [["hugo", 2], ["resp", 2], ["ge", 2], ["p4", 0]] as const) {
    const p = (await espera(tok, "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === TS);
    if (p.length !== esp) throw new Error(`${tok} vê ${p.length} pendências, esperado ${esp}`);
  }
  await espera("p9", "pendencias_listar", {}, 401);
});
await t("Reposição: programada pelo responsável, vinculada ao original; o original NÃO muda; ao realizar a reposição (com evidência/lista), a pendência individual é regularizada", async () => {
  const f = await espera("hugo", "reposicao_faltantes", { treinamento_id: TS }, 200);
  if (f.map((x: any) => x.colaborador_id).sort().join() !== "6,9") throw new Error(jsonDe(f));
  const rep = await espera("hugo", "treinamento_reposicao", { treinamento_id: TS, tipo: "desenvolvimento", modalidade: "interno", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7, data_inicio: maisDias(15), colaborador_ids: [9] }, 200);
  repId = rep.id;
  if (Number(rep.reposicao_de_id) !== TS || rep.status !== "planejado") throw new Error(jsonDe(rep));
  const orig = (await q(`select status, concluido_em from public.peopleflow_dev_treinamentos where id=${TS}`))[0];
  if (orig.status !== "concluido") throw new Error("o original não é reaberto");
  const pend = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === TS);
  const iris = pend.find((r: any) => r.colaborador_id === 9);
  if (iris.situacao !== "programada" || iris.reposicao.id !== repId || pend.find((r: any) => r.colaborador_id === 6).situacao !== "a_programar") throw new Error("situações: " + jsonDe(pend));
  // a lista da sessão original segue a mesma; a reposição tem a sua própria
  await espera("hugo", "treinamento_iniciar", { id: repId }, 200);
  await confirmaQr("hugo", ["p9"], repId);
  await encaminharAusentes(repId);
  await espera("hugo", "treinamento_concluir", { id: repId }, 200);
  const depois = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === TS);
  if (depois.map((r: any) => r.colaborador_id).join() !== "6") throw new Error("Íris regularizada; Gil segue pendente: " + jsonDe(depois));
  const orig2 = await q(`select colaborador_id, presenca_status from public.peopleflow_dev_participantes where treinamento_id=${TS} and colaborador_id=9`);
  if (orig2[0].presenca_status !== "ausente") throw new Error("a sessão original não é descaracterizada: Íris segue ausente nela");
  const hist = (await espera("p9", "meu_historico", {}, 200)).treinamentos;
  const codTS = (await q(`select codigo from public.peopleflow_dev_treinamentos where id=${TS}`))[0].codigo, codRep = (await q(`select codigo from public.peopleflow_dev_treinamentos where id=${repId}`))[0].codigo;
  if (hist.find((x: any) => x.codigo === codTS)?.situacao !== "ausente" || hist.find((x: any) => x.codigo === codRep)?.situacao !== "realizado") throw new Error("histórico da Íris preserva a ausência no original e a realização na reposição: " + jsonDe(hist));
  // ausente já regularizado não recebe novo encaminhamento
  await espera("hugo", "ausencia_encaminhar", { participante_id: (await part(TS, 9)).id, justificativa: "x", encaminhamento: "reposicao" }, 409);
});
await t("Dispensa: só o RH, com justificativa; a pendência sai da fila SEM apagar o participante nem o histórico; o responsável não dispensa; a dispensa é definitiva", async () => {
  const pg = (await part(TS, 6)).id;
  await espera("hugo", "ausencia_encaminhar", { participante_id: pg, justificativa: "x", encaminhamento: "dispensa" }, 403);
  await espera("rh", "ausencia_encaminhar", { participante_id: pg, encaminhamento: "dispensa" }, 422); // justificativa obrigatória
  await espera("rh", "ausencia_encaminhar", { participante_id: pg, justificativa: "Função alterada: o treinamento não se aplica mais ao cargo", encaminhamento: "dispensa" }, 200);
  const r = (await q(`select presenca_status, removido_em, ausencia_encaminhamento, dispensado_em, dispensado_por, dispensa_justificativa from public.peopleflow_dev_participantes where id=${pg}`))[0];
  if (r.presenca_status !== "ausente" || r.removido_em || r.ausencia_encaminhamento !== "dispensa" || !r.dispensado_em || r.dispensado_por !== U.rh || !/Função alterada/.test(r.dispensa_justificativa)) throw new Error("registro preservado: " + jsonDe(r));
  if ((await espera("rh", "pendencias_listar", {}, 200)).reposicoes.some((x: any) => x.treinamento_id === TS)) throw new Error("a dispensa encerra a pendência");
  await espera("rh", "ausencia_encaminhar", { participante_id: pg, justificativa: "outra", encaminhamento: "reposicao" }, 409);
  if ((await espera("hugo", "reposicao_faltantes", { treinamento_id: TS }, 200)).length !== 0) throw new Error("dispensado não volta à lista de faltantes");
  const a = await q("select acao from public.peopleflow_dev_auditoria where acao in ('ausencia_encaminhada','ausencia_dispensada') order by id");
  if (!a.some((x) => x.acao === "ausencia_dispensada") || a.filter((x) => x.acao === "ausencia_encaminhada").length < 2) throw new Error("auditoria dos encaminhamentos: " + jsonDe(a));
});

await t("Treinamento de homologação/teste: o fluxo completo funciona e as pendências dele ficam FORA da lista oficial, a menos que o RH peça para incluí-las (marcadas como teste)", async () => {
  const h = (await espera("rh", "treinamento_salvar", cad({ titulo: "Teste de homologação", responsavel_colaborador_id: 7, homologacao: true }), 200)).id;
  await espera("rh", "participantes_adicionar", { treinamento_id: h, colaborador_ids: [3, 5] }, 200);
  await espera("resp", "treinamento_iniciar", { id: h }, 200);
  await confirmaQr("resp", ["p3"], h);
  await espera("resp", "presenca_manual", { treinamento_id: h, participante_ids: [(await part(h, 5)).id], presenca: "ausente", motivo: "Teste da ausência" }, 200);
  await espera("resp", "ausencia_encaminhar", { participante_id: (await part(h, 5)).id, justificativa: "Teste", encaminhamento: "reposicao" }, 200);
  await espera("resp", "treinamento_concluir", { id: h }, 200);
  const padrao = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === h);
  const comTeste = (await espera("rh", "pendencias_listar", { incluir_teste: true }, 200)).reposicoes.filter((r: any) => r.treinamento_id === h);
  if (padrao.length !== 0 || comTeste.length !== 1 || comTeste[0].teste !== true || comTeste[0].colaborador_id !== 5) throw new Error("teste fora da lista oficial; incluído só a pedido: " + jsonDe([padrao, comTeste]));
  const doResp = (await espera("resp", "pendencias_listar", { incluir_teste: true }, 200)).reposicoes.filter((r: any) => r.treinamento_id === h);
  if (doResp.length !== 0) throw new Error("só o RH inclui treinamentos de teste na lista");
});

console.log("4. Avaliação de Reação: acompanhamento por quem administra e pelo gestor da área; anonimato e regra de três");
await t("Responsável, instrutor, Gestora da área e RH acompanham o status; resultados só a partir de 3 respostas, sem nota individual; Davi/outra área não", async () => {
  const detalhe = async (tok: string, st = 200) => espera(tok, "reacao_detalhe", { treinamento_id: TQ }, st);
  const respostas = [[5, 5, 5, 5, 5], [1, 2, 3, 4, 5], [3, 3, 4, 2, 1]];
  const quem = ["p3", "p5", "ge"]; // Caio, Eva e Bia estavam presentes
  for (let i = 0; i < 3; i++) {
    for (const tok of ["rh", "hugo", "resp", "ge"]) {
      const d = await detalhe(tok);
      if (d.respondidos !== i || d.medias !== null || /"respostas"|"nota"|"q[1-5]"/.test(jsonDe(d))) throw new Error(`${tok}: com ${i} resposta(s) não há média nem nota`);
    }
    await espera(quem[i], "reacao_responder", { codigo: (await q(`select codigo from public.peopleflow_dev_treinamentos where id=${TQ}`))[0].codigo, respostas: respostas[i] }, 200);
  }
  for (const tok of ["rh", "hugo", "resp", "ge"]) {
    const d = await detalhe(tok);
    if (d.respondidos !== 3 || jsonDe(d.medias) !== jsonDe([3, 3.3, 4, 3.7, 3.7]) || /"respostas"|"nota"|"q[1-5]"/.test(jsonDe(d))) throw new Error(`${tok}: médias consolidadas a partir de 3: ` + jsonDe(d.medias));
    if (Object.keys(d.participantes[0]).sort().join() !== "cargo,colaborador_id,departamento,fora_do_prazo,nome,participante_id,prazo,respondido_em,situacao") throw new Error("só o controle de quem respondeu");
  }
  await detalhe("p4", 403);
  await detalhe("gil", 403);
  await espera("hugo", "reacao_resumo", {}, 403); // o acompanhamento geral é do RH
});

console.log("5. Revogação, desligamento e transferência");
await t("Revogar encerra os poderes na hora, informa os pendentes, mantém o concluído íntegro e o acesso do colaborador às próprias participações; o histórico de habilitações fica", async () => {
  const hab = (await espera("rh", "habilitacao_listar", {}, 200)).find((x: any) => x.colaborador.id === 8 && x.ativa);
  const pend = await espera("rh", "habilitacao_pendencias", { colaborador_id: 8 }, 200);
  // Hugo tem treinamentos pendentes: palestra externa concluída não; reposição concluída não; abre um novo planejado e um em andamento
  const plan = (await espera("hugo", "treinamento_salvar", cad({ titulo: "Planejado do Hugo", responsavel_colaborador_id: 8 }), 200)).id;
  const andando = (await espera("hugo", "treinamento_salvar", cad({ titulo: "Em andamento do Hugo", responsavel_colaborador_id: 8, instrutor_colaborador_id: 7 }), 200)).id;
  await espera("hugo", "participantes_adicionar", { treinamento_id: andando, colaborador_ids: [3] }, 200);
  await espera("hugo", "treinamento_iniciar", { id: andando }, 200);
  if (pend.length !== 0) throw new Error("antes de abrir novos não havia pendentes: " + jsonDe(pend));
  const evAntes = (await q(`select count(*)::int n, md5(string_agg(storage_path, '|' order by id)) h from public.peopleflow_dev_evidencias where treinamento_id=${TQ}`))[0];
  const hashTQ = (await q(`select md5(t::text) h from public.peopleflow_dev_treinamentos t where id=${TQ}`))[0].h;
  const rev = await espera("rh", "habilitacao_revogar", { id: hab.id, motivo: "Mudança de responsabilidade na área" }, 200);
  if (rev.pendentes.map((p: any) => `${p.id}:${p.papel}`).sort().join() !== [`${plan}:responsavel`, `${andando}:responsavel`].sort().join()) throw new Error("pendentes para transferir: " + jsonDe(rev.pendentes));
  // poderes encerrados na hora, mesmo que a sessão do módulo seja recriada
  await espera("hugo", "treinamento_salvar", cad({ titulo: "Depois", responsavel_colaborador_id: 8 }), 401);
  await db.exec(`insert into public.peopleflow_dev_contas values ('${U.hugo}', 8, 'Responsavel', now()) on conflict (user_id) do update set atualizado_em = now()`);
  for (const [acao, corpo] of [["treinamento_salvar", cad({ titulo: "Depois", responsavel_colaborador_id: 8 })], ["participantes_adicionar", { treinamento_id: andando, colaborador_ids: [5] }], ["qr_gerar", { treinamento_id: andando }], ["treinamento_cancelar", { id: plan, motivo: "x" }], ["treinamento_concluir", { id: andando }], ["reacao_detalhe", { treinamento_id: TQ }], ["pendencias_listar", {}]] as const)
    await espera("hugo", acao, corpo as Record<string, unknown>, 403);
  if ((await sessao("hugo")).c !== 403) throw new Error("sem habilitação não abre o módulo");
  const vis = await ids(U.hugo);
  if (vis.length !== 0) throw new Error("sem habilitação o RLS não devolve treinamentos: " + jsonDe(vis));
  // histórico íntegro
  const evDepois = (await q(`select count(*)::int n, md5(string_agg(storage_path, '|' order by id)) h from public.peopleflow_dev_evidencias where treinamento_id=${TQ}`))[0];
  if (jsonDe(evDepois) !== jsonDe(evAntes) || (await q(`select md5(t::text) h from public.peopleflow_dev_treinamentos t where id=${TQ}`))[0].h !== hashTQ) throw new Error("registros concluídos e evidências íntegros");
  // o colaborador continua acessando as próprias participações
  const mine = await espera("hugo", "meu_historico", {}, 200);
  if (!Array.isArray(mine.treinamentos)) throw new Error("Meus treinamentos segue funcionando");
  // histórico de habilitações: revogada preservada (motivo, quem, quando)
  const l = (await espera("rh", "habilitacao_listar", {}, 200)).filter((x: any) => x.colaborador.id === 8);
  if (l.length !== 1 || l[0].ativa || l[0].revogado_motivo !== "Mudança de responsabilidade na área" || l[0].revogado_por !== NOMES[1] || !l[0].revogado_em || !l[0].habilitado_em) throw new Error("histórico: " + jsonDe(l));
  (globalThis as any).__pend = { plan, andando };
});
await t("Treinamentos sem responsável habilitado aparecem para o RH; o RH transfere (motivo obrigatório, só pendentes, só para habilitado ou RH) e o histórico da transferência fica", async () => {
  const { plan, andando } = (globalThis as any).__pend as { plan: number; andando: number };
  const sr = (await espera("rh", "pendencias_listar", {}, 200)).sem_responsavel;
  if (jsonDe(sr.map((x: any) => [x.treinamento_id, x.motivo]).sort()) !== jsonDe([[plan, "responsavel_sem_habilitacao"], [andando, "responsavel_sem_habilitacao"]].sort())) throw new Error("RH vê o que ficou sem responsável: " + jsonDe(sr));
  const T = (extra: Record<string, unknown>) => ({ treinamento_id: andando, para_colaborador_id: 7, motivo_tipo: "revogacao", motivo: "Revogação da habilitação do responsável anterior", ...extra });
  for (const tok of ["hugo", "resp", "ge", "p4"]) await espera(tok, "treinamento_transferir", T({}), tok === "p4" ? 403 : 403);
  await espera("rh", "treinamento_transferir", T({ motivo: "  " }), 422); // motivo obrigatório
  await espera("rh", "treinamento_transferir", T({ motivo_tipo: "qualquer" }), 422);
  await espera("rh", "treinamento_transferir", T({ para_colaborador_id: 3 }), 422); // quem não é habilitado nem do RH não vira responsável
  await espera("rh", "treinamento_transferir", T({ para_colaborador_id: 8 }), 422); // o revogado tampouco
  await espera("rh", "treinamento_transferir", T({ treinamento_id: TQ }), 422); // concluído permanece íntegro
  const antes = (await q(`select solicitado_por_colaborador_id, instrutor_colaborador_id from public.peopleflow_dev_treinamentos where id=${andando}`))[0];
  const nova = await espera("rh", "treinamento_transferir", T({}), 200);
  if (Number(nova.responsavel_colaborador_id) !== 7 || Number(nova.solicitado_por_colaborador_id) !== Number(antes.solicitado_por_colaborador_id) || Number(nova.instrutor_colaborador_id) !== Number(antes.instrutor_colaborador_id)) throw new Error("troca só o responsável; quem registrou e o instrutor ficam: " + jsonDe(nova));
  await espera("rh", "treinamento_transferir", T({ treinamento_id: plan, para_colaborador_id: 1, motivo_tipo: "mudanca_responsabilidade", motivo: "O RH assume até a próxima habilitação" }), 200); // integrante do RH também pode
  const h = await espera("rh", "transferencias_listar", { treinamento_id: andando }, 200);
  if (h.length !== 1 || h[0].de !== NOMES[8] || h[0].para !== NOMES[7] || h[0].por !== NOMES[1] || h[0].motivo_tipo !== "revogacao" || h[0].status_treinamento !== "em_andamento" || !h[0].transferido_em) throw new Error("histórico da transferência: " + jsonDe(h));
  const row = (await q(`select habilitacao_id from public.peopleflow_dev_transferencias_responsabilidade where treinamento_id=${andando}`))[0];
  if (!row.habilitacao_id) throw new Error("a transferência referencia a habilitação revogada");
  // Fabio agora administra o que recebeu (é habilitado); o RH conclui a sessão de quem foi revogado quando quiser
  await espera("resp", "treinamento_conferir", { id: andando }, 200);
  if ((await espera("rh", "pendencias_listar", {}, 200)).sem_responsavel.length !== 0) throw new Error("nada mais sem responsável");
  if ((await q("select count(*)::int n from public.peopleflow_dev_auditoria where acao='responsabilidade_transferida'"))[0].n !== 2) throw new Error("auditoria da transferência");
  // histórico imutável no banco
  let barrou = false;
  try { await db.exec("update public.peopleflow_dev_transferencias_responsabilidade set motivo='x'"); } catch { barrou = true; }
  if (!barrou) throw new Error("o histórico de transferência é imutável");
});
await t("Desligamento: o responsável desligado aparece para o RH como sem responsável ativo e é transferido do mesmo modo; nova habilitação depois de revogada gera NOVO registro (a revogada fica no histórico)", async () => {
  const d = (await espera("resp", "treinamento_salvar", cad({ titulo: "Do Fabio", responsavel_colaborador_id: 7 }), 200)).id;
  await db.exec("update public.colaboradores set desligado = true, data_desligamento = current_date - 1 where id = 7");
  const sr = (await espera("rh", "pendencias_listar", {}, 200)).sem_responsavel.find((x: any) => x.treinamento_id === d);
  if (sr?.motivo !== "responsavel_desligado") throw new Error("desligado: " + jsonDe(sr));
  await espera("rh", "treinamento_transferir", { treinamento_id: d, para_colaborador_id: 1, motivo_tipo: "desligamento", motivo: "Fabio deixou a empresa" }, 200);
  await db.exec("update public.colaboradores set desligado = false, data_desligamento = null where id = 7");
  const h8 = await espera("rh", "habilitacao_conceder", { colaborador_id: 8, gestor_colaborador_id: 2, referencia: "Nova solicitação da Bia, 28/10" }, 200);
  const l = (await espera("rh", "habilitacao_listar", {}, 200)).filter((x: any) => x.colaborador.id === 8);
  if (l.length !== 2 || l.filter((x: any) => x.ativa).length !== 1 || l.filter((x: any) => !x.ativa).length !== 1 || !h8.id) throw new Error("revogada + nova ativa: " + jsonDe(l));
});

console.log("6. Segurança no servidor e no banco");
await t("Permissões conferidas no servidor E no banco (leitura direta com o papel real de cada pessoa); o navegador não grava nas tabelas novas", async () => {
  for (const tabela of ["peopleflow_dev_responsaveis_gestao", "peopleflow_dev_transferencias_responsabilidade", "peopleflow_dev_participantes", "peopleflow_dev_treinamentos"]) {
    for (const p of ["insert", "update", "delete"]) if ((await q(`select has_table_privilege('authenticated','public.${tabela}','${p}') as v`))[0].v) throw new Error(`authenticated ${p} ${tabela}`);
  }
  if ((await q("select has_table_privilege('authenticated','public.peopleflow_dev_responsaveis_gestao','select') as v"))[0].v) throw new Error("habilitações: só o servidor lê");
  if ((await como(U.rh, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n < 2) throw new Error("RH lê as transferências");
  for (const uid of [U.ge, U.gil, U.resp, U.p4]) if ((await como(uid, "select count(*)::int n from public.peopleflow_dev_transferencias_responsabilidade"))[0].n !== 0) throw new Error("só o RH lê as transferências");
  // ações do RH recusadas a todos os demais perfis
  for (const tok of ["ge", "gil", "resp", "p4"]) for (const [acao, corpo] of [["habilitacao_revogar", { id: 1, motivo: "x" }], ["habilitacao_pendencias", { colaborador_id: 7 }], ["transferencias_listar", {}], ["habilitacao_opcoes", {}]] as const) await espera(tok, acao, corpo as Record<string, unknown>, 403);
  await espera("semcadastro", "pendencias_listar", {}, 401);
});
await t("Código e banco não oferecem exclusão física dos registros do fluxo (treinamentos, participantes, habilitações, transferências, evidências)", async () => {
  const fonte = fs.readFileSync(`${PF}/api/_lib/desenvolvimentoAcoes.ts`, "utf8");
  if (/\.from\("peopleflow_dev_(responsaveis_gestao|transferencias_responsabilidade|treinamentos|participantes|evidencias)"\)\s*\.delete\(/.test(fonte)) throw new Error("exclusão física no servidor");
  for (const tabela of ["peopleflow_dev_responsaveis_gestao", "peopleflow_dev_transferencias_responsabilidade", "peopleflow_dev_participantes", "peopleflow_dev_treinamentos", "peopleflow_dev_evidencias"]) {
    let barrou = false;
    try { await db.exec(`delete from public.${tabela}`); } catch { barrou = true; }
    if (!barrou) throw new Error("o banco aceitou apagar " + tabela);
  }
});

console.log("7. Telas e navegação (conferência do código das telas; a conferência visual é do roteiro de homologação)");
await t("Telas: Habilitações (RH habilita/revoga; liderança só consulta), Pendências, conferência antes de concluir, encaminhamento de ausência e transferência; sem a antiga indicação pelo Gestor", async () => {
  const ler = (f: string) => fs.readFileSync(`${PF}/${f}`, "utf8");
  if (fs.existsSync(`${PF}/src/features/desenvolvimento/ResponsaveisGestao.tsx`)) throw new Error("a indicação pelo Gestor foi substituída pela habilitação do RH");
  const hab = ler("src/features/desenvolvimento/Habilitacoes.tsx");
  for (const x of ["habilitacao_conceder", "habilitacao_revogar", "Referência da solicitação da liderança", "Criar acesso ao portal (somente Treinamentos)", "Histórico de revogações", "treinamento_transferir", "ehRH &&"]) if (!hab.includes(x)) throw new Error("Habilitações sem " + x);
  if (/responsavel_gestao_indicar|responsaveis_gestao_listar/.test(hab + ler("src/features/desenvolvimento/devRepository.ts"))) throw new Error("ações antigas de indicação ainda referenciadas");
  const lista = ler("src/features/desenvolvimento/TreinamentosPage.tsx");
  if (!/id: "pendencias" as const, rotulo: "Pendências"/.test(lista) || !/perfil === "RH" \|\| perfil === "Gestor" \|\| habilitado/.test(lista) || !/<PendenciasAba \/>/.test(lista) || !/perfil === "RH" \? "Habilitações" : "Responsáveis habilitados"/.test(lista)) throw new Error("aba Pendências e botão de habilitações");
  const pag = ler("src/features/desenvolvimento/TreinamentoPage.tsx");
  if (!/const conduz = vinculo && habilitado;/.test(pag) || !/podeConcluir: opera && emExecucao/.test(pag) || !/<PainelConclusao/.test(pag) || !/Você acompanha este treinamento \(somente consulta\)/.test(pag) || !/TransferirResponsabilidade/.test(pag)) throw new Error("permissões da página: administra = habilitado + vínculo; liderança acompanha");
  if (/ehRH && \(t\.status === "em_andamento" \|\| externoPlanejado\) && \(\s*<Button variant="success"/.test(pag)) throw new Error("concluir não é mais só do RH");
  const conc = ler("src/features/desenvolvimento/ConclusaoEAusencias.tsx");
  for (const x of ["Impede a conclusão", "Permanece pendente depois de concluir", "não encerra a reposição individual", "Dispensar da reposição", "Não registre dados de saúde", "Reposição pendente", "Sem encaminhamento"]) if (!conc.includes(x)) throw new Error("conferência/ausência sem " + x);
  const form = ler("src/features/desenvolvimento/TreinamentoForm.tsx");
  if (!/Responsável principal \*/.test(form) || !/Transferir responsabilidade/.test(form) || !/disabled=\{modo === "editar" && item\?\.status !== "solicitado"\}/.test(form)) throw new Error("formulário: responsável principal; troca só pela transferência");
  if (!/Instrutor \/ instituição externa/.test(form)) throw new Error("instrutor externo nominal preservado");
});
await t("Acesso específico a Treinamentos (sem AVD nem outros módulos): conta resolvida só pelo e-mail ativo; rotas e menu restritos; o servidor só libera a Gestão de Treinamentos a quem o RH habilitou", async () => {
  const ler = (f: string) => fs.readFileSync(`${PF}/${f}`, "utf8");
  const conta = ler("src/store/useConta.ts");
  if (!/acesso: "treinamentos" as const/.test(conta) || !/estaAtivoHoje\(c, "acesso"\)/.test(conta)) throw new Error("conta com acesso específico");
  const shell = ler("src/components/layout/AppShell.tsx");
  if (!/conta\.acesso === "treinamentos" && !location\.pathname\.startsWith\("\/meus-treinamentos"\)/.test(shell) || !/<Navigate to="\/meus-treinamentos" replace \/>/.test(shell) || !/conta\.acesso !== "treinamentos" && !location\.pathname\.startsWith\("\/desempenho"\)/.test(shell)) throw new Error("rotas restritas");
  const side = ler("src/components/layout/Sidebar.tsx");
  if (!/conta\.acesso !== "treinamentos" && <NavItem to="\/desempenho"/.test(side)) throw new Error("menu sem AVD para o acesso específico");
  // o módulo conferido no servidor: habilitar cria SOMENTE o acesso peopleflow (testado acima); a sessão exige habilitação para quem não é RH/Gestor
  const api = ler("api/desenvolvimento.ts");
  if (!/if \(gestoresQueIndicaram\.length === 0\) \{/.test(api) || /conduzAlgum/.test(api)) throw new Error("só a habilitação abre o módulo para quem não é RH/Gestor");
});

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
