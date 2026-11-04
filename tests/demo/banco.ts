// Demonstração/homologação LOCAL do Portal de Treinamentos: banco em memória (PGlite) com as migrations REAIS, o código REAL do servidor
// (api/desenvolvimento.ts) e pessoas FICTÍCIAS. Nunca usa nem toca o Supabase de produção.
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite, types } from "@electric-sql/pglite";
import { criarFake } from "../treinamentos/fakeSupabase.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url)).split("\\").join("/").replace(/\/$/, "");
const SQL = (n: string) => fs.readFileSync(`${RAIZ}/supabase/${n}`, "utf8");

export interface Persona {
  token: string;
  id: number;
  uuid: string;
  nome: string;
  cargo: string;
  depto: string;
  gestor: string | null;
  papel: string; // descrição para a demonstração
  admissao?: string;
  semConta?: boolean;
}
const uuidDe = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
export const PESSOAS: Persona[] = [
  { token: "rh", id: 1, nome: "Ana Ribeiro", cargo: "Analista de RH", depto: "Recursos Humanos", gestor: "Henrique Duarte", papel: "RH" },
  { token: "bia", id: 2, nome: "Beatriz Gomes", cargo: "Supervisora de Qualidade", depto: "Qualidade", gestor: "Henrique Duarte", papel: "Gestora da Qualidade" },
  { token: "manuela", id: 3, nome: "Manuela Castro", cargo: "Analista de Garantia da Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Colaboradora (será habilitada)" },
  { token: "juliana", id: 4, nome: "Juliana Prado", cargo: "Analista de Garantia da Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Colaboradora (instrutora interna)" },
  { token: "paulo", id: 5, nome: "Paulo Neves", cargo: "Técnico de Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Participante" },
  { token: "renata", id: 6, nome: "Renata Alves", cargo: "Técnica de Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Participante" },
  { token: "gustavo", id: 7, nome: "Gustavo Reis", cargo: "Supervisor de Logística", depto: "Logística", gestor: "Henrique Duarte", papel: "Gestor da Logística (será habilitado)" },
  { token: "davi", id: 8, nome: "Davi Moura", cargo: "Conferente", depto: "Logística", gestor: "Gustavo Reis", papel: "Colaborador de outra área" },
  { token: "sergio", id: 9, nome: "Sérgio Dias", cargo: "Operador de Logística", depto: "Logística", gestor: "Gustavo Reis", papel: "Participante" },
  { token: "camila", id: 10, nome: "Camila Souza", cargo: "Auxiliar de Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Recém-contratada, sem acesso ao portal", semConta: true },
  { token: "rafael", id: 12, nome: "Rafael Teixeira", cargo: "Técnico de Qualidade", depto: "Qualidade", gestor: "Beatriz Gomes", papel: "Participante" },
  { token: "henrique", id: 11, nome: "Henrique Duarte", cargo: "Diretor Industrial", depto: "Diretoria", gestor: null, papel: "Diretoria (liderança das gestoras)", semConta: true },
].map((p) => ({ ...p, uuid: uuidDe(p.id) }));
export const porToken = (t: string) => PESSOAS.find((p) => p.token === t);
export const porId = (id: number) => PESSOAS.find((p) => p.id === id)!;

export interface Demo {
  db: PGlite;
  fake: ReturnType<typeof criarFake>;
  chamar: (token: string, acao: string, corpo?: Record<string, unknown>) => Promise<{ c: number; b: any }>;
  q: (sql: string) => Promise<any[]>;
}

let atual: ReturnType<typeof criarFake> | null = null;
(globalThis as any).__ADMIN = new Proxy({}, { get: (_t, k) => (atual as any)?.[k] });
let handlerCache: ((req: any, res: any) => Promise<void>) | null = null;
async function handler() {
  handlerCache ??= (await import(pathToFileURL(`${RAIZ}/api/desenvolvimento.ts`).href)).default;
  return handlerCache!;
}

/** Banco novo com as migrations reais e as pessoas fictícias; ninguém habilitado ainda. */
export async function criarDemo(): Promise<Demo> {
  const db = new PGlite({ parsers: { [types.DATE]: (v: string) => v } }); // datas como texto, como no PostgREST
  const q = async (sql: string) => (await db.query(sql)).rows as any[];
  const linhas = PESSOAS.map((p) => `(${p.id}, '${p.nome.replace(/'/g, "''")}', '${p.cargo}', '${p.depto}', ${p.gestor ? `'${p.gestor}'` : "null"}, ${p.id === 10 ? "current_date - 30" : "date '2020-03-01'"})`).join(",\n ");
  await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (bucket_id text, name text);
create table public.module_access (user_id uuid, modulo text, concedido_por text, concedido_em timestamptz default now());
create table public.colaboradores (id bigint primary key, cpf text not null default '', nome text not null, cargo text not null default '', departamento text not null default '', vinculo text, depto_code text, nivel text, gestor text, admissao date, desligado boolean default false, data_desligamento date, motivo_desligamento text, desligado_by text, matriz9box_visao_completa boolean default false, empresa_afiliada boolean default false);
alter table public.colaboradores enable row level security; create policy leitura on public.colaboradores for select to authenticated using (true); grant select on public.colaboradores to authenticated;
create table public.peopleflow_descricoes_cargo (cargo_nome text primary key, obsoleto boolean not null default false);
create table public.peopleflow_pdi (id bigint generated always as identity primary key);
insert into public.colaboradores (id, nome, cargo, departamento, gestor, admissao) values
 ${linhas};
insert into public.peopleflow_descricoes_cargo (cargo_nome) values ${[...new Set(PESSOAS.map((p) => p.cargo))].map((c) => `('${c}')`).join(",")};
`);
  for (const p of PESSOAS.filter((x) => !x.semConta)) await db.exec(`insert into auth.users (id) values ('${p.uuid}'); insert into public.module_access (user_id, modulo, concedido_por) values ('${p.uuid}', 'peopleflow', 'demonstração'), ('${p.uuid}', 'sst', 'demonstração');`);
  for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql", "desenvolvimento_avaliacao_reacao.sql", "desenvolvimento_participacao_gravacao.sql", "desenvolvimento_habilitacao_responsaveis.sql"]) await db.exec(SQL(f));
  await db.exec("insert into public.peopleflow_dev_lista_mestra (codigo,titulo,revisao_atual,situacao) values ('POP-QUA-012','Pesagem de insumos','02','vigente'),('IT-LOG-005','Recebimento de materiais','01','vigente')");
  const { emailOf } = await import(pathToFileURL(`${RAIZ}/src/domain/hierarquia.ts`).href);
  const usuarios: Record<string, { id: string; email: string }> = {};
  for (const p of PESSOAS.filter((x) => !x.semConta)) usuarios[p.token] = { id: p.uuid, email: emailOf(p.nome) };
  const fake = criarFake(db, usuarios);
  atual = fake;
  const h = await handler();
  const chamar: Demo["chamar"] = async (token, acao, corpo = {}) => {
    const res: any = { c: 0, b: null, status(c: number) { this.c = c; return this; }, json(b: unknown) { this.b = b; } };
    await h({ method: "POST", query: { acao }, headers: token ? { authorization: `Bearer ${token}` } : {}, body: corpo }, res);
    return res;
  };
  return { db, fake, chamar, q };
}
