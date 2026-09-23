-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 4 — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Volta peopleflow_dev_necessidades ao formato da Fase 2 e remove os objetos
-- criados pela Fase 4. Não toca em nenhum objeto do PeopleFlow (PDI/AVD
-- incluídos), do Portal SST ou do antigo Portal de Treinamentos.
--
-- ATENÇÃO: remove as colunas da Fase 4 e as tabelas de grupos/sugestões
-- dispensadas — os valores nelas se perdem. Com o módulo em uso, faça antes
-- o backup lógico (_fase0_desenvolvimento/scripts/baseline.mjs).
-- Necessidades com status novo (sugerida/validada) são convertidas para o
-- equivalente antigo (aberta) para caber na regra da Fase 1.
-- Rodar em Supabase > SQL Editor > New query.
-- ════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists peopleflow_dev_necessidades_requisito_vigente on public.peopleflow_dev_necessidades;
drop function if exists public.peopleflow_dev_nec_exige_requisito_vigente();

drop index if exists public.peopleflow_dev_nec_dedup_uidx;
drop index if exists public.peopleflow_dev_nec_gestor_idx;
drop index if exists public.peopleflow_dev_nec_grupo_idx;
drop index if exists public.peopleflow_dev_nec_status_idx;
drop index if exists public.peopleflow_dev_nec_pdi_acao_idx;

alter table public.peopleflow_dev_necessidades
  drop constraint if exists peopleflow_dev_nec_status_chk,
  drop constraint if exists peopleflow_dev_nec_origem_chk,
  drop constraint if exists peopleflow_dev_nec_justificativa_chk,
  drop constraint if exists peopleflow_dev_nec_categoria_chk,
  drop constraint if exists peopleflow_dev_nec_validada_chk;

update public.peopleflow_dev_necessidades set status = 'aberta' where status in ('sugerida', 'validada');
update public.peopleflow_dev_necessidades set origem = 'rh' where origem = 'operacional';

alter table public.peopleflow_dev_necessidades
  drop column if exists categoria,
  drop column if exists sugestao_capacitacao,
  drop column if exists observacao,
  drop column if exists gestor_colaborador_id,
  drop column if exists departamento,
  drop column if exists pdi_acao_id,
  drop column if exists grupo_id,
  drop column if exists validada_em,
  drop column if exists validada_por;

alter table public.peopleflow_dev_necessidades alter column status set default 'aberta';
alter table public.peopleflow_dev_necessidades
  add constraint peopleflow_dev_necessidades_status_check check (status in ('aberta', 'planejada', 'atendida', 'cancelada')) not valid,
  add constraint peopleflow_dev_necessidades_origem_check check (origem in ('habilidade', 'treinamento_obrigatorio', 'revisao_pop', 'integracao', 'gestor', 'pdi', 'rh')) not valid,
  add constraint peopleflow_dev_necessidades_check4 check (origem not in ('gestor', 'rh') or btrim(justificativa) <> '') not valid;

create unique index if not exists peopleflow_dev_nec_dedup_uidx on public.peopleflow_dev_necessidades (
  origem, coalesce(colaborador_id, -1), coalesce(cargo_nome, ''), coalesce(requisito_id, -1),
  coalesce(pdi_item_id, ''), coalesce(lista_mestra_codigo, ''), coalesce(lista_mestra_revisao, '')
) where status in ('aberta', 'planejada') and origem not in ('gestor', 'rh');

drop table if exists public.peopleflow_dev_pdi_sugestoes_dispensadas;
drop table if exists public.peopleflow_dev_necessidade_grupos;

commit;
