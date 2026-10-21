-- ════════════════════════════════════════════════════════════════════════
-- Reversão: Avaliação de Reação (supabase/desenvolvimento_avaliacao_reacao.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Remove SOMENTE os objetos criados pela migration. Recusa-se se já houver avaliações respondidas
-- (são registros de qualidade e nunca são apagados). Transacional e repetível.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
declare tem boolean := false;
begin
  -- SQL dinâmico: repetível mesmo depois que as tabelas já foram removidas
  if to_regclass('public.peopleflow_dev_avaliacoes_reacao') is not null then
    execute 'select exists (select 1 from public.peopleflow_dev_avaliacoes_reacao)' into tem;
  end if;
  if not tem and to_regclass('public.peopleflow_dev_reacao_respostas') is not null then
    execute 'select exists (select 1 from public.peopleflow_dev_reacao_respostas)' into tem;
  end if;
  if tem then
    raise exception 'Reversão bloqueada: já existem avaliações de reação respondidas (registros não são apagados).';
  end if;
end $$;

drop function if exists public.peopleflow_dev_reacao_registrar(bigint, bigint, bigint, uuid, smallint, timestamptz, timestamptz, smallint, smallint, smallint, smallint, smallint);
drop table if exists public.peopleflow_dev_reacao_respostas;
drop table if exists public.peopleflow_dev_avaliacoes_reacao;
drop function if exists public.peopleflow_dev_reacao_valida();
drop table if exists public.peopleflow_dev_reacao_config;

commit;
