-- ════════════════════════════════════════════════════════════════════════
-- Reversão: Habilitação de Responsáveis por Treinamentos — Etapa 1 (supabase/desenvolvimento_habilitacao_responsaveis.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Devolve as funções e políticas de leitura exatamente à definição anterior (fase 1, 5 e 5c) e remove o que a migration criou.
-- Recusa-se (nada é alterado) se já existir indicação pendente, indicação recusada ou transferência de responsabilidade:
-- são registros de rastreabilidade que o modelo anterior não sabe representar e que nunca são apagados.
-- Habilitações ativas e revogadas voltam para a forma anterior (ativo + dados de revogação), sem perda.
-- Transacional e repetível.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_responsaveis_gestao') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_responsaveis_gestao' and column_name = 'situacao') then
    if exists (select 1 from public.peopleflow_dev_responsaveis_gestao where situacao in ('indicada', 'recusada')) then
      raise exception 'Reversão bloqueada: existem indicações pendentes ou recusadas (registros de rastreabilidade não são apagados).';
    end if;
  end if;
  if to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then
    if exists (select 1 from public.peopleflow_dev_transferencias_responsabilidade) then
      raise exception 'Reversão bloqueada: existem transferências de responsabilidade registradas (histórico não é apagado).';
    end if;
  end if;
end $$;

-- 1. Funções e políticas de leitura: definição anterior
create or replace function public.peopleflow_dev_responsavel_por(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and public.peopleflow_dev_meu_colaborador_id() in (t.responsavel_colaborador_id, t.instrutor_colaborador_id))
$$;

create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and (t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
           or exists (select 1 from public.peopleflow_dev_escopo e
                      where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
                        and e.colaborador_id = t.solicitado_por_colaborador_id)))
$$;

create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_gere_treinamento(p_treinamento_id)
      or exists (
        select 1 from public.peopleflow_dev_participantes p
        join public.peopleflow_dev_escopo e
          on e.colaborador_id = p.colaborador_id and e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
        where p.treinamento_id = p_treinamento_id and p.removido_em is null)
    when 'Responsavel' then public.peopleflow_dev_gere_treinamento(p_treinamento_id)
    else false end
$$;

create or replace function public.peopleflow_dev_participante_visivel(p_participante_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peopleflow_dev_participantes p
    where p.id = p_participante_id
      and (public.peopleflow_dev_pode_ver_colaborador(p.colaborador_id)
           or (public.peopleflow_dev_meu_perfil() in ('RH', 'Gestor', 'Responsavel') and public.peopleflow_dev_gere_treinamento(p.treinamento_id))))
$$;

drop policy if exists dev_participantes_leitura on public.peopleflow_dev_participantes;
create policy dev_participantes_leitura on public.peopleflow_dev_participantes for select to authenticated
  using (public.peopleflow_dev_pode_ver_colaborador(colaborador_id)
         or ((select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor', 'Responsavel') and public.peopleflow_dev_gere_treinamento(treinamento_id)));

drop policy if exists dev_evidencias_leitura on public.peopleflow_dev_evidencias;
create policy dev_evidencias_leitura on public.peopleflow_dev_evidencias for select to authenticated
  using (
    public.peopleflow_dev_treinamento_visivel(treinamento_id)
    and (participante_id is null or public.peopleflow_dev_participante_visivel(participante_id))
  );

drop policy if exists dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades;
create policy dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades for select to authenticated
  using (public.peopleflow_dev_treinamento_visivel(treinamento_id) and (select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor'));

drop function if exists public.peopleflow_dev_treinamento_gestao_visivel(bigint);
drop function if exists public.peopleflow_dev_instrutor_de(bigint);
drop function if exists public.peopleflow_dev_habilitado_agora();

-- 2. Transferências (vazia, conferido acima)
drop table if exists public.peopleflow_dev_transferencias_responsabilidade;

-- 3. Habilitações: de volta ao modelo anterior (ativo + revogação com motivo)
drop trigger if exists peopleflow_dev_responsaveis_gestao_regras on public.peopleflow_dev_responsaveis_gestao;
drop function if exists public.peopleflow_dev_resp_gestao_regras();
drop index if exists public.peopleflow_dev_resp_gestao_uma_habilitacao_uidx;
drop index if exists public.peopleflow_dev_resp_gestao_indicada_uidx;
alter table public.peopleflow_dev_responsaveis_gestao
  drop constraint if exists peopleflow_dev_resp_gestao_situacao_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_origem_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_ativo_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_habilitada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_revogada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_recusada_chk;
alter table public.peopleflow_dev_responsaveis_gestao
  drop column if exists situacao,
  drop column if exists origem,
  drop column if exists departamento,
  drop column if exists habilitado_em,
  drop column if exists habilitado_por,
  drop column if exists recusado_em,
  drop column if exists recusado_por,
  drop column if exists recusado_motivo;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%revogado_motivo%'
  ) then
    alter table public.peopleflow_dev_responsaveis_gestao
      add constraint peopleflow_dev_responsaveis_gestao_revogacao_check check (ativo or (revogado_em is not null and coalesce(btrim(revogado_motivo), '') <> ''));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
