-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 2 — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Desfaz SOMENTE o que desenvolvimento_fase2.sql fez nas tabelas
-- peopleflow_dev_*, voltando-as ao estado da Fase 1. Não toca em nenhum
-- objeto existente do PeopleFlow, do Portal SST ou do antigo Portal de
-- Treinamentos.
--
-- ATENÇÃO: remove as colunas criadas na Fase 2 (observações, categoria,
-- origem, autor da sugestão etc.) — os valores gravados nelas se perdem.
-- Antes de rodar com o módulo em uso, faça backup lógico das tabelas
-- peopleflow_dev_* (_fase0_desenvolvimento/scripts/baseline.mjs).
-- A regra original da Fase 1 volta como NOT VALID: não é reaplicada a
-- linhas já existentes (sugestões sem item de catálogo), só a novas.
-- Rodar em Supabase > SQL Editor > New query.
-- ════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos;
create policy dev_requisitos_leitura on public.peopleflow_dev_cargo_requisitos for select to authenticated
  using ((select public.peopleflow_dev_meu_perfil()) is not null);

drop function if exists public.peopleflow_dev_cargo_no_escopo(text);

drop index if exists public.peopleflow_dev_req_sugerido_por_idx;
alter table public.peopleflow_dev_cargo_requisitos
  drop constraint if exists peopleflow_dev_req_origem_chk,
  drop constraint if exists peopleflow_dev_req_referencia_chk,
  drop constraint if exists peopleflow_dev_req_vigente_chk,
  drop constraint if exists peopleflow_dev_req_sugestao_gestor_chk,
  drop constraint if exists peopleflow_dev_req_inativo_chk;

alter table public.peopleflow_dev_cargo_requisitos
  drop column if exists observacao,
  drop column if exists origem,
  drop column if exists descricao_sugerida,
  drop column if exists sugerido_por_colaborador_id,
  drop column if exists status_motivo;

alter table public.peopleflow_dev_cargo_requisitos
  drop constraint if exists peopleflow_dev_cargo_requisitos_check;
alter table public.peopleflow_dev_cargo_requisitos
  add constraint peopleflow_dev_cargo_requisitos_check check (
    (tipo_requisito = 'habilidade' and habilidade_id is not null and lista_mestra_codigo is null)
    or (tipo_requisito = 'treinamento' and lista_mestra_codigo is not null and habilidade_id is null)
  ) not valid;

drop index if exists public.peopleflow_dev_habilidades_filtro_idx;
drop index if exists public.peopleflow_dev_habilidades_nome_norm_uidx;
alter table public.peopleflow_dev_habilidades
  drop column if exists categoria,
  drop column if exists nome_normalizado;

alter table public.peopleflow_dev_lista_mestra_revisoes drop column if exists observacao;
alter table public.peopleflow_dev_lista_mestra drop column if exists observacao;

commit;
