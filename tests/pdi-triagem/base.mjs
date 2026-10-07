// Base comum dos testes da Fase 7: réplica PGlite com as Fases 1–6 REAIS + tabelas do PDI. Nenhuma conexão com produção.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// raiz do repositório (tests/pdi-triagem → ../..), independente de onde o teste é chamado
export const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\\/g, "/");
export const SUP = REPO + "supabase/";
export const rd = (f) => fs.readFileSync(SUP + f, "utf8");
// instalado em tests/node_modules (npm ci dentro de tests/)
const { PGlite } = await import("@electric-sql/pglite");

export const U_RH = "00000000-0000-0000-0000-0000000000a1";
export const U_G1 = "00000000-0000-0000-0000-0000000000b1";
export const U_ALHEIO = "00000000-0000-0000-0000-0000000000c9";

export function criarContador() {
  const c = { ok: 0, falhas: 0 };
  c.check = (nome, cond, extra = "") => {
    if (cond) { c.ok++; console.log("  ✓", nome); } else { c.falhas++; console.log("  ✗ FALHOU:", nome, extra); }
  };
  c.secao = (t) => console.log("\n== " + t + " ==");
  return c;
}

/** Réplica com Fases 1–6 + PDI (colunas reais de schema.sql). */
export async function novaReplica() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create table public.colaboradores (id bigint generated always as identity primary key, nome text, cargo text, departamento text, gestor text, desligado boolean default false, admissao date, empresa_afiliada boolean default false);
    create table public.peopleflow_descricoes_cargo (cargo_nome text primary key);
    create table public.peopleflow_pdi (
      id bigint generated always as identity primary key, colaborador_nome text not null, avaliacao_id text, origem text, acao text not null default '', prazo date,
      status text not null default 'Pendente', responsavel text, criado_em timestamptz not null default now(), updated_at timestamptz not null default now(), ciclo text);
    create table public.peopleflow_pdi_itens (
      id text primary key, pdi_id bigint not null, competencia_id text, competencia_nome text not null, tipo_competencia text not null, nota_obtida numeric,
      origem_manual boolean not null default false, objetivo_desenvolvimento text not null default '', responsavel text not null default '', data_inicio date,
      data_prevista_conclusao date, status text not null default 'Não iniciada', observacoes text not null default '', ordem integer not null default 0,
      criado_em timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.peopleflow_pdi_acoes (
      id text primary key, item_id text not null, descricao text not null, responsavel text not null default '', prazo date, status text not null default 'Não iniciada',
      ordem integer not null default 0, criado_em timestamptz not null default now(), updated_at timestamptz not null default now());
    -- as tabelas do PDI são legíveis por qualquer autenticado no produto real (política using(true)); réplica idem
    alter table public.peopleflow_pdi enable row level security; alter table public.peopleflow_pdi_itens enable row level security; alter table public.peopleflow_pdi_acoes enable row level security;
    create policy p_pdi on public.peopleflow_pdi for all to authenticated using (true) with check (true);
    create policy p_pdi_i on public.peopleflow_pdi_itens for all to authenticated using (true) with check (true);
    create policy p_pdi_a on public.peopleflow_pdi_acoes for all to authenticated using (true) with check (true);
    grant all on public.peopleflow_pdi, public.peopleflow_pdi_itens, public.peopleflow_pdi_acoes to authenticated, service_role;
  `);
  for (const f of ["desenvolvimento_fase1.sql", "desenvolvimento_fase2.sql", "desenvolvimento_fase4.sql", "desenvolvimento_fase5.sql", "desenvolvimento_fase5b_homologacao.sql", "desenvolvimento_fase5c_registro.sql", "desenvolvimento_fase5d_habilidades_dc.sql"]) await db.exec(rd(f));
  const f6 = rd("desenvolvimento_fase6_lnt_nucleo.sql");
  await db.query(f6.slice(0, f6.indexOf("$mig$;", f6.indexOf("do $mig$")) + 6));
  await db.exec("grant select on public.colaboradores to service_role, authenticated; grant select, update on public.peopleflow_descricoes_cargo to service_role;");
  await db.exec(`
    insert into auth.users (id) values ('${U_RH}'), ('${U_G1}'), ('${U_ALHEIO}');
    insert into public.colaboradores (nome, cargo, departamento, gestor, desligado) values
      ('Ana RH', 'Analista de RH', 'RH', null, false), ('Gil Gestor', 'Supervisor', 'Produção', null, false), ('Paulo Produção', 'Auxiliar', 'Produção', 'Gil Gestor', false), ('Quênia Qualidade', 'Analista', 'Qualidade', null, false);
    insert into public.peopleflow_dev_contas (user_id, colaborador_id, perfil) values ('${U_RH}', 1, 'RH'), ('${U_G1}', 2, 'Gestor');
    insert into public.peopleflow_dev_escopo (gestor_colaborador_id, colaborador_id) values (2, 3);
  `);
  const sql = async (t, p = []) => { await db.exec("reset role"); return (await db.query(t, p)).rows; };
  const um = async (t, p = []) => (await sql(t, p))[0];
  /** executa como um papel real do Postgres (RLS valendo) */
  const como = async (papel, uid, fn) => {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
    await db.exec(`set role ${papel}`);
    try { return await fn(); } finally { await db.exec("reset role"); await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); }
  };
  const erro = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  return { db, sql, um, como, erro };
}

export const PDI = {
  pdi: (nome, ciclo = "2º Ciclo MSB") => `insert into public.peopleflow_pdi (colaborador_nome, ciclo) values ('${nome}', '${ciclo}') returning id`,
};

/** PDI de teste: 4 itens; ações com texto longo (>500) e textos com espaços repetidos para testar a normalização. */
export async function semearPdi({ db, um }) {
  const p1 = (await um(PDI.pdi("Paulo Produção"))).id;
  const p2 = (await um(PDI.pdi("Quênia Qualidade"))).id;
  await db.exec(`
    insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia, objetivo_desenvolvimento) values
      ('I1', ${p1}, 'Comunicação', 'Comportamental', 'Desenvolver a competência de Comunicação.'),
      ('I2', ${p1}, 'ABSETEÍSMO (individual)', 'Tecnica', 'Reduzir faltas e atrasos.'),
      ('I3', ${p2}, 'Comunicação', 'Comportamental', 'Comunicar com clareza em alinhamentos.'),
      ('I4', ${p2}, 'Qualidade e Conformidade', 'Comportamental', 'Desenvolver a competência de Qualidade e Conformidade.'),
      ('I5', ${p1}, 'Comunicação', 'Comportamental', 'Comunicar com clareza e segurança.');
    insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values
      ('A1', 'I1', 'desenvolver clareza, objetividade e segurança na comunicação', 'Em andamento', 1),
      ('A2', 'I1', 'realizar apresentações periódicas de resultados, solicitando feedback', 'Pendente', 2),
      ('A3', 'I1', 'participar de um curso de oratória', 'Pendente', 3),
      ('B1', 'I2', 'Identificar os principais motivos das faltas e atrasos', 'Pendente', 1),
      ('B2', 'I2', 'Acompanhar mensalmente   faltas e atrasos', 'Pendente', 2),
      ('C1', 'I3', 'assumir a condução de alinhamentos envolvendo temas críticos', 'Pendente', 1),
      ('E1', 'I5', 'aprimorar clareza, objetividade e segurança na comunicação', 'Pendente', 1),
      ('E2', 'I5', 'realizar apresentações periódicas de resultados, solicitando feedback', 'Pendente', 2),
      ('E3', 'I5', 'participar de um curso de oratória', 'Pendente', 3),
      ('D1', 'I4', '${"Reciclagem nos POPs aplicáveis à rotina. ".repeat(14)}', 'Pendente', 1);
  `);
  return { p1, p2 };
}
