-- REVERSÃO de supabase/desligamentos_adocao_conformidade.sql: volta o filtro antigo (`desligado = false AND empresa_afiliada = false`)
-- na view peopleflow_dev_v_conformidade, pela mesma técnica guardada (lê a definição viva; aborta se não achar o trecho novo).
begin;

do $rb$
declare
  v_def text;
  v_novo text;
  v_re constant text := '(public\.)?peopleflow_ativo_em\(c\.admissao, c\.desligado, c\.data_desligamento, c\.empresa_afiliada, CURRENT_DATE, ''operacional''(::text)?\)';
  v_volta constant text := 'COALESCE(c.desligado, false) = false AND COALESCE(c.empresa_afiliada, false) = false';
  v_opcoes text;
begin
  v_def := pg_get_viewdef('public.peopleflow_dev_v_conformidade'::regclass, true);
  if position('peopleflow_ativo_em' in v_def) = 0 then
    raise notice 'a view já está com o filtro antigo — nada a fazer.';
    return;
  end if;
  if v_def !~ v_re then
    raise exception 'ABORTADO: não encontrei o trecho da regra central na definição atual da view. Nada foi alterado.';
  end if;
  v_novo := regexp_replace(v_def, v_re, v_volta);
  select coalesce(string_agg(opt, ', '), '') into v_opcoes from unnest((select reloptions from pg_class where oid = 'public.peopleflow_dev_v_conformidade'::regclass)) as opt;
  execute 'create or replace view public.peopleflow_dev_v_conformidade' || case when v_opcoes <> '' then ' with (' || v_opcoes || ')' else '' end || ' as ' || v_novo;
end
$rb$;

commit;
