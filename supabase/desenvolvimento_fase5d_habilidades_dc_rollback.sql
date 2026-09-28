-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5d — REVERSÃO (volta à regra da Fase 2)
-- ════════════════════════════════════════════════════════════════════════
-- A regra original volta como NOT VALID: sugestões já decididas (inativo sem
-- item do catálogo) permanecem gravadas — nada é apagado — e novas gravações
-- voltam a obedecer a regra antiga.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.peopleflow_dev_cargo_requisitos drop constraint if exists peopleflow_dev_req_referencia_chk;
alter table public.peopleflow_dev_cargo_requisitos
  add constraint peopleflow_dev_req_referencia_chk check (
    (tipo_requisito = 'habilidade' and lista_mestra_codigo is null
      and (habilidade_id is not null or (status = 'sugerido' and coalesce(btrim(descricao_sugerida), '') <> '')))
    or (tipo_requisito = 'treinamento' and habilidade_id is null
      and (lista_mestra_codigo is not null or (status = 'sugerido' and coalesce(btrim(descricao_sugerida), '') <> '')))
  ) not valid;

commit;
