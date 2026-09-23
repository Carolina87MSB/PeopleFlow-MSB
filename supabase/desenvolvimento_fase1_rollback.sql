-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 1 — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Remove SOMENTE os objetos criados por desenvolvimento_fase1.sql
-- (prefixo peopleflow_dev_*). Não toca em nenhum objeto existente do
-- PeopleFlow, do Portal SST ou do antigo Portal de Treinamentos.
--
-- Sem CASCADE de propósito: se algum objeto inesperado depender destas
-- tabelas, o comando falha e nada é removido (a transação é desfeita).
--
-- ATENÇÃO: apaga os dados gravados nas tabelas do módulo. Antes de rodar em
-- produção com o módulo em uso, exporte essas tabelas (backup lógico).
-- Rodar em Supabase > SQL Editor > New query. Depois:
--   node _fase0_desenvolvimento/scripts/comparar.mjs
-- deve mostrar "Nenhuma diferença" nas estruturas existentes.
-- ════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.peopleflow_dev_v_conformidade;
drop view if exists public.peopleflow_dev_v_historico;

drop table if exists public.peopleflow_dev_evidencias;
drop table if exists public.peopleflow_dev_participantes;
drop table if exists public.peopleflow_dev_necessidades;
drop table if exists public.peopleflow_dev_treinamento_habilidades;
drop table if exists public.peopleflow_dev_treinamentos;
drop table if exists public.peopleflow_dev_cargo_requisitos;
drop table if exists public.peopleflow_dev_habilidades;
drop table if exists public.peopleflow_dev_lista_mestra_revisoes;
drop table if exists public.peopleflow_dev_lista_mestra;
drop table if exists public.peopleflow_dev_auditoria;
drop table if exists public.peopleflow_dev_escopo;
drop table if exists public.peopleflow_dev_contas;

drop sequence if exists public.peopleflow_dev_treinamento_codigo_seq;

drop function if exists public.peopleflow_dev_participante_visivel(bigint);
drop function if exists public.peopleflow_dev_treinamento_visivel(bigint);
drop function if exists public.peopleflow_dev_responsavel_por(bigint);
drop function if exists public.peopleflow_dev_pode_ver_colaborador(bigint);
drop function if exists public.peopleflow_dev_meu_perfil();
drop function if exists public.peopleflow_dev_meu_colaborador_id();
drop function if exists public.peopleflow_dev_bloquear_alteracao();
drop function if exists public.peopleflow_dev_bloquear_exclusao();
drop function if exists public.peopleflow_dev_set_updated_at();

commit;
