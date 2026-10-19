-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- REVERSÃO de supabase/desligamentos_historico_e_situacao.sql
--
-- Remove: view de apoio, tabelas do histórico de rescisões (e rubricas), guardas e as funções de situação funcional.
-- NÃO toca em `colaboradores`, no SST nem em qualquer outra estrutura.
--
-- PROTEÇÃO: se o histórico já tiver registros, a reversão RECUSA e não apaga nada. Para apagar mesmo assim, faça ANTES um
-- backup (ex.: export CSV das duas tabelas) e troque v_permitir_perda para true abaixo.
-- Antes de reverter, o código novo (que lê esse histórico) precisa estar fora do ar.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $rb$
declare
  v_permitir_perda boolean := false;   -- ← só mude para true depois de fazer o backup dos registros
  v_linhas integer := 0;
begin
  if to_regclass('public.peopleflow_rescisoes_historico') is not null then
    select count(*) into v_linhas from public.peopleflow_rescisoes_historico;
    if v_linhas > 0 and not v_permitir_perda then
      raise exception 'REVERSÃO RECUSADA: peopleflow_rescisoes_historico tem % registro(s). Faça o backup e ajuste v_permitir_perda. Nada foi alterado.', v_linhas;
    end if;
  end if;
end
$rb$;

drop view if exists public.peopleflow_v_rescisoes_historico_contaveis;
-- o trigger de guarda impede DELETE; ele sai junto com a tabela
drop table if exists public.peopleflow_rescisoes_historico_rubricas;
drop table if exists public.peopleflow_rescisoes_historico;
drop function if exists public.peopleflow_rescisoes_historico_guard();
drop function if exists public.peopleflow_ativo_em(date, boolean, date, boolean, date, text, date);
drop function if exists public.peopleflow_situacao_funcional_em(date, boolean, date, boolean, date, text, date);

commit;
