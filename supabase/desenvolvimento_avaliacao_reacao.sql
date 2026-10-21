-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Avaliação de Reação dos treinamentos
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos novos peopleflow_dev_*. Nenhum dado existente é alterado.
--
--   1. peopleflow_dev_reacao_config (NOVA, 1 linha): `ativa_desde` = momento em que a migration é aplicada.
--      Só participações confirmadas A PARTIR dessa data são elegíveis — nada é enviado retroativamente.
--   2. peopleflow_dev_avaliacoes_reacao (NOVA) = CONTROLE DE ADESÃO: quem respondeu, quando, com a presença e o prazo
--      (7 dias corridos após a confirmação) registrados no momento da resposta. NÃO guarda notas.
--   3. peopleflow_dev_reacao_respostas (NOVA) = NOTAS: as 5 notas (1 a 5) por treinamento, SEM colaborador, SEM participação e
--      SEM data/hora. Não há como ligar uma nota a uma pessoa nem por consulta direta ao banco.
--   4. peopleflow_dev_reacao_registrar() grava (2) e (3) na MESMA transação (ou nenhuma). Só o servidor a executa.
--   5. Ambas imutáveis (sem alteração e sem exclusão) e sem políticas de acesso: só o servidor lê/grava.
--   6. Guarda de integridade: a resposta só entra para participante PRESENTE, do mesmo treinamento e colaborador, e nunca de
--      treinamento de homologação/teste.
--
-- A elegibilidade NÃO depende do método de presença (QR, manual, ou um futuro "gravação"): basta a presença estar "presente".
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_avaliacao_reacao_rollback.sql (recusa-se se já houver avaliações respondidas).
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1. Configuração (uma linha)
create table if not exists public.peopleflow_dev_reacao_config (
  id smallint primary key default 1 check (id = 1),
  ativa_desde timestamptz not null default now(),
  versao_formulario smallint not null default 1
);
insert into public.peopleflow_dev_reacao_config (id) values (1) on conflict (id) do nothing;
comment on table public.peopleflow_dev_reacao_config is
  'Ativação da Avaliação de Reação: participações confirmadas antes de ativa_desde não são elegíveis (sem envio retroativo).';
alter table public.peopleflow_dev_reacao_config enable row level security;
revoke all on public.peopleflow_dev_reacao_config from public, anon, authenticated;
grant all on public.peopleflow_dev_reacao_config to service_role;

-- 2. Controle de adesão (quem respondeu; sem notas)
create table if not exists public.peopleflow_dev_avaliacoes_reacao (
  id bigint generated always as identity primary key,
  participante_id bigint not null references public.peopleflow_dev_participantes (id),
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  colaborador_id bigint not null references public.colaboradores (id),
  versao_formulario smallint not null default 1,
  presenca_em timestamptz not null,
  prazo_em timestamptz not null,
  respondido_em timestamptz not null default now(),
  respondido_por uuid not null,
  constraint peopleflow_dev_avaliacoes_reacao_uma_por_participacao unique (participante_id)
);
create index if not exists peopleflow_dev_avaliacoes_reacao_trein_idx on public.peopleflow_dev_avaliacoes_reacao (treinamento_id);
create index if not exists peopleflow_dev_avaliacoes_reacao_colab_idx on public.peopleflow_dev_avaliacoes_reacao (colaborador_id);
comment on table public.peopleflow_dev_avaliacoes_reacao is
  'Avaliação de Reação — controle de adesão (quem respondeu, quando, prazo). Não contém notas. Imutável; só o servidor lê/grava.';
alter table public.peopleflow_dev_avaliacoes_reacao enable row level security;
revoke all on public.peopleflow_dev_avaliacoes_reacao from public, anon, authenticated;
grant all on public.peopleflow_dev_avaliacoes_reacao to service_role;

-- 3. Notas (anônimas: só treinamento e as 5 notas)
create table if not exists public.peopleflow_dev_reacao_respostas (
  id uuid primary key default gen_random_uuid(),
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  versao_formulario smallint not null default 1,
  q1 smallint not null check (q1 between 1 and 5),
  q2 smallint not null check (q2 between 1 and 5),
  q3 smallint not null check (q3 between 1 and 5),
  q4 smallint not null check (q4 between 1 and 5),
  q5 smallint not null check (q5 between 1 and 5)
);
create index if not exists peopleflow_dev_reacao_respostas_trein_idx on public.peopleflow_dev_reacao_respostas (treinamento_id);
comment on table public.peopleflow_dev_reacao_respostas is
  'Avaliação de Reação — notas consolidáveis, SEM identificação (nem colaborador, nem participação, nem data/hora). Imutável; só o servidor lê/grava.';
alter table public.peopleflow_dev_reacao_respostas enable row level security;
revoke all on public.peopleflow_dev_reacao_respostas from public, anon, authenticated;
grant all on public.peopleflow_dev_reacao_respostas to service_role;

-- 4. Guarda de integridade na gravação do controle de adesão
create or replace function public.peopleflow_dev_reacao_valida()
returns trigger language plpgsql set search_path = public as $$
declare p record; t record;
begin
  select treinamento_id, colaborador_id, presenca_status, removido_em into p from public.peopleflow_dev_participantes where id = new.participante_id;
  if not found or p.treinamento_id <> new.treinamento_id or p.colaborador_id <> new.colaborador_id then
    raise exception 'Avaliação de reação: participação não confere com o treinamento e o colaborador.' using errcode = 'P0001';
  end if;
  if p.removido_em is not null or p.presenca_status <> 'presente' then
    raise exception 'Avaliação de reação: só quem participou (presença confirmada) avalia.' using errcode = 'P0001';
  end if;
  select homologacao, status into t from public.peopleflow_dev_treinamentos where id = new.treinamento_id;
  if t.homologacao then
    raise exception 'Avaliação de reação: treinamento de homologação/teste não é avaliado.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists peopleflow_dev_avaliacoes_reacao_valida on public.peopleflow_dev_avaliacoes_reacao;
create trigger peopleflow_dev_avaliacoes_reacao_valida before insert on public.peopleflow_dev_avaliacoes_reacao
  for each row execute function public.peopleflow_dev_reacao_valida();

-- 5. Gravação atômica: adesão (com identificação) + notas (sem identificação) na mesma transação
create or replace function public.peopleflow_dev_reacao_registrar(
  p_participante_id bigint, p_treinamento_id bigint, p_colaborador_id bigint, p_usuario uuid, p_versao smallint,
  p_presenca_em timestamptz, p_prazo_em timestamptz,
  p_q1 smallint, p_q2 smallint, p_q3 smallint, p_q4 smallint, p_q5 smallint
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_em timestamptz;
begin
  insert into public.peopleflow_dev_avaliacoes_reacao (participante_id, treinamento_id, colaborador_id, versao_formulario, presenca_em, prazo_em, respondido_por)
    values (p_participante_id, p_treinamento_id, p_colaborador_id, p_versao, p_presenca_em, p_prazo_em, p_usuario)
    returning respondido_em into v_em;
  insert into public.peopleflow_dev_reacao_respostas (treinamento_id, versao_formulario, q1, q2, q3, q4, q5)
    values (p_treinamento_id, p_versao, p_q1, p_q2, p_q3, p_q4, p_q5);
  return v_em;
end $$;
revoke all on function public.peopleflow_dev_reacao_registrar(bigint, bigint, bigint, uuid, smallint, timestamptz, timestamptz, smallint, smallint, smallint, smallint, smallint) from public, anon, authenticated;
grant execute on function public.peopleflow_dev_reacao_registrar(bigint, bigint, bigint, uuid, smallint, timestamptz, timestamptz, smallint, smallint, smallint, smallint, smallint) to service_role;

-- 6. Imutabilidade (sem alteração e sem exclusão) nas duas tabelas
do $$
declare t text;
begin
  foreach t in array array['peopleflow_dev_avaliacoes_reacao', 'peopleflow_dev_reacao_respostas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sem_update', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_bloquear_alteracao()', t || '_sem_update', t);
  end loop;
end $$;

-- Atualiza o cache da API (PostgREST) para enxergar a função e as tabelas novas imediatamente.
notify pgrst, 'reload schema';

commit;
