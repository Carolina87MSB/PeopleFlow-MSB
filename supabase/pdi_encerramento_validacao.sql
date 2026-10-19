-- VALIDAÇÃO (SOMENTE LEITURA) de supabase/pdi_encerramento.sql — rode depois da migration (e depois de encerrar um PDI). Não grava nada.
-- Resultado: uma linha por verificação, com "OK" ou "FALHA".
with checagens as (
  select 'coluna encerrado_em' as verificacao, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_pdi' and column_name = 'encerrado_em') as ok
  union all select 'coluna encerrado_por', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_pdi' and column_name = 'encerrado_por')
  union all select 'coluna encerrado_motivo', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_pdi' and column_name = 'encerrado_motivo')
  union all select 'CHECK de consistência do encerramento', exists (select 1 from pg_constraint where conname = 'peopleflow_pdi_encerramento_chk' and conrelid = 'public.peopleflow_pdi'::regclass and convalidated)
  union all select 'trigger de imutabilidade do cabeçalho', exists (select 1 from pg_trigger where tgname = 'peopleflow_pdi_encerrado_guard' and not tgisinternal)
  union all select 'trigger de imutabilidade dos itens', exists (select 1 from pg_trigger where tgname = 'peopleflow_pdi_itens_encerrado_guard' and not tgisinternal)
  union all select 'trigger de imutabilidade das ações', exists (select 1 from pg_trigger where tgname = 'peopleflow_pdi_acoes_encerrado_guard' and not tgisinternal)
  union all select 'nenhum PDI existente ficou com dados de encerramento sem estar encerrado', not exists (select 1 from public.peopleflow_pdi where status <> 'Encerrado' and (encerrado_em is not null or encerrado_por is not null or encerrado_motivo is not null))
  union all select 'todo PDI encerrado tem data, responsável e motivo', not exists (select 1 from public.peopleflow_pdi where status = 'Encerrado' and (encerrado_em is null or btrim(coalesce(encerrado_por, '')) = '' or btrim(coalesce(encerrado_motivo, '')) = ''))
  union all select 'PDI encerrado não tem item/ação alterado depois do encerramento', not exists (
      select 1 from public.peopleflow_pdi p join public.peopleflow_pdi_itens i on i.pdi_id = p.id
       where p.status = 'Encerrado' and i.updated_at > p.encerrado_em)
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado from checagens
union all
select 'RESUMO: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' falha(s)', case when count(*) filter (where not ok) = 0 then 'OK' else 'FALHA' end from checagens
order by 2 desc, 1;

-- Informativo: PDIs por status
select status, count(*) as pdis from public.peopleflow_pdi group by status order by status;
