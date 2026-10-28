-- ════════════════════════════════════════════════════════════════════════
-- Reversão: Habilitação de Responsáveis por Treinamentos (supabase/desenvolvimento_habilitacao_responsaveis.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Devolve a função de leitura exatamente à definição anterior (fase 5c) e remove o que a migration criou.
-- Recusa-se (nada é alterado) se já existir transferência de responsabilidade ou ausência com justificativa/encaminhamento/dispensa
-- registrada: são registros de rastreabilidade que o modelo anterior não sabe representar e que nunca são apagados.
-- Habilitações ativas e revogadas voltam para a forma anterior (ativo + dados de revogação), sem perda.
-- ORDEM: se o código novo já estiver publicado, reverta primeiro o código (ele depende destas colunas e tabela).
-- Transacional e repetível.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then
    if exists (select 1 from public.peopleflow_dev_transferencias_responsabilidade) then
      raise exception 'Reversão bloqueada: existem transferências de responsabilidade registradas (histórico não é apagado).';
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_participantes' and column_name = 'ausencia_encaminhamento') then
    if exists (
      select 1 from public.peopleflow_dev_participantes
      where ausencia_justificativa is not null or ausencia_encaminhamento is not null or reposicao_prevista_em is not null
         or dispensado_em is not null or dispensa_justificativa is not null
    ) then
      raise exception 'Reversão bloqueada: existem ausências com justificativa, encaminhamento ou dispensa registrados (histórico não é apagado).';
    end if;
  end if;
end $$;

-- 1. Função de leitura: definição anterior (fase 5c)
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
drop function if exists public.peopleflow_dev_habilitado_agora();

-- 2. Ausências (colunas vazias, conferido acima)
alter table public.peopleflow_dev_participantes
  drop constraint if exists peopleflow_dev_part_ausencia_enc_chk,
  drop constraint if exists peopleflow_dev_part_dispensa_chk,
  drop constraint if exists peopleflow_dev_part_reposicao_data_chk;
alter table public.peopleflow_dev_participantes
  drop column if exists ausencia_justificativa,
  drop column if exists ausencia_encaminhamento,
  drop column if exists reposicao_prevista_em,
  drop column if exists ausencia_atualizada_em,
  drop column if exists ausencia_atualizada_por,
  drop column if exists dispensado_em,
  drop column if exists dispensado_por,
  drop column if exists dispensa_justificativa;

-- 3. Transferências (vazia, conferido acima)
drop table if exists public.peopleflow_dev_transferencias_responsabilidade;

-- 4. Habilitações: de volta ao modelo anterior (ativo + revogação com motivo)
drop trigger if exists peopleflow_dev_responsaveis_gestao_regras on public.peopleflow_dev_responsaveis_gestao;
drop function if exists public.peopleflow_dev_resp_gestao_regras();
drop index if exists public.peopleflow_dev_resp_gestao_uma_habilitacao_uidx;
alter table public.peopleflow_dev_responsaveis_gestao
  drop constraint if exists peopleflow_dev_resp_gestao_situacao_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_ativo_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_habilitada_chk,
  drop constraint if exists peopleflow_dev_resp_gestao_revogada_chk;
alter table public.peopleflow_dev_responsaveis_gestao
  drop column if exists situacao,
  drop column if exists departamento,
  drop column if exists referencia,
  drop column if exists habilitado_em,
  drop column if exists habilitado_por;
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
