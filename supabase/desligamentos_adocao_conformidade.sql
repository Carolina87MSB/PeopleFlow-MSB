-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ADOÇÃO da regra central de situação funcional na view de conformidade (peopleflow_dev_v_conformidade)
--
-- Pré-requisito: supabase/desligamentos_historico_e_situacao.sql já aplicada (função peopleflow_ativo_em).
--
-- O que muda: o filtro "quem entra na conformidade" deixa de ser `desligado = false AND empresa_afiliada = false` e passa a usar
--   peopleflow_ativo_em(..., 'operacional'): desligamento com data FUTURA continua ativo até o dia; desligado sem data conta como
--   desligado; afiliada continua de fora. O restante do filtro (admissão futura ainda não conta) e TODAS as colunas da view ficam como estão.
--
-- Por que é um script separado e "guardado": a definição viva da view pode ter sido ajustada fora destes arquivos. O bloco abaixo LÊ a
-- definição atual (pg_get_viewdef), confirma que o trecho antigo existe e só então recria a view com a troca — idempotente (se já
-- adotada, não faz nada) e, se o trecho esperado não for encontrado, ABORTA sem alterar nada.
--
-- Reversão: supabase/desligamentos_adocao_conformidade_rollback.sql (restaura o trecho antigo pela mesma técnica).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $mig$
declare
  v_def text;
  v_novo text;
  v_antigo_re constant text := 'COALESCE\(c\.desligado, false\) = false AND COALESCE\(c\.empresa_afiliada, false\) = false';
  v_troca constant text := 'public.peopleflow_ativo_em(c.admissao, c.desligado, c.data_desligamento, c.empresa_afiliada, CURRENT_DATE, ''operacional'')';
  v_opcoes text;
begin
  if to_regprocedure('public.peopleflow_ativo_em(date,boolean,date,boolean,date,text,date)') is null then
    raise exception 'PRÉ-CONDIÇÃO: aplique antes supabase/desligamentos_historico_e_situacao.sql — nada foi alterado.';
  end if;
  if to_regclass('public.peopleflow_dev_v_conformidade') is null then
    raise exception 'PRÉ-CONDIÇÃO: view peopleflow_dev_v_conformidade não existe — nada foi alterado.';
  end if;

  v_def := pg_get_viewdef('public.peopleflow_dev_v_conformidade'::regclass, true);
  if position('peopleflow_ativo_em' in v_def) > 0 then
    raise notice 'peopleflow_dev_v_conformidade já usa a regra central — nada a fazer.';
    return;
  end if;
  if v_def !~ v_antigo_re then
    raise exception 'ABORTADO: a definição atual da view não contém o filtro esperado (desligado/empresa_afiliada). Nada foi alterado; revise a view antes de adotar a regra.';
  end if;

  v_novo := regexp_replace(v_def, v_antigo_re, v_troca);
  -- preserva as opções da view (security_invoker)
  select coalesce(string_agg(opt, ', '), '') into v_opcoes from unnest((select reloptions from pg_class where oid = 'public.peopleflow_dev_v_conformidade'::regclass)) as opt;
  execute 'create or replace view public.peopleflow_dev_v_conformidade' || case when v_opcoes <> '' then ' with (' || v_opcoes || ')' else '' end || ' as ' || v_novo;
end
$mig$;

commit;
