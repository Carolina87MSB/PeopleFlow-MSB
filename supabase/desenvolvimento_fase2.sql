-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 2 (Lista Mestra + Habilidades + Requisitos)
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_* criados na Fase 1 (hoje vazios).
-- Nenhuma tabela, coluna, dado ou regra existente do PeopleFlow, do Portal
-- SST ou do antigo Portal de Treinamentos é tocado.
--
-- O que muda:
--   • Lista Mestra e histórico de revisões: coluna "observacao".
--   • Habilidades: "categoria" e "nome_normalizado" (único — impede
--     duplicidade por nome padronizado, sem diferenciar acento/maiúscula;
--     calculado pelo servidor).
--   • Requisitos do cargo: observação, origem (rh/gestor/importacao), autor
--     da sugestão, descrição livre para sugestão ainda sem item de catálogo,
--     motivo de mudança de status; regras: VIGENTE exige validação pelo RH e
--     referência ao catálogo/Lista Mestra; sugestão do gestor exige autor e
--     justificativa.
--   • Leitura de requisitos pelo Gestor passa a ser restrita aos cargos da
--     própria equipe (vigentes + as próprias sugestões). RH continua vendo tudo.
--
-- Transacional (begin/commit): qualquer erro desfaz tudo.
-- Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase2_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── Lista Mestra ────────────────────────────────────────────────────────
alter table public.peopleflow_dev_lista_mestra
  add column if not exists observacao text not null default '';

alter table public.peopleflow_dev_lista_mestra_revisoes
  add column if not exists observacao text not null default '';

-- ── Habilidades ─────────────────────────────────────────────────────────
-- Regra de nome padronizado — IDÊNTICA a normalizarNome() em
-- api/_lib/desenvolvimentoAcoes.ts: decompõe (NFD), remove acentos
-- (U+0300–U+036F), minúsculas, troca espaços/tab/quebra/NBSP por um espaço
-- e tira espaços das pontas. Usada aqui só para preencher linhas que já
-- existam; no dia a dia quem grava é o servidor.
create or replace function public.peopleflow_dev_normalizar_nome(p_nome text)
returns text language sql immutable strict set search_path = public as $$
  select btrim(
    regexp_replace(
      lower(regexp_replace(normalize(p_nome, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g')),
      '[' || chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160) || ']+', ' ', 'g'),
    ' ')
$$;
revoke all on function public.peopleflow_dev_normalizar_nome(text) from public, anon, authenticated;
grant execute on function public.peopleflow_dev_normalizar_nome(text) to service_role;

-- 1) coluna nasce aceitando NULL; 2) preenche o que já existir;
-- 3) só então NOT NULL; 4) só então o índice único. Se houver dois nomes
-- que se tornam iguais após a padronização, o passo 4 falha e a transação
-- inteira é desfeita (nada fica pela metade).
alter table public.peopleflow_dev_habilidades
  add column if not exists categoria text,
  add column if not exists nome_normalizado text;

update public.peopleflow_dev_habilidades
  set nome_normalizado = public.peopleflow_dev_normalizar_nome(nome)
  where nome_normalizado is null;

alter table public.peopleflow_dev_habilidades
  alter column nome_normalizado set not null;

create unique index if not exists peopleflow_dev_habilidades_nome_norm_uidx
  on public.peopleflow_dev_habilidades (nome_normalizado);
create index if not exists peopleflow_dev_habilidades_filtro_idx
  on public.peopleflow_dev_habilidades (ativo, tipo);

-- ── Requisitos do cargo ─────────────────────────────────────────────────
alter table public.peopleflow_dev_cargo_requisitos
  add column if not exists observacao text not null default '',
  add column if not exists origem text not null default 'rh',
  add column if not exists descricao_sugerida text,
  add column if not exists sugerido_por_colaborador_id bigint references public.colaboradores (id),
  add column if not exists status_motivo text;

alter table public.peopleflow_dev_cargo_requisitos
  drop constraint if exists peopleflow_dev_req_origem_chk,
  drop constraint if exists peopleflow_dev_req_referencia_chk,
  drop constraint if exists peopleflow_dev_req_vigente_chk,
  drop constraint if exists peopleflow_dev_req_sugestao_gestor_chk,
  drop constraint if exists peopleflow_dev_req_inativo_chk;

-- Regra da Fase 1 (referência obrigatória sempre) é substituída por uma
-- versão que aceita sugestão ainda sem item de catálogo — somente enquanto
-- SUGERIDO e com descrição preenchida.
alter table public.peopleflow_dev_cargo_requisitos
  drop constraint if exists peopleflow_dev_cargo_requisitos_check;

alter table public.peopleflow_dev_cargo_requisitos
  add constraint peopleflow_dev_req_origem_chk check (origem in ('rh', 'gestor', 'importacao')),
  add constraint peopleflow_dev_req_referencia_chk check (
    (tipo_requisito = 'habilidade' and lista_mestra_codigo is null
      and (habilidade_id is not null or (status = 'sugerido' and coalesce(btrim(descricao_sugerida), '') <> '')))
    or (tipo_requisito = 'treinamento' and habilidade_id is null
      and (lista_mestra_codigo is not null or (status = 'sugerido' and coalesce(btrim(descricao_sugerida), '') <> '')))
  ),
  add constraint peopleflow_dev_req_vigente_chk check (status <> 'vigente' or (validado_em is not null and validado_por is not null)),
  add constraint peopleflow_dev_req_sugestao_gestor_chk check (
    origem <> 'gestor' or (sugerido_por_colaborador_id is not null and btrim(justificativa) <> '')
  ),
  add constraint peopleflow_dev_req_inativo_chk check (status <> 'inativo' or coalesce(btrim(status_motivo), '') <> '');

create index if not exists peopleflow_dev_req_sugerido_por_idx
  on public.peopleflow_dev_cargo_requisitos (sugerido_por_colaborador_id);

-- ── Leitura de requisitos: Gestor restrito aos cargos da equipe ─────────
create or replace function public.peopleflow_dev_cargo_no_escopo(p_cargo_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then exists (
      select 1 from public.peopleflow_dev_escopo e
      join public.colaboradores c on c.id = e.colaborador_id
      where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
        and c.cargo = p_cargo_nome)
    else false end
$$;

revoke all on function public.peopleflow_dev_cargo_no_escopo(text) from public, anon;
grant execute on function public.peopleflow_dev_cargo_no_escopo(text) to authenticated, service_role;

drop policy if exists dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos;
create policy dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos for select to authenticated
  using (
    (select public.peopleflow_dev_meu_perfil()) = 'RH'
    or (
      (select public.peopleflow_dev_meu_perfil()) = 'Gestor'
      and public.peopleflow_dev_cargo_no_escopo(cargo_nome)
      and (status = 'vigente' or sugerido_por_colaborador_id = (select public.peopleflow_dev_meu_colaborador_id()))
    )
  );

commit;
