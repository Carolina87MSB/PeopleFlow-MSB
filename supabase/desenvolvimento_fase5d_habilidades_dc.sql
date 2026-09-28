-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 5d: Habilidades Técnicas na Descrição de Cargo
-- ════════════════════════════════════════════════════════════════════════
-- Objetivo: permitir que uma sugestão de habilidade técnica NOVA (ainda fora
-- do catálogo) seja "Não validada" pelo RH ou retirada pelo Gestor mantendo o
-- registro — hoje a regra de referência só aceita requisito sem item do
-- catálogo enquanto ele está SUGERIDO, então a decisão não pode ser gravada
-- (inativo + motivo). Nada é apagado.
--
-- Estrutura afetada: peopleflow_dev_cargo_requisitos (somente a regra
-- peopleflow_dev_req_referencia_chk). Não altera nenhuma tabela da Descrição
-- de Cargo (peopleflow_descricoes_cargo / _historico), nenhum dado existente
-- e nenhuma outra regra. Todas as linhas atuais continuam válidas (a regra
-- só fica mais permissiva para status 'inativo').
--
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_fase5d_habilidades_dc_rollback.sql
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.peopleflow_dev_cargo_requisitos drop constraint if exists peopleflow_dev_req_referencia_chk;
alter table public.peopleflow_dev_cargo_requisitos
  add constraint peopleflow_dev_req_referencia_chk check (
    (tipo_requisito = 'habilidade' and lista_mestra_codigo is null
      and (habilidade_id is not null or (status in ('sugerido', 'inativo') and coalesce(btrim(descricao_sugerida), '') <> '')))
    or (tipo_requisito = 'treinamento' and habilidade_id is null
      and (lista_mestra_codigo is not null or (status in ('sugerido', 'inativo') and coalesce(btrim(descricao_sugerida), '') <> '')))
  );
comment on constraint peopleflow_dev_req_referencia_chk on public.peopleflow_dev_cargo_requisitos is
  'Requisito vigente sempre referencia o catálogo/Lista Mestra. Sem referência, só como sugestão (descrição preenchida) — pendente (sugerido) ou decidida/retirada (inativo, com motivo).';

commit;
