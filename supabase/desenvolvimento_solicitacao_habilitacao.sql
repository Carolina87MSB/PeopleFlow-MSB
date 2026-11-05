-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Gestor autorizado automaticamente + solicitação de habilitação (aprovada pelo RH)
-- ════════════════════════════════════════════════════════════════════════
-- PROPOSTA — NÃO EXECUTADA EM PRODUÇÃO. Só rodar com autorização expressa, ANTES de publicar o código correspondente.
-- Compatível com o código hoje publicado: ele ignora a tabela nova, e a função de leitura só ENXERGA um pouco mais para o Gestor.
-- Altera SOMENTE objetos peopleflow_dev_*. Nenhum dado de treinamento, presença, avaliação, evidência ou habilitação é alterado.
--
-- Regras de negócio (decisão de 2026-11):
--   • Todo Gestor (perfil do PeopleFlow, escopo de liderança cadastrado) está AUTORIZADO a registrar e administrar os treinamentos
--     da sua área, sem habilitação individual: os que ele ou alguém do seu escopo registrou, e os que têm o responsável principal
--     no seu escopo (mesmo registrados pelo RH). Isso é aplicado no servidor; aqui o banco passa a LER esses treinamentos.
--   • O Gestor SOLICITA a habilitação de um colaborador da sua equipe (com justificativa); o RH aprova ou rejeita no portal.
--     A habilitação só vale depois da aprovação. Uma solicitação pendente por colaborador.
--
-- O que esta migration faz:
--   1. peopleflow_dev_habilitacao_solicitacoes (NOVA): solicitante, colaborador, área, justificativa, situação
--      (pendente | aprovada | rejeitada), quem decidiu/quando/justificativa, habilitação gerada. Identidade imutável,
--      transição única pendente → decidida, sem exclusão; RH lê tudo, o Gestor lê as próprias; o navegador não grava.
--   2. peopleflow_dev_gere_treinamento: para o Gestor, passa a incluir os treinamentos cujo RESPONSÁVEL PRINCIPAL está no seu
--      escopo (antes: só os registrados por ele ou pelo seu escopo). RH e Responsavel: sem mudança.
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Pré-checagem (somente leitura): supabase/desenvolvimento_solicitacao_habilitacao_prechecagem.sql
-- Validação  (somente leitura): supabase/desenvolvimento_solicitacao_habilitacao_validacao.sql
-- Reversão: supabase/desenvolvimento_solicitacao_habilitacao_rollback.sql (recusa-se se já houver solicitação registrada)
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is null then
    raise exception 'Aplique antes supabase/desenvolvimento_habilitacao_responsaveis.sql (modelo de habilitação).';
  end if;
end $$;

-- ── 1. Solicitações de habilitação ───────────────────────────────────────
create table if not exists public.peopleflow_dev_habilitacao_solicitacoes (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  solicitante_colaborador_id bigint not null references public.colaboradores (id),
  departamento text,
  justificativa text not null check (btrim(justificativa) <> ''),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  solicitado_em timestamptz not null default now(),
  solicitado_por uuid,
  decidido_em timestamptz,
  decidido_por uuid,
  decisor_colaborador_id bigint references public.colaboradores (id),
  decisao_justificativa text,
  habilitacao_id bigint references public.peopleflow_dev_responsaveis_gestao (id),
  check (colaborador_id <> solicitante_colaborador_id),
  check (
    (status = 'pendente' and decidido_em is null and decidido_por is null and decisor_colaborador_id is null and decisao_justificativa is null and habilitacao_id is null)
    or (status = 'aprovada' and decidido_em is not null and decidido_por is not null and habilitacao_id is not null)
    or (status = 'rejeitada' and decidido_em is not null and decidido_por is not null and habilitacao_id is null and coalesce(btrim(decisao_justificativa), '') <> '')
  )
);
create unique index if not exists peopleflow_dev_hab_solic_uma_pendente_uidx
  on public.peopleflow_dev_habilitacao_solicitacoes (colaborador_id) where status = 'pendente';
create index if not exists peopleflow_dev_hab_solic_solicitante_idx on public.peopleflow_dev_habilitacao_solicitacoes (solicitante_colaborador_id);
create index if not exists peopleflow_dev_hab_solic_status_idx on public.peopleflow_dev_habilitacao_solicitacoes (status, solicitado_em desc);
comment on table public.peopleflow_dev_habilitacao_solicitacoes is
  'Solicitação do Gestor para habilitar um colaborador da sua equipe a administrar treinamentos. Pendente até a decisão do RH; só a aprovação cria a habilitação. Imutável depois de decidida.';

create or replace function public.peopleflow_dev_hab_solic_regras()
returns trigger language plpgsql as $$
begin
  if new.colaborador_id is distinct from old.colaborador_id
     or new.solicitante_colaborador_id is distinct from old.solicitante_colaborador_id
     or new.departamento is distinct from old.departamento
     or new.justificativa is distinct from old.justificativa
     or new.solicitado_em is distinct from old.solicitado_em
     or new.solicitado_por is distinct from old.solicitado_por then
    raise exception 'A identidade da solicitação (colaborador, solicitante, área, justificativa, data e autor) não pode ser alterada.';
  end if;
  if old.status <> 'pendente' then
    raise exception 'Solicitação já decidida é um registro histórico e não pode ser alterada.';
  end if;
  if new.status = old.status then
    raise exception 'Solicitação pendente só pode ser decidida (aprovada ou rejeitada).';
  end if;
  return new;
end $$;
revoke all on function public.peopleflow_dev_hab_solic_regras() from public, anon, authenticated;

do $$
declare t text := 'peopleflow_dev_habilitacao_solicitacoes';
begin
  execute format('drop trigger if exists %I on public.%I', t || '_regras', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_hab_solic_regras()', t || '_regras', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
end $$;

alter table public.peopleflow_dev_habilitacao_solicitacoes enable row level security;
drop policy if exists dev_hab_solic_leitura on public.peopleflow_dev_habilitacao_solicitacoes;
create policy dev_hab_solic_leitura on public.peopleflow_dev_habilitacao_solicitacoes for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH'
         or solicitante_colaborador_id = (select public.peopleflow_dev_meu_colaborador_id()));
revoke all on public.peopleflow_dev_habilitacao_solicitacoes from public, anon, authenticated;
grant select on public.peopleflow_dev_habilitacao_solicitacoes to authenticated;
grant all on public.peopleflow_dev_habilitacao_solicitacoes to service_role;

-- ── 2. Leitura: o Gestor também lê os treinamentos cujo responsável principal está no seu escopo ──
create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
      select 1 from public.peopleflow_dev_treinamentos t
      where t.id = p_treinamento_id
        and public.peopleflow_dev_meu_colaborador_id() is not null
        and (t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
             or exists (select 1 from public.peopleflow_dev_escopo e
                        where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
                          and e.colaborador_id in (t.solicitado_por_colaborador_id, t.responsavel_colaborador_id))))
    when 'Responsavel' then public.peopleflow_dev_habilitado_agora() and public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;
revoke all on function public.peopleflow_dev_gere_treinamento(bigint) from public, anon;
grant execute on function public.peopleflow_dev_gere_treinamento(bigint) to authenticated, service_role;

-- Atualiza o cache da API (PostgREST).
notify pgrst, 'reload schema';

commit;
