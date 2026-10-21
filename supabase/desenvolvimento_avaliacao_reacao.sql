-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Avaliação de Reação dos treinamentos
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos novos peopleflow_dev_*. Nenhum dado existente é alterado.
--
--   1. peopleflow_dev_reacao_config (NOVA, 1 linha): `ativa_desde` = momento em que a migration é aplicada.
--      Só participações confirmadas A PARTIR dessa data são elegíveis — nada é enviado retroativamente.
--   2. peopleflow_dev_avaliacoes_reacao (NOVA): uma resposta por participação (colaborador × treinamento),
--      5 notas de 1 a 5, data e hora, usuário e versão do formulário. Imutável (sem alteração e sem exclusão).
--      Só o servidor lê/grava (RLS ligada, nenhuma política): o colaborador responde pelo servidor, o RH acompanha pelo servidor.
--   3. Guarda de integridade: a resposta só entra para participante PRESENTE, do mesmo treinamento e colaborador,
--      e nunca de treinamento de homologação/teste.
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

-- 2. Avaliações
create table if not exists public.peopleflow_dev_avaliacoes_reacao (
  id bigint generated always as identity primary key,
  participante_id bigint not null references public.peopleflow_dev_participantes (id),
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  colaborador_id bigint not null references public.colaboradores (id),
  versao_formulario smallint not null default 1,
  q1 smallint not null check (q1 between 1 and 5),
  q2 smallint not null check (q2 between 1 and 5),
  q3 smallint not null check (q3 between 1 and 5),
  q4 smallint not null check (q4 between 1 and 5),
  q5 smallint not null check (q5 between 1 and 5),
  respondido_em timestamptz not null default now(),
  respondido_por uuid not null,
  constraint peopleflow_dev_avaliacoes_reacao_uma_por_participacao unique (participante_id)
);
create index if not exists peopleflow_dev_avaliacoes_reacao_trein_idx on public.peopleflow_dev_avaliacoes_reacao (treinamento_id);
create index if not exists peopleflow_dev_avaliacoes_reacao_colab_idx on public.peopleflow_dev_avaliacoes_reacao (colaborador_id);
comment on table public.peopleflow_dev_avaliacoes_reacao is
  'Avaliação de Reação (nível 1): 5 perguntas de 1 a 5, uma por participação. Imutável; só o servidor lê/grava.';
alter table public.peopleflow_dev_avaliacoes_reacao enable row level security;
-- Sem políticas: somente o servidor (service_role) lê/grava.
revoke all on public.peopleflow_dev_avaliacoes_reacao from public, anon, authenticated;
grant all on public.peopleflow_dev_avaliacoes_reacao to service_role;

-- 3. Guarda de integridade na gravação
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

do $$
declare t text := 'peopleflow_dev_avaliacoes_reacao';
begin
  execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_update', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_bloquear_alteracao()', t || '_sem_update', t);
end $$;

commit;
