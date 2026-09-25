-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5c — REVERSÃO (volta ao estado da Fase 5b)
-- ════════════════════════════════════════════════════════════════════════
-- ATENÇÃO:
--   • Associações só INDICADAS (não validadas pelo RH) são DESATIVADAS antes
--     de remover a coluna de situação — sem isso elas passariam a valer como
--     oficiais. As validadas continuam ativas; as rejeitadas já são inativas.
--   • A tabela de Responsáveis por Treinamentos da Gestão é removida (as
--     indicações se perdem; a auditoria das ações permanece).
--   • Treinamentos já criados como PLANEJADO continuam PLANEJADOS.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- Funções voltam à definição da Fase 5.
create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
    select 1 from public.peopleflow_dev_treinamentos t
    where t.id = p_treinamento_id
      and public.peopleflow_dev_meu_colaborador_id() is not null
      and t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id())
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
    when 'Responsavel' then public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;

-- Indicações ainda não validadas não podem virar oficiais sem a coluna de situação.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_treinamento_necessidades' and column_name = 'situacao') then
    update public.peopleflow_dev_treinamento_necessidades
      set ativo = false, desvinculado_em = coalesce(desvinculado_em, now()), desvinculado_motivo = coalesce(desvinculado_motivo, 'Reversão da Fase 5c: indicação não validada pelo RH')
      where situacao = 'indicada' and ativo;
  end if;
end $$;
alter table public.peopleflow_dev_treinamento_necessidades
  drop constraint if exists peopleflow_dev_trein_nec_situacao_chk,
  drop constraint if exists peopleflow_dev_trein_nec_rejeitada_chk;
alter table public.peopleflow_dev_treinamento_necessidades
  drop column if exists situacao,
  drop column if exists indicado_por_colaborador_id,
  drop column if exists analisado_em,
  drop column if exists analisado_por,
  drop column if exists analise_motivo;

drop table if exists public.peopleflow_dev_responsaveis_gestao;

alter table public.peopleflow_dev_treinamentos alter column status set default 'solicitado';

commit;
