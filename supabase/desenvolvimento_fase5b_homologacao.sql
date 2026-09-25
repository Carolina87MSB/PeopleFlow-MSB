-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5b: treinamento de HOMOLOGAÇÃO/TESTE
-- ════════════════════════════════════════════════════════════════════════
-- Flag (não é Tipo) para o RH testar em produção o fluxo real da Fase 5 sem
-- efeito oficial. Altera SOMENTE objetos peopleflow_dev_*.
--
--   • peopleflow_dev_treinamentos.homologacao boolean NOT NULL DEFAULT false
--     (todos os treinamentos existentes continuam oficiais).
--   • Trava no banco (trigger): a flag não muda depois que a realização
--     começou; reposição de treinamento de teste é sempre teste; treinamento
--     de teste não recebe vínculo com Necessidade de Desenvolvimento.
--   • Histórico oficial (v_historico → base da conformidade), "agendado" da
--     conformidade e histórico individual (v_participacoes) desconsideram
--     treinamentos de teste. Mesmas colunas de antes (create or replace).
--   • Auditoria: continua registrando tudo; cada registro ligado a um
--     treinamento de teste recebe detalhe.homologacao = true (marcado no
--     próprio INSERT — a auditoria segue imutável).
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase5b_homologacao_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.peopleflow_dev_treinamentos
  add column if not exists homologacao boolean not null default false;
comment on column public.peopleflow_dev_treinamentos.homologacao is
  'Treinamento de homologação/teste do fluxo: sem validade como capacitação oficial, conformidade, indicadores ou Necessidades de Desenvolvimento.';
create index if not exists peopleflow_dev_trein_homolog_idx on public.peopleflow_dev_treinamentos (homologacao) where homologacao;

-- ── Travas da flag ──────────────────────────────────────────────────────
create or replace function public.peopleflow_dev_trein_homologacao_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.homologacao is distinct from old.homologacao then
    if old.status not in ('solicitado', 'planejado') or old.iniciado_em is not null then
      raise exception 'A condição de homologação/teste não pode ser alterada depois do início da realização.';
    end if;
    if new.homologacao and exists (select 1 from public.peopleflow_dev_treinamento_necessidades v where v.treinamento_id = new.id and v.ativo) then
      raise exception 'Treinamento com Necessidades de Desenvolvimento vinculadas não pode virar homologação/teste.';
    end if;
  end if;
  if new.reposicao_de_id is not null and not new.homologacao
     and exists (select 1 from public.peopleflow_dev_treinamentos o where o.id = new.reposicao_de_id and o.homologacao) then
    raise exception 'Reposição de treinamento de homologação/teste também é homologação/teste.';
  end if;
  return new;
end $$;
drop trigger if exists peopleflow_dev_trein_homologacao_guard on public.peopleflow_dev_treinamentos;
create trigger peopleflow_dev_trein_homologacao_guard before insert or update on public.peopleflow_dev_treinamentos
  for each row execute function public.peopleflow_dev_trein_homologacao_guard();

create or replace function public.peopleflow_dev_vinculo_homologacao_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ativo and exists (select 1 from public.peopleflow_dev_treinamentos t where t.id = new.treinamento_id and t.homologacao) then
    raise exception 'Treinamento de homologação/teste não pode ser vinculado a Necessidade de Desenvolvimento.';
  end if;
  return new;
end $$;
drop trigger if exists peopleflow_dev_vinculo_homologacao_guard on public.peopleflow_dev_treinamento_necessidades;
create trigger peopleflow_dev_vinculo_homologacao_guard before insert or update on public.peopleflow_dev_treinamento_necessidades
  for each row execute function public.peopleflow_dev_vinculo_homologacao_guard();

-- ── Auditoria: marca registros de treinamentos de teste (sem deixar de auditar) ──
create or replace function public.peopleflow_dev_auditoria_marcar_homologacao()
returns trigger language plpgsql set search_path = public as $$
declare tid bigint;
begin
  begin
    tid := case when new.entidade = 'peopleflow_dev_treinamentos' then new.entidade_id::bigint
                else (new.detalhe ->> 'treinamento_id')::bigint end;
  exception when others then tid := null;
  end;
  if tid is not null and exists (select 1 from public.peopleflow_dev_treinamentos t where t.id = tid and t.homologacao) then
    new.detalhe := coalesce(new.detalhe, '{}'::jsonb) || jsonb_build_object('homologacao', true);
  end if;
  return new;
end $$;
drop trigger if exists peopleflow_dev_auditoria_marcar_homologacao on public.peopleflow_dev_auditoria;
create trigger peopleflow_dev_auditoria_marcar_homologacao before insert on public.peopleflow_dev_auditoria
  for each row execute function public.peopleflow_dev_auditoria_marcar_homologacao();

revoke all on function public.peopleflow_dev_trein_homologacao_guard(), public.peopleflow_dev_vinculo_homologacao_guard(), public.peopleflow_dev_auditoria_marcar_homologacao() from public, anon, authenticated;

-- ── Histórico / conformidade: teste não é capacitação oficial ───────────
create or replace view public.peopleflow_dev_v_historico with (security_invoker = true) as
select
  p.id as participante_id,
  p.colaborador_id,
  t.id as treinamento_id,
  t.codigo as treinamento_codigo,
  t.titulo,
  t.tipo,
  t.lista_mestra_codigo,
  t.lista_mestra_revisao,
  coalesce(t.data_realizacao, t.data_fim, t.data_inicio) as data_realizacao,
  coalesce(t.carga_realizada_min, t.carga_horaria_min) as carga_horaria_min,
  t.periodicidade_meses as periodicidade_treinamento_meses,
  p.validade_ate,
  p.presenca_metodo,
  p.origem_registro,
  t.modalidade,
  t.formato,
  t.lista_mestra_titulo,
  t.exige_eficacia,
  p.eficacia_resultado,
  t.origem_registro as origem_registro_treinamento,
  t.reposicao_de_id,
  t.reposicao_raiz_id,
  t.reposicao_numero
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where t.status = 'concluido' and p.presenca_status = 'presente' and p.removido_em is null
  and not t.homologacao;

create or replace view public.peopleflow_dev_v_conformidade with (security_invoker = true) as
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
      where p.colaborador_id = b.colaborador_id and p.removido_em is null and t.lista_mestra_codigo = b.lista_mestra_codigo and t.status in ('planejado', 'em_andamento') and not t.homologacao) as agendado
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

create or replace view public.peopleflow_dev_v_participacoes with (security_invoker = true) as
select
  p.id as participante_id,
  p.colaborador_id,
  t.id as treinamento_id,
  t.codigo as treinamento_codigo,
  t.titulo,
  t.tipo,
  t.modalidade,
  t.formato,
  t.lista_mestra_codigo,
  t.lista_mestra_revisao,
  t.status as status_treinamento,
  coalesce(t.data_realizacao, t.data_fim, t.data_inicio) as data_referencia,
  coalesce(t.carga_realizada_min, t.carga_horaria_min) as carga_horaria_min,
  p.presenca_status,
  p.presenca_metodo,
  t.exige_eficacia,
  p.eficacia_resultado,
  t.reposicao_de_id,
  coalesce(t.reposicao_raiz_id, t.id) as treinamento_raiz_id,
  t.reposicao_numero,
  case
    when t.status <> 'concluido' then 'previsto'
    when p.presenca_status = 'presente' and t.reposicao_raiz_id is not null then 'realizado_reposicao'
    when p.presenca_status = 'presente' then 'realizado'
    else 'ausente'
  end as situacao,
  case when t.status = 'concluido' and p.presenca_status = 'ausente' then (
    select t2.id from public.peopleflow_dev_participantes p2
    join public.peopleflow_dev_treinamentos t2 on t2.id = p2.treinamento_id
    where p2.colaborador_id = p.colaborador_id and p2.removido_em is null and p2.presenca_status = 'presente'
      and t2.status = 'concluido' and t2.reposicao_raiz_id = coalesce(t.reposicao_raiz_id, t.id) and t2.id <> t.id
    order by t2.data_realizacao nulls last, t2.id
    limit 1) end as reposto_em_treinamento_id
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where p.removido_em is null and t.status <> 'cancelado' and not t.homologacao;

commit;
