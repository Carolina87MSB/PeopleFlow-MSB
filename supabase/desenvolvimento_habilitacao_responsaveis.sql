-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Habilitação de Responsáveis por Treinamentos, transferências e ausências
-- ════════════════════════════════════════════════════════════════════════
-- PROPOSTA — NÃO EXECUTADA EM PRODUÇÃO. Só rodar com autorização expressa, junto com a publicação do código correspondente
-- (ver docs/habilitacao-responsaveis-publicacao.md). Compatível com o código hoje publicado: aplicada ANTES do novo código,
-- o que está no ar continua funcionando.
-- Altera SOMENTE objetos peopleflow_dev_*. Nenhum dado de treinamento, presença, avaliação ou evidência é alterado.
--
-- Regras de negócio (decisões de 2026-10):
--   • As lideranças informam o RH por e-mail; o RH HABILITA e REVOGA diretamente pelo portal. A habilitação é permanente
--     (até revogar), vinculada à área/gestão do colaborador, sem aprovação por treinamento e sem acesso a outros módulos.
--   • Responsável e instrutor internos HABILITADOS administram o treinamento a que estão vinculados — e só ele.
--   • O RH transfere a responsabilidade de treinamentos pendentes (revogação, desligamento, mudança), com histórico imutável.
--   • A sessão pode ser concluída com ausentes justificados e encaminhados; a pendência individual segue aberta.
--
-- O que esta migration faz:
--   1. peopleflow_dev_responsaveis_gestao = HABILITAÇÕES: situação (habilitada | revogada), área na habilitação, referência
--      (e-mail da liderança), quem/quando habilitou. `ativo` continua existindo e passa a ser derivado (ativo = 'habilitada');
--      uma habilitação ativa por colaborador. Revogação com motivo; registros nunca são apagados.
--   2. peopleflow_dev_transferencias_responsabilidade (NOVA): histórico imutável (só o RH lê).
--   3. peopleflow_dev_participantes: justificativa da ausência, encaminhamento (reposição | dispensa), data prevista da
--      reposição e dispensa autorizada pelo RH — colunas NOVAS, vazias para todos os registros existentes.
--   4. Leitura (RLS): o perfil Responsavel (habilitado) lê SOMENTE os treinamentos em que é responsável ou instrutor, e só
--      enquanto a habilitação estiver ativa — não mais a gestão inteira. RH e Gestor: sem perda de leitura de participantes.
--   5. Leitura de evidências da TURMA (lista de presença, ata, materiais): o Gestor que acompanha um treinamento de OUTRA área
--      só porque liderados seus participam passa a ver apenas as evidências individuais dos seus liderados; as da turma
--      ficam com RH, quem administra e a gestão que registrou o treinamento (o servidor aplica a mesma regra ao abrir o arquivo).
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Pré-checagem (somente leitura): supabase/desenvolvimento_habilitacao_responsaveis_prechecagem.sql
-- Validação  (somente leitura): supabase/desenvolvimento_habilitacao_responsaveis_validacao.sql
-- Reversão: supabase/desenvolvimento_habilitacao_responsaveis_rollback.sql (recusa-se se já houver transferência ou ausência encaminhada)
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_responsaveis_gestao') is null then
    raise exception 'Aplique antes supabase/desenvolvimento_fase5c_registro.sql (tabela peopleflow_dev_responsaveis_gestao ausente).';
  end if;
  if exists (select 1 from public.peopleflow_dev_responsaveis_gestao where ativo group by colaborador_id having count(*) > 1) then
    raise exception 'Há colaborador com mais de uma habilitação ativa em peopleflow_dev_responsaveis_gestao. Revogue as duplicadas (com motivo) antes de aplicar.';
  end if;
end $$;

-- ── 1. Habilitações ──────────────────────────────────────────────────────
alter table public.peopleflow_dev_responsaveis_gestao
  add column if not exists situacao text,
  add column if not exists departamento text,
  add column if not exists referencia text,
  add column if not exists habilitado_em timestamptz,
  add column if not exists habilitado_por uuid;

-- Linhas anteriores (hoje: nenhuma em produção): a indicação do Gestor valia na hora → habilitada; as revogadas → revogada.
update public.peopleflow_dev_responsaveis_gestao
set situacao = case when ativo then 'habilitada' else 'revogada' end,
    habilitado_em = coalesce(habilitado_em, indicado_em),
    habilitado_por = coalesce(habilitado_por, indicado_por)
where situacao is null;

alter table public.peopleflow_dev_responsaveis_gestao
  alter column situacao set default 'habilitada',
  alter column situacao set not null;

-- A constraint antiga (ativo OU revogada com motivo) é substituída pelas verificações por situação.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.peopleflow_dev_responsaveis_gestao'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%revogado_motivo%'
      and conname not like 'peopleflow_dev_resp_gestao_%_chk'
  loop
    execute format('alter table public.peopleflow_dev_responsaveis_gestao drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.peopleflow_dev_responsaveis_gestao
  drop constraint if exists peopleflow_dev_resp_gestao_situacao_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_ativo_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_habilitada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_revogada_chk;
alter table public.peopleflow_dev_responsaveis_gestao
  add constraint peopleflow_dev_resp_gestao_situacao_chk check (situacao in ('habilitada', 'revogada')),
  add constraint peopleflow_dev_resp_gestao_ativo_chk check (ativo = (situacao = 'habilitada')),
  add constraint peopleflow_dev_resp_gestao_habilitada_chk check (situacao <> 'habilitada' or habilitado_em is not null),
  add constraint peopleflow_dev_resp_gestao_revogada_chk check (situacao <> 'revogada' or (revogado_em is not null and coalesce(btrim(revogado_motivo), '') <> ''));

-- Uma habilitação ativa por colaborador (vinculada a UMA gestão).
create unique index if not exists peopleflow_dev_resp_gestao_uma_habilitacao_uidx
  on public.peopleflow_dev_responsaveis_gestao (colaborador_id) where situacao = 'habilitada';

-- Regras de transição e compatibilidade com o código atual (que só grava `ativo`).
create or replace function public.peopleflow_dev_resp_gestao_regras()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao = 'habilitada' then
      new.habilitado_em := coalesce(new.habilitado_em, new.indicado_em, now());
      new.habilitado_por := coalesce(new.habilitado_por, new.indicado_por);
    end if;
    new.ativo := (new.situacao = 'habilitada');
    return new;
  end if;

  -- UPDATE: a identidade da habilitação nunca muda
  if new.colaborador_id is distinct from old.colaborador_id
     or new.gestor_colaborador_id is distinct from old.gestor_colaborador_id
     or new.indicado_em is distinct from old.indicado_em
     or new.indicado_por is distinct from old.indicado_por
     or new.habilitado_em is distinct from old.habilitado_em
     or new.habilitado_por is distinct from old.habilitado_por then
    raise exception 'A identidade da habilitação (colaborador, gestão, data e autor da habilitação) não pode ser alterada.';
  end if;
  -- código anterior: revogar = ativo false + motivo → situação 'revogada'
  if old.situacao = 'habilitada' and new.situacao = old.situacao and old.ativo and not new.ativo then
    new.situacao := 'revogada';
  end if;
  if new.situacao is distinct from old.situacao then
    if not (old.situacao = 'habilitada' and new.situacao = 'revogada') then
      raise exception 'Transição de situação inválida: % → %.', old.situacao, new.situacao;
    end if;
  elsif old.situacao = 'revogada' and new is distinct from old then
    raise exception 'Habilitação revogada é um registro histórico e não pode ser alterada.';
  end if;
  new.ativo := (new.situacao = 'habilitada');
  return new;
end $$;

drop trigger if exists peopleflow_dev_responsaveis_gestao_regras on public.peopleflow_dev_responsaveis_gestao;
create trigger peopleflow_dev_responsaveis_gestao_regras before insert or update on public.peopleflow_dev_responsaveis_gestao
  for each row execute function public.peopleflow_dev_resp_gestao_regras();
revoke all on function public.peopleflow_dev_resp_gestao_regras() from public, anon, authenticated;

comment on column public.peopleflow_dev_responsaveis_gestao.situacao is
  'habilitada (concedida pelo RH; vale até revogar) | revogada (com motivo). ativo = situação habilitada.';
comment on column public.peopleflow_dev_responsaveis_gestao.gestor_colaborador_id is
  'Gestão/área à qual a habilitação está vinculada (liderança que informou o RH).';
comment on column public.peopleflow_dev_responsaveis_gestao.departamento is
  'Área do colaborador no momento da habilitação (fotografia para rastreabilidade).';
comment on column public.peopleflow_dev_responsaveis_gestao.referencia is
  'Referência da solicitação da liderança (ex.: e-mail recebido pelo RH, com a data).';

-- ── 2. Transferências de responsabilidade (histórico imutável) ───────────
create table if not exists public.peopleflow_dev_transferencias_responsabilidade (
  id bigint generated always as identity primary key,
  treinamento_id bigint not null references public.peopleflow_dev_treinamentos (id),
  de_colaborador_id bigint references public.colaboradores (id),
  para_colaborador_id bigint not null references public.colaboradores (id),
  motivo_tipo text not null check (motivo_tipo in ('revogacao', 'desligamento', 'mudanca_responsabilidade', 'outro')),
  motivo text not null check (btrim(motivo) <> ''),
  habilitacao_id bigint references public.peopleflow_dev_responsaveis_gestao (id),
  status_treinamento text not null,
  transferido_em timestamptz not null default now(),
  transferido_por uuid,
  transferido_por_colaborador_id bigint references public.colaboradores (id),
  check (de_colaborador_id is distinct from para_colaborador_id)
);
create index if not exists peopleflow_dev_transf_resp_trein_idx on public.peopleflow_dev_transferencias_responsabilidade (treinamento_id);
create index if not exists peopleflow_dev_transf_resp_de_idx on public.peopleflow_dev_transferencias_responsabilidade (de_colaborador_id);
comment on table public.peopleflow_dev_transferencias_responsabilidade is
  'Transferência do responsável por um treinamento pelo RH (revogação, desligamento, mudança de responsabilidade). Imutável; quem registrou o treinamento continua em solicitado_por_colaborador_id.';

alter table public.peopleflow_dev_transferencias_responsabilidade enable row level security;
drop policy if exists dev_transf_resp_rh on public.peopleflow_dev_transferencias_responsabilidade;
create policy dev_transf_resp_rh on public.peopleflow_dev_transferencias_responsabilidade for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) = 'RH');
revoke all on public.peopleflow_dev_transferencias_responsabilidade from public, anon, authenticated;
grant select on public.peopleflow_dev_transferencias_responsabilidade to authenticated;
grant all on public.peopleflow_dev_transferencias_responsabilidade to service_role;

do $$
declare t text := 'peopleflow_dev_transferencias_responsabilidade';
begin
  execute format('drop trigger if exists %I on public.%I', t || '_sem_delete', t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_delete', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_truncate', t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.peopleflow_dev_bloquear_exclusao()', t || '_sem_truncate', t);
  execute format('drop trigger if exists %I on public.%I', t || '_sem_update', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.peopleflow_dev_bloquear_alteracao()', t || '_sem_update', t);
end $$;

-- ── 3. Ausências: justificativa, encaminhamento e dispensa (a pendência individual segue aberta) ──
alter table public.peopleflow_dev_participantes
  add column if not exists ausencia_justificativa text,
  add column if not exists ausencia_encaminhamento text,
  add column if not exists reposicao_prevista_em date,
  add column if not exists ausencia_atualizada_em timestamptz,
  add column if not exists ausencia_atualizada_por uuid,
  add column if not exists dispensado_em timestamptz,
  add column if not exists dispensado_por uuid,
  add column if not exists dispensa_justificativa text;
alter table public.peopleflow_dev_participantes
  drop constraint if exists peopleflow_dev_part_ausencia_enc_chk,
  drop constraint if exists peopleflow_dev_part_dispensa_chk,
  drop constraint if exists peopleflow_dev_part_reposicao_data_chk;
alter table public.peopleflow_dev_participantes
  add constraint peopleflow_dev_part_ausencia_enc_chk check (ausencia_encaminhamento is null or ausencia_encaminhamento in ('reposicao', 'dispensa')),
  add constraint peopleflow_dev_part_dispensa_chk check (ausencia_encaminhamento is distinct from 'dispensa' or (dispensado_em is not null and coalesce(btrim(dispensa_justificativa), '') <> '')),
  add constraint peopleflow_dev_part_reposicao_data_chk check (reposicao_prevista_em is null or coalesce(ausencia_encaminhamento, '') = 'reposicao');
comment on column public.peopleflow_dev_participantes.ausencia_justificativa is
  'Justificativa da ausência (não registrar dados de saúde: usar "afastamento/licença"). Não encerra a pendência individual.';
comment on column public.peopleflow_dev_participantes.ausencia_encaminhamento is
  'reposicao (haverá reposição; data prevista opcional) | dispensa (autorizada pelo RH, com justificativa). Sem encaminhamento a sessão não conclui.';

-- ── 4. Leitura: o perfil Responsavel enxerga SÓ o que é seu e enquanto habilitado ──
create or replace function public.peopleflow_dev_habilitado_agora()
returns boolean language sql stable security definer set search_path = public as $$
  select public.peopleflow_dev_meu_colaborador_id() is not null and exists (
    select 1 from public.peopleflow_dev_responsaveis_gestao r
    where r.colaborador_id = public.peopleflow_dev_meu_colaborador_id() and r.situacao = 'habilitada')
$$;

-- "Gere o treinamento": RH; Gestor = acompanha a sua gestão (como antes); Responsavel = só o que está sob a sua
-- responsabilidade (responsável ou instrutor) e enquanto a habilitação estiver ativa.
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
                          and e.colaborador_id = t.solicitado_por_colaborador_id)))
    when 'Responsavel' then public.peopleflow_dev_habilitado_agora() and public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;

do $$
declare f text;
begin
  foreach f in array array['peopleflow_dev_habilitado_agora()', 'peopleflow_dev_gere_treinamento(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ── 5. Evidências da turma: não vazam para a liderança de outra área ─────
-- Antes: quem via o treinamento (inclusive o Gestor com um liderado na turma) via as evidências sem participante (lista de presença
-- com TODOS os nomes, ata, materiais). Agora: evidência individual → como antes; evidência da turma → RH, Responsavel do treinamento
-- ou quem "gere" o treinamento (gestão que o registrou).
drop policy if exists dev_evidencias_leitura on public.peopleflow_dev_evidencias;
create policy dev_evidencias_leitura on public.peopleflow_dev_evidencias for select to authenticated
  using (
    public.peopleflow_dev_treinamento_visivel(treinamento_id)
    and (
      case when participante_id is not null
        then public.peopleflow_dev_participante_visivel(participante_id)
        else (select public.peopleflow_dev_meu_perfil()) in ('RH', 'Responsavel') or public.peopleflow_dev_gere_treinamento(treinamento_id)
      end
    )
  );

-- Atualiza o cache da API (PostgREST).
notify pgrst, 'reload schema';

commit;
