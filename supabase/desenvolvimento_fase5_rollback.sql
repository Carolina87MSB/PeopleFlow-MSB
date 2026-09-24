-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5 — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Volta os objetos peopleflow_dev_* ao estado da Fase 4. Não toca em nenhum
-- objeto do PeopleFlow (PDI/AVD incluídos), do Portal SST ou do antigo Portal
-- de Treinamentos.
--
-- ATENÇÃO: remove as colunas/tabelas da Fase 5 — os dados nelas se perdem.
-- Com o módulo em uso, faça antes o backup lógico
-- (_fase0_desenvolvimento/scripts/baseline.mjs) e baixe os arquivos do bucket.
-- O bucket desenvolvimento-evidencias só é removido se estiver VAZIO.
-- Rodar em Supabase > SQL Editor > New query.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- Histórico volta à definição da Fase 1 (drop + create: colunas diferentes).
drop view if exists public.peopleflow_dev_v_conformidade;
drop view if exists public.peopleflow_dev_v_historico;
create view public.peopleflow_dev_v_historico with (security_invoker = true) as
select p.id as participante_id, p.colaborador_id, t.id as treinamento_id, t.codigo as treinamento_codigo, t.titulo, t.tipo,
  t.lista_mestra_codigo, t.lista_mestra_revisao, coalesce(t.data_fim, t.data_inicio) as data_realizacao, t.carga_horaria_min,
  t.periodicidade_meses as periodicidade_treinamento_meses, p.validade_ate, p.presenca_metodo, p.origem_registro
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where t.status = 'concluido' and p.presenca_status = 'presente' and p.removido_em is null;

-- v_conformidade (mesma definição da Fase 1)
create view public.peopleflow_dev_v_conformidade with (security_invoker = true) as
with base as (
  select c.id as colaborador_id, c.admissao, r.id as requisito_id, r.cargo_nome, r.lista_mestra_codigo, lm.revisao_atual,
    r.recicla_na_revisao, r.prazo_apos_admissao_dias, coalesce(r.periodicidade_meses, lm.periodicidade_meses) as periodicidade_meses
  from public.colaboradores c
  join public.peopleflow_dev_cargo_requisitos r on r.cargo_nome = c.cargo and r.status = 'vigente' and r.obrigatorio and r.tipo_requisito = 'treinamento'
  join public.peopleflow_dev_lista_mestra lm on lm.codigo = r.lista_mestra_codigo
  where coalesce(c.desligado, false) = false and coalesce(c.empresa_afiliada, false) = false
    and (c.admissao is null or c.admissao <= current_date) and public.peopleflow_dev_pode_ver_colaborador(c.id)
),
ultima as (
  select distinct on (h.colaborador_id, h.lista_mestra_codigo) h.colaborador_id, h.lista_mestra_codigo, h.data_realizacao, h.lista_mestra_revisao, h.validade_ate, h.periodicidade_treinamento_meses
  from public.peopleflow_dev_v_historico h where h.lista_mestra_codigo is not null
  order by h.colaborador_id, h.lista_mestra_codigo, h.data_realizacao desc nulls last
),
calc as (
  select b.*, u.data_realizacao as ultima_realizacao, u.lista_mestra_revisao as revisao_realizada,
    coalesce(u.validade_ate, case when coalesce(u.periodicidade_treinamento_meses, b.periodicidade_meses) is not null and u.data_realizacao is not null
      then (u.data_realizacao + make_interval(months => coalesce(u.periodicidade_treinamento_meses, b.periodicidade_meses)))::date end) as validade_ate,
    exists (select 1 from public.peopleflow_dev_participantes p join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
      where p.colaborador_id = b.colaborador_id and p.removido_em is null and t.lista_mestra_codigo = b.lista_mestra_codigo and t.status in ('planejado', 'em_andamento')) as agendado
  from base b left join ultima u on u.colaborador_id = b.colaborador_id and u.lista_mestra_codigo = b.lista_mestra_codigo
)
select colaborador_id, requisito_id, cargo_nome, lista_mestra_codigo, revisao_atual, revisao_realizada, ultima_realizacao, validade_ate, agendado,
  case
    when ultima_realizacao is null then case when agendado then 'agendado'
      when prazo_apos_admissao_dias is not null and admissao is not null and current_date <= admissao + prazo_apos_admissao_dias then 'no_prazo_integracao' else 'pendente' end
    when recicla_na_revisao and revisao_realizada is distinct from revisao_atual then case when agendado then 'agendado' else 'revisao_pendente' end
    when validade_ate is not null and validade_ate < current_date then case when agendado then 'agendado' else 'vencido' end
    when validade_ate is not null and validade_ate <= current_date + 30 then 'a_vencer'
    else 'em_dia' end as situacao
from calc;

revoke all on public.peopleflow_dev_v_historico, public.peopleflow_dev_v_conformidade from public, anon, authenticated;
grant select on public.peopleflow_dev_v_historico, public.peopleflow_dev_v_conformidade to authenticated;

-- Visibilidade de treinamento volta à regra da Fase 1.
create or replace function public.peopleflow_dev_treinamento_visivel(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
      select 1 from public.peopleflow_dev_participantes p
      join public.peopleflow_dev_escopo e
        on e.colaborador_id = p.colaborador_id and e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
      where p.treinamento_id = p_treinamento_id and p.removido_em is null)
    else false end
$$;

-- Contas "Responsavel" são cópias derivadas (recriadas ao abrir o módulo): podem sair.
delete from public.peopleflow_dev_contas where perfil = 'Responsavel';
alter table public.peopleflow_dev_contas drop constraint if exists peopleflow_dev_contas_perfil_chk;
alter table public.peopleflow_dev_contas add constraint peopleflow_dev_contas_perfil_check check (perfil in ('RH', 'Gestor'));

drop table if exists public.peopleflow_dev_qr_tokens;
drop table if exists public.peopleflow_dev_treinamento_necessidades;

alter table public.peopleflow_dev_necessidades
  drop column if exists atendida_em,
  drop column if exists atendida_treinamento_id;

alter table public.peopleflow_dev_evidencias drop constraint if exists peopleflow_dev_evid_tipo_chk;
alter table public.peopleflow_dev_evidencias drop column if exists observacao;
alter table public.peopleflow_dev_evidencias
  add constraint peopleflow_dev_evidencias_tipo_check check (tipo in ('lista_presenca', 'certificado', 'material', 'outro')) not valid;

alter table public.peopleflow_dev_participantes drop constraint if exists peopleflow_dev_part_eficacia_chk;
alter table public.peopleflow_dev_participantes
  drop column if exists eficacia_resultado,
  drop column if exists eficacia_observacao,
  drop column if exists eficacia_por,
  drop column if exists eficacia_por_colaborador_id;

drop index if exists public.peopleflow_dev_trein_solicitante_idx;
alter table public.peopleflow_dev_treinamentos
  drop constraint if exists peopleflow_dev_trein_status_chk,
  drop constraint if exists peopleflow_dev_trein_origem_chk,
  drop constraint if exists peopleflow_dev_trein_carga_real_chk,
  drop constraint if exists peopleflow_dev_trein_concluido_chk;
update public.peopleflow_dev_treinamentos set status = 'planejado' where status = 'solicitado';
alter table public.peopleflow_dev_treinamentos
  drop column if exists origem_tipo,
  drop column if exists lista_mestra_titulo,
  drop column if exists local_link,
  drop column if exists observacao,
  drop column if exists exige_eficacia,
  drop column if exists eficacia_prazo,
  drop column if exists data_realizacao,
  drop column if exists carga_realizada_min,
  drop column if exists solicitado_por_colaborador_id,
  drop column if exists planejado_em,
  drop column if exists planejado_por,
  drop column if exists iniciado_em,
  drop column if exists iniciado_por;
alter table public.peopleflow_dev_treinamentos alter column status set default 'planejado';
alter table public.peopleflow_dev_treinamentos
  add constraint peopleflow_dev_treinamentos_status_check check (status in ('planejado', 'em_andamento', 'concluido', 'cancelado')) not valid;

-- Bucket: só sai se estiver vazio (nunca apaga arquivos).
delete from storage.buckets b
where b.id = 'desenvolvimento-evidencias'
  and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

commit;
