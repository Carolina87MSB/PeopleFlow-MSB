-- VALIDAÇÃO (SOMENTE LEITURA) de supabase/desligamentos_financeiro_lancamento_simples.sql — rode depois da migration. Não grava nada.
-- Resultado: uma linha por verificação, com "OK" ou "FALHA".
with checagens as (
  select 'fechamento: a validação aceita a origem informado_rh e a constraint está validada' as verificacao,
         exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_validacao_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass and convalidated
                  and pg_get_constraintdef(oid) like '%informado_rh%') as ok
  union all select 'rubricas: grrf_fonte aceita informado_rh e a constraint está validada',
         exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_grrf_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass and convalidated
                  and pg_get_constraintdef(oid) like '%informado_rh%')
  union all select 'compatibilidade: as origens anteriores (folha_rescisao, guia_grrf, demonstrativo_rescisao, outro_documento) continuam aceitas',
         exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_validacao_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass
                  and pg_get_constraintdef(oid) like '%folha_rescisao%' and pg_get_constraintdef(oid) like '%guia_grrf%' and pg_get_constraintdef(oid) like '%demonstrativo_rescisao%' and pg_get_constraintdef(oid) like '%outro_documento%')
  union all select 'responsável, data e consistência continuam exigidos pelo banco (responsável não vazio, justificativa da GRRF não aplicável, valor preenchido)',
         exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_validacao_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass
                  and pg_get_constraintdef(oid) like '%rescisao_validada_por%' and pg_get_constraintdef(oid) like '%grrf_validada_por%' and pg_get_constraintdef(oid) like '%grrf_justificativa%' and pg_get_constraintdef(oid) like '%rescisao_validada_em%' and pg_get_constraintdef(oid) like '%grrf_validada_em%')
         and exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_grrf_status_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass and convalidated)
         and exists (select 1 from pg_constraint where conname = 'peopleflow_rubricas_rescisao_status_chk' and conrelid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass and convalidated)
  union all select 'trilha segue somente inserção e sem acesso do navegador',
         exists (select 1 from pg_trigger where tgname = 'peopleflow_fechamentos_log_guard' and not tgisinternal)
         and not has_table_privilege('authenticated', 'public.peopleflow_fechamentos_log', 'select') and not has_table_privilege('anon', 'public.peopleflow_fechamentos_log', 'select')
  union all select '24 rubricas preservadas e totais importados da folha inalterados (líquido 96.110,58 · FGTS rescisório 24.196,05)',
         (select count(*) from public.peopleflow_rescisoes_historico_rubricas) = 24
         and (select round(sum(liquido), 2) from public.peopleflow_rescisoes_historico_rubricas) = 96110.58
         and (select round(sum(fgts_rescisorio), 2) from public.peopleflow_rescisoes_historico_rubricas) = 24196.05
  union all select 'os líquidos já validados continuam validados, com responsável, data e valor (mínimo de 19)',
         (select count(*) from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado') >= 19
         and not exists (select 1 from public.peopleflow_rescisoes_historico_rubricas where rescisao_status = 'validado'
                           and (rescisao_validada_por is null or btrim(rescisao_validada_por) = '' or rescisao_validada_em is null or rescisao_valor_validado is null))
  union all select 'os 7 fechamentos existentes continuam presentes (mínimo de 7)', (select count(*) from public.peopleflow_desligamentos) >= 7
  union all select 'toda validação gravada tem responsável e data (rescisão e GRRF dos fechamentos)',
         not exists (select 1 from public.peopleflow_desligamentos where (rescisao_validada_em is not null and (rescisao_validada_por is null or btrim(rescisao_validada_por) = ''))
                                                                        or (grrf_validada_em is not null and (grrf_validada_por is null or btrim(grrf_validada_por) = '')))
  union all select 'nenhuma conversão de estágio com validação financeira', not exists (
      select 1 from public.peopleflow_rescisoes_historico_rubricas r join public.peopleflow_rescisoes_historico h on h.id = r.rescisao_id
       where h.natureza = 'conversao_estagio_clt' and (r.rescisao_status <> 'proposto' or r.grrf_status <> 'pendente'))
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado from checagens
union all
select 'RESUMO: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' falha(s)', case when count(*) filter (where not ok) = 0 then 'OK' else 'FALHA' end from checagens
order by 2 desc, 1;

-- Informativo: o que já foi informado e confirmado pelo RH pelo diálogo único (somente contagens, sem nomes nem valores)
select
  (select count(*) from public.peopleflow_desligamentos where rescisao_fonte = 'informado_rh') as rescisoes_informadas_pelo_rh,
  (select count(*) from public.peopleflow_desligamentos where grrf_fonte = 'informado_rh') as grrf_fechamentos_informadas_pelo_rh,
  (select count(*) from public.peopleflow_rescisoes_historico_rubricas where grrf_fonte = 'informado_rh') as grrf_folha_informadas_pelo_rh,
  (select count(*) from public.peopleflow_fechamentos_log where origem = 'informado_rh') as linhas_de_trilha_informado_rh;
