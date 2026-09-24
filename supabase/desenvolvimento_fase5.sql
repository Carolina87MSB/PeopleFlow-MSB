-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5 (Gestão de Treinamentos) — versão final
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_* (treinamentos, participantes,
-- evidências e QR estão vazios em produção) e cria o bucket privado do
-- Desenvolvimento. Nenhuma tabela do PeopleFlow, do PDI ou da AVD é tocada;
-- o bucket do PDI (pdi-evidencias) não é usado.
--
-- O que muda:
--   • Treinamento — três dimensões independentes:
--       TIPO       novo_pop | revisao_pop | instrucao_trabalho | integracao |
--                  reciclagem | capacitacao_tecnica | desenvolvimento |
--                  qualidade_regulatorio | saude_seguranca |
--                  sistemas_ferramentas | outro
--       MODALIDADE interno | externo   (obrigatória, sem valor padrão)
--       FORMATO    presencial | online | hibrido
--     Na Fase 1 "tipo" guardava interno/externo e "modalidade" o formato:
--     as colunas são RENOMEADAS (sem perda de dado) para o vocabulário
--     oficial e "tipo" passa a ser a classificação.
--   • Status SOLICITADO (antes de PLANEJADO); documento da Lista Mestra
--     fotografado (código + título + revisão); local/link; observação;
--     eficácia exigida + prazo; data e carga realizadas; quem
--     solicitou/planejou/iniciou.
--   • Reposição para faltantes: reposicao_de_id (treinamento de onde vieram
--     os faltantes), reposicao_raiz_id (treinamento original) e número da
--     reposição. O original nunca é reaberto nem sobrescrito.
--   • Participante: resultado da eficácia (eficaz/parcialmente/não eficaz);
--     origem de inclusão "reposicao" (faltante levado para a reposição).
--   • Vínculo treinamento × necessidade (N:N, sem exclusão física).
--   • Necessidade: data e treinamento que a atenderam.
--   • QR de presença: tabela só do servidor (o navegador não lê).
--   • Evidência: mais tipos (ata, foto, comprovante, avaliação) e observação.
--   • Perfil "Responsavel": acesso do responsável/instrutor SOMENTE aos
--     treinamentos que conduz. Participantes de um treinamento ficam
--     visíveis a quem o conduz ou solicitou (inclusive de outras áreas —
--     treinamentos podem ser transversais); o acesso geral a colaboradores
--     NÃO muda.
--   • Histórico: v_historico (realizações válidas, base da conformidade)
--     ganha campos; nova v_participacoes distingue previsto / realizado /
--     ausente / realizado em reposição.
--   • Bucket privado desenvolvimento-evidencias (sem acesso direto do navegador).
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase5_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

-- As views dependem das colunas renomeadas: saem e são recriadas no fim.
drop view if exists public.peopleflow_dev_v_participacoes;
drop view if exists public.peopleflow_dev_v_conformidade;
drop view if exists public.peopleflow_dev_v_historico;

-- ── Treinamentos: Tipo ≠ Modalidade ≠ Formato ───────────────────────────
do $$
declare c record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'peopleflow_dev_treinamentos' and column_name = 'formato'
  ) then
    -- Checks da Fase 1 dessas duas colunas (localizados pelo conteúdo, não pelo nome gerado).
    for c in
      select conname from pg_constraint
      where conrelid = 'public.peopleflow_dev_treinamentos'::regclass and contype = 'c'
        and (pg_get_constraintdef(oid) like '%''presencial''%' or pg_get_constraintdef(oid) like '%''interno''%')
    loop
      execute format('alter table public.peopleflow_dev_treinamentos drop constraint %I', c.conname);
    end loop;
    alter table public.peopleflow_dev_treinamentos rename column modalidade to formato;
    alter table public.peopleflow_dev_treinamentos rename column tipo to modalidade;
  end if;
end $$;

-- Modalidade é escolhida por quem abre a solicitação — nunca inferida.
alter table public.peopleflow_dev_treinamentos alter column modalidade drop default;
alter table public.peopleflow_dev_treinamentos alter column modalidade set not null;
update public.peopleflow_dev_treinamentos set formato = 'online' where formato = 'ead';

alter table public.peopleflow_dev_treinamentos
  add column if not exists tipo text,
  add column if not exists lista_mestra_titulo text,
  add column if not exists local_link text not null default '',
  add column if not exists observacao text not null default '',
  add column if not exists exige_eficacia boolean not null default false,
  add column if not exists eficacia_prazo date,
  add column if not exists data_realizacao date,
  add column if not exists carga_realizada_min integer,
  add column if not exists solicitado_por_colaborador_id bigint references public.colaboradores (id),
  add column if not exists planejado_em timestamptz,
  add column if not exists planejado_por uuid,
  add column if not exists iniciado_em timestamptz,
  add column if not exists iniciado_por uuid,
  add column if not exists reposicao_de_id bigint references public.peopleflow_dev_treinamentos (id),
  add column if not exists reposicao_raiz_id bigint references public.peopleflow_dev_treinamentos (id),
  add column if not exists reposicao_numero integer;
update public.peopleflow_dev_treinamentos set tipo = 'outro' where tipo is null;
alter table public.peopleflow_dev_treinamentos alter column tipo set not null;
-- Concluídos anteriores (só existe após um rollback/reaplicação): data de realização pelas datas do próprio treinamento.
update public.peopleflow_dev_treinamentos
set data_realizacao = coalesce(data_fim, data_inicio, concluido_em::date)
where status = 'concluido' and data_realizacao is null;

alter table public.peopleflow_dev_treinamentos alter column status set default 'solicitado';
alter table public.peopleflow_dev_treinamentos
  drop constraint if exists peopleflow_dev_treinamentos_status_check,
  drop constraint if exists peopleflow_dev_trein_status_chk,
  drop constraint if exists peopleflow_dev_trein_tipo_chk,
  drop constraint if exists peopleflow_dev_trein_modalidade_chk,
  drop constraint if exists peopleflow_dev_trein_formato_chk,
  drop constraint if exists peopleflow_dev_trein_documento_chk,
  drop constraint if exists peopleflow_dev_trein_carga_real_chk,
  drop constraint if exists peopleflow_dev_trein_concluido_chk,
  drop constraint if exists peopleflow_dev_trein_reposicao_chk;
alter table public.peopleflow_dev_treinamentos
  add constraint peopleflow_dev_trein_status_chk check (status in ('solicitado', 'planejado', 'em_andamento', 'concluido', 'cancelado')),
  add constraint peopleflow_dev_trein_tipo_chk check (tipo in (
    'novo_pop', 'revisao_pop', 'instrucao_trabalho', 'integracao', 'reciclagem', 'capacitacao_tecnica',
    'desenvolvimento', 'qualidade_regulatorio', 'saude_seguranca', 'sistemas_ferramentas', 'outro')),
  add constraint peopleflow_dev_trein_modalidade_chk check (modalidade in ('interno', 'externo')),
  add constraint peopleflow_dev_trein_formato_chk check (formato is null or formato in ('presencial', 'online', 'hibrido')),
  -- Novo POP / Revisão de POP / Instrução de Trabalho: documento obrigatório a partir do planejamento.
  add constraint peopleflow_dev_trein_documento_chk check (
    tipo not in ('novo_pop', 'revisao_pop', 'instrucao_trabalho') or status in ('solicitado', 'cancelado')
    or (lista_mestra_codigo is not null and lista_mestra_revisao is not null)),
  add constraint peopleflow_dev_trein_carga_real_chk check (carga_realizada_min is null or carga_realizada_min > 0),
  add constraint peopleflow_dev_trein_concluido_chk check (status <> 'concluido' or (data_realizacao is not null and concluido_em is not null)),
  add constraint peopleflow_dev_trein_reposicao_chk check (
    (reposicao_de_id is null and reposicao_raiz_id is null and reposicao_numero is null)
    or (reposicao_de_id is not null and reposicao_raiz_id is not null and reposicao_numero >= 1 and reposicao_de_id <> id and reposicao_raiz_id <> id));
create index if not exists peopleflow_dev_trein_solicitante_idx on public.peopleflow_dev_treinamentos (solicitado_por_colaborador_id);
create index if not exists peopleflow_dev_trein_repos_de_idx on public.peopleflow_dev_treinamentos (reposicao_de_id);
create index if not exists peopleflow_dev_trein_repos_raiz_idx on public.peopleflow_dev_treinamentos (reposicao_raiz_id);
comment on column public.peopleflow_dev_treinamentos.tipo is 'Classificação (Novo POP, Revisão de POP, Instrução de Trabalho, Integração...). Não confundir com modalidade nem formato.';
comment on column public.peopleflow_dev_treinamentos.modalidade is 'interno | externo — escolhida na abertura, nunca inferida.';
comment on column public.peopleflow_dev_treinamentos.formato is 'presencial | online | hibrido.';
comment on column public.peopleflow_dev_treinamentos.reposicao_de_id is 'Treinamento cujos faltantes originaram esta reposição (o original não é reaberto).';

-- ── Participantes: eficácia simples, individual ─────────────────────────
alter table public.peopleflow_dev_participantes
  add column if not exists eficacia_resultado text,
  add column if not exists eficacia_observacao text not null default '',
  add column if not exists eficacia_por uuid,
  add column if not exists eficacia_por_colaborador_id bigint references public.colaboradores (id);
alter table public.peopleflow_dev_participantes
  drop constraint if exists peopleflow_dev_part_eficacia_chk,
  drop constraint if exists peopleflow_dev_participantes_origem_inclusao_check,
  drop constraint if exists peopleflow_dev_part_origem_chk;
alter table public.peopleflow_dev_participantes
  add constraint peopleflow_dev_part_origem_chk check (origem_inclusao in ('manual', 'criterio', 'lnt', 'reposicao'));
alter table public.peopleflow_dev_participantes
  add constraint peopleflow_dev_part_eficacia_chk check (eficacia_resultado is null or eficacia_resultado in ('eficaz', 'parcialmente_eficaz', 'nao_eficaz'));

-- ── Vínculo treinamento × necessidade ───────────────────────────────────
create table if not exists public.peopleflow_dev_treinamento_necessidades (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  necessidade_id bigint not null references public.peopleflow_dev_necessidades (id),
  ativo boolean not null default true,
  vinculado_em timestamptz not null default now(),
  vinculado_por uuid,
  desvinculado_em timestamptz,
  desvinculado_por uuid,
  desvinculado_motivo text,
  check (ativo or desvinculado_em is not null)
);
create unique index if not exists peopleflow_dev_trein_nec_ativo_uidx on public.peopleflow_dev_treinamento_necessidades (treinamento_id, necessidade_id) where ativo;
create index if not exists peopleflow_dev_trein_nec_nec_idx on public.peopleflow_dev_treinamento_necessidades (necessidade_id);

alter table public.peopleflow_dev_necessidades
  add column if not exists atendida_em timestamptz,
  add column if not exists atendida_treinamento_id bigint references public.peopleflow_dev_treinamentos (id);

-- ── QR de presença (somente servidor) ───────────────────────────────────
create table if not exists public.peopleflow_dev_qr_tokens (
  treinamento_id bigint primary key references public.peopleflow_dev_treinamentos (id),
  token text not null unique check (length(token) >= 32),
  ativo boolean not null default true,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  encerrado_em timestamptz,
  encerrado_por uuid
);

-- ── Evidências: mais tipos + observação ─────────────────────────────────
alter table public.peopleflow_dev_evidencias add column if not exists observacao text not null default '';
alter table public.peopleflow_dev_evidencias
  drop constraint if exists peopleflow_dev_evidencias_tipo_check,
  drop constraint if exists peopleflow_dev_evid_tipo_chk;
alter table public.peopleflow_dev_evidencias
  add constraint peopleflow_dev_evid_tipo_chk check (tipo in ('lista_presenca', 'certificado', 'material', 'ata', 'foto', 'comprovante', 'avaliacao', 'outro'));

-- ── Perfil Responsavel (acesso vinculado ao treinamento) ────────────────
alter table public.peopleflow_dev_contas
  drop constraint if exists peopleflow_dev_contas_perfil_check,
  drop constraint if exists peopleflow_dev_contas_perfil_chk;
alter table public.peopleflow_dev_contas
  add constraint peopleflow_dev_contas_perfil_chk check (perfil in ('RH', 'Gestor', 'Responsavel'));

-- Quem conduz (responsável/instrutor) ou solicitou o treinamento.
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

-- Participante: visível para quem vê o colaborador (RH/equipe) OU para quem
-- conduz/solicitou AQUELE treinamento. Não amplia o acesso a outros dados.
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

revoke all on function public.peopleflow_dev_gere_treinamento(bigint) from public, anon;
grant execute on function public.peopleflow_dev_gere_treinamento(bigint) to authenticated, service_role;

-- ── Vínculos: RLS ───────────────────────────────────────────────────────
alter table public.peopleflow_dev_treinamento_necessidades enable row level security;
alter table public.peopleflow_dev_qr_tokens enable row level security;
drop policy if exists dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades;
create policy dev_trein_nec_leitura on public.peopleflow_dev_treinamento_necessidades for select to authenticated
  using (public.peopleflow_dev_treinamento_visivel(treinamento_id) and (select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor'));
-- peopleflow_dev_qr_tokens: RLS ligada e NENHUMA política — só o servidor (service_role) lê/grava.

revoke all on public.peopleflow_dev_treinamento_necessidades from public, anon, authenticated;
grant select on public.peopleflow_dev_treinamento_necessidades to authenticated;
grant all on public.peopleflow_dev_treinamento_necessidades to service_role;
revoke all on public.peopleflow_dev_qr_tokens from public, anon, authenticated;
grant all on public.peopleflow_dev_qr_tokens to service_role;

do $$
declare t text;
begin
  foreach t in array array['peopleflow_dev_treinamento_necessidades', 'peopleflow_dev_qr_tokens'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  end loop;
end $$;

-- ── Histórico ───────────────────────────────────────────────────────────
-- v_historico: SOMENTE realizações válidas (presente em treinamento concluído).
-- É a base da conformidade. Mantém as colunas da Fase 1 (mesmos nomes, "tipo"
-- agora é a classificação) e acrescenta as novas no fim.
create view public.peopleflow_dev_v_historico with (security_invoker = true) as
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
where t.status = 'concluido' and p.presenca_status = 'presente' and p.removido_em is null;

-- v_conformidade: definição idêntica à da Fase 1 (recriada por depender do histórico).
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

-- v_participacoes: toda participação individual (exceto retirados e treinamentos
-- cancelados), distinguindo previsto / realizado / ausente / realizado em
-- reposição. Inscrição prevista NUNCA conta como treinamento concluído.
create view public.peopleflow_dev_v_participacoes with (security_invoker = true) as
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
where p.removido_em is null and t.status <> 'cancelado';

revoke all on public.peopleflow_dev_v_historico, public.peopleflow_dev_v_conformidade, public.peopleflow_dev_v_participacoes from public, anon, authenticated;
grant select on public.peopleflow_dev_v_historico, public.peopleflow_dev_v_conformidade, public.peopleflow_dev_v_participacoes to authenticated;
grant all on public.peopleflow_dev_v_historico, public.peopleflow_dev_v_conformidade, public.peopleflow_dev_v_participacoes to service_role;

-- ── Storage privado do Desenvolvimento ──────────────────────────────────
-- Sem políticas em storage.objects para este bucket: o navegador não lê nem
-- grava diretamente; upload e download só por URL assinada emitida pelo
-- servidor depois de conferir a permissão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'desenvolvimento-evidencias', 'desenvolvimento-evidencias', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword', 'application/vnd.ms-excel']
)
on conflict (id) do nothing;

commit;
