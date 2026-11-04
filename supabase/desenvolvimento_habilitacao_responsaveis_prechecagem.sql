-- ════════════════════════════════════════════════════════════════════════
-- Pré-checagem (SOMENTE LEITURA) — Habilitação de Responsáveis por Treinamentos
-- Rodar em Supabase > SQL Editor ANTES de aplicar supabase/desenvolvimento_habilitacao_responsaveis.sql.
-- Não altera nada. É UMA consulta só (o SQL Editor mostra o resultado de uma consulta por vez): copie a tabela inteira de volta.
-- Colunas: grupo · verificação · resultado · esperado · situação.
--   OK        = como esperado.
--   INFO      = só informa o ponto de partida (guarde para comparar com a validação depois).
--   ATENÇÃO   = não impede a migration, mas muda o que as pessoas verão ou merece conferência.
--   BLOQUEIA  = NÃO aplicar a migration até resolver.
-- ════════════════════════════════════════════════════════════════════════
with
-- helper: conta linhas de uma tabela que pode não existir (sem erro se ausente)
t as (
  select
    coalesce(to_regclass('public.peopleflow_dev_responsaveis_gestao') is not null, false) as tem_resp,
    coalesce(to_regclass('public.peopleflow_dev_evidencias') is not null, false) as tem_evid,
    coalesce(to_regclass('public.peopleflow_dev_participantes') is not null, false) as tem_part,
    coalesce(to_regclass('public.peopleflow_dev_treinamentos') is not null, false) as tem_trein
),
funcs as (
  select count(*) filter (where proname in (
    'peopleflow_dev_responsavel_por', 'peopleflow_dev_pode_ver_colaborador', 'peopleflow_dev_treinamento_visivel',
    'peopleflow_dev_participante_visivel', 'peopleflow_dev_meu_perfil', 'peopleflow_dev_meu_colaborador_id', 'peopleflow_dev_gere_treinamento')) as n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
),
gere as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'peopleflow_dev_gere_treinamento' limit 1
),
pol as (
  select qual from pg_policies where schemaname = 'public' and tablename = 'peopleflow_dev_evidencias' and policyname = 'dev_evidencias_leitura'
),
hab as (
  select case when (select tem_resp from t) then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.peopleflow_dev_responsaveis_gestao', false, true, '')))[1]::text::int end as total,
         case when (select tem_resp from t) then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.peopleflow_dev_responsaveis_gestao where ativo', false, true, '')))[1]::text::int end as ativas,
         case when (select tem_resp from t) then (xpath('/row/n/text()', query_to_xml('select count(*) as n from (select colaborador_id from public.peopleflow_dev_responsaveis_gestao where ativo group by colaborador_id having count(*) > 1) x', false, true, '')))[1]::text::int end as duplicadas
)
select * from (
  -- ── A. O banco está no estado que a migration espera? ──────────────────
  select 10 as ordem, 'A. Estado e dependências' as grupo, 'Tabela de habilitações (fase 5c) existe' as verificacao,
         case when (select tem_resp from t) then 'sim' else 'NÃO' end as resultado, 'sim' as esperado,
         case when (select tem_resp from t) then 'OK' else 'BLOQUEIA' end as situacao
  union all select 11, 'A. Estado e dependências', 'Funções e políticas-base que a migration usa existem (7 funções)',
         (select n::text from funcs), '7', case when (select n from funcs) = 7 then 'OK' else 'BLOQUEIA' end
  union all select 12, 'A. Estado e dependências', 'Função de leitura atual é a da fase 5c (ainda sem o modelo de habilitação)',
         case when (select def from gere) is null then 'ausente' when (select def from gere) like '%habilitado_agora%' then 'já é a nova' else 'fase 5c' end, 'fase 5c',
         case when (select def from gere) is null then 'BLOQUEIA' when (select def from gere) like '%habilitado_agora%' then 'INFO' else 'OK' end
  union all select 13, 'A. Estado e dependências', 'Política de leitura de evidências atual é a da fase 1 (será trocada pela seção 5 da migration)',
         case when not exists (select 1 from pol) then 'ausente' when (select qual from pol) like '%gere_treinamento%' then 'já é a nova' else 'fase 1' end, 'fase 1',
         case when not exists (select 1 from pol) then 'BLOQUEIA' when (select qual from pol) like '%gere_treinamento%' then 'INFO' else 'OK' end
  union all select 14, 'A. Estado e dependências', 'Migration já aplicada antes? (tabela de transferências)',
         case when to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then 'sim' else 'não' end, 'não',
         case when to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then 'INFO' else 'OK' end
  union all select 15, 'A. Estado e dependências', 'RLS ligada em treinamentos, participantes e evidências',
         (select count(*) filter (where relrowsecurity)::text from pg_class where oid in (to_regclass('public.peopleflow_dev_treinamentos'), to_regclass('public.peopleflow_dev_participantes'), to_regclass('public.peopleflow_dev_evidencias'))), '3',
         case when (select count(*) filter (where relrowsecurity) from pg_class where oid in (to_regclass('public.peopleflow_dev_treinamentos'), to_regclass('public.peopleflow_dev_participantes'), to_regclass('public.peopleflow_dev_evidencias'))) = 3 then 'OK' else 'BLOQUEIA' end
  union all select 16, 'A. Estado e dependências', 'Gravação (colunas permite_gravacao / gravacao_url em treinamentos)',
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_treinamentos' and column_name in ('permite_gravacao', 'gravacao_url')) = 2 then 'aplicada' else 'NÃO aplicada' end, 'informativo',
         'INFO'
  union all select 17, 'A. Estado e dependências', 'Avaliação de reação (tabelas)',
         case when to_regclass('public.peopleflow_dev_avaliacoes_reacao') is not null and to_regclass('public.peopleflow_dev_reacao_respostas') is not null then 'aplicada' else 'NÃO aplicada' end, 'informativo',
         'INFO'

  -- ── B. Habilitações e perfis hoje ───────────────────────────────────────
  union all select 20, 'B. Habilitações e perfis', 'Habilitações hoje (total / ativas / revogadas)',
         (select coalesce(total::text, '—') || ' / ' || coalesce(ativas::text, '—') || ' / ' || coalesce((total - ativas)::text, '—') from hab), 'em produção, 0 / 0 / 0', 'INFO'
  union all select 21, 'B. Habilitações e perfis', 'Colaboradores com mais de uma habilitação ativa (a migration recusa se houver)',
         coalesce((select duplicadas::text from hab), '—'), '0',
         case when coalesce((select duplicadas from hab), 0) = 0 then 'OK' else 'BLOQUEIA' end
  union all select 22, 'B. Habilitações e perfis', 'Contas do módulo por perfil (perfil Responsavel passa a ler só o que administra)',
         coalesce((select string_agg(perfil || ': ' || n, ' · ' order by perfil) from (select perfil, count(*) n from public.peopleflow_dev_contas group by perfil) x), 'nenhuma'), 'Responsavel: 0',
         case when exists (select 1 from public.peopleflow_dev_contas where perfil = 'Responsavel') then 'ATENÇÃO' else 'OK' end

  -- ── C. Dados que o novo modelo vai exibir (nada é alterado) ─────────────
  union all select 30, 'C. Dados existentes', 'Treinamentos por situação',
         coalesce((select string_agg(status || ': ' || n, ' · ' order by status) from (select status, count(*) n from public.peopleflow_dev_treinamentos group by status) x), 'nenhum'), 'informativo', 'INFO'
  union all select 31, 'C. Dados existentes', 'Treinamentos de homologação/teste',
         (select count(*)::text from public.peopleflow_dev_treinamentos where homologacao), 'informativo', 'INFO'
  union all select 32, 'C. Dados existentes', 'Ausências em treinamentos oficiais concluídos (passam a aparecer em "Pendências" do RH até serem encaminhadas, repostas ou dispensadas)',
         (select count(*)::text from public.peopleflow_dev_participantes p join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id where p.presenca_status = 'ausente' and p.removido_em is null and t.status = 'concluido' and not t.homologacao),
         'informativo', 'ATENÇÃO'
  union all select 33, 'C. Dados existentes', 'Treinamentos EXTERNOS concluídos sem evidência vigente (aparecem em "Registros incompletos" do RH)',
         (select count(*)::text from public.peopleflow_dev_treinamentos t where t.status = 'concluido' and not t.homologacao and t.modalidade = 'externo' and not exists (select 1 from public.peopleflow_dev_evidencias e where e.treinamento_id = t.id and e.substituida_em is null)),
         '0', 'ATENÇÃO'
  union all select 34, 'C. Dados existentes', 'Treinamentos INTERNOS concluídos sem Lista de Presença vigente (aparecem em "Registros incompletos")',
         (select count(*)::text from public.peopleflow_dev_treinamentos t where t.status = 'concluido' and not t.homologacao and t.modalidade = 'interno' and not exists (select 1 from public.peopleflow_dev_evidencias e where e.treinamento_id = t.id and e.substituida_em is null and e.storage_path ~ '^treinamentos/[0-9]+/sistema/')),
         '0', 'ATENÇÃO'
  union all select 35, 'C. Dados existentes', 'Treinamentos pendentes (solicitado/planejado/em andamento) sem responsável definido',
         (select count(*)::text from public.peopleflow_dev_treinamentos where status in ('solicitado', 'planejado', 'em_andamento') and responsavel_colaborador_id is null), '0', 'ATENÇÃO'
  union all select 36, 'C. Dados existentes', 'Treinamentos cujo campo Local é uma URL (total / do SharePoint / com mais de 90 caracteres)',
         (select count(*) filter (where local_link ~* '^https?://')::text || ' / ' || count(*) filter (where local_link ~* '^https?://[^/]*sharepoint\.com') || ' / ' || count(*) filter (where local_link ~* '^https?://' and length(local_link) > 90) from public.peopleflow_dev_treinamentos),
         'informativo (o PDF corta links não-SharePoint com mais de ~90 caracteres)', 'INFO'

  -- ── D. Fotografia de contagens (devem ser IDÊNTICAS na validação, exceto o que for criado depois) ──
  union all select 40, 'D. Contagens', 'treinamentos', (select count(*)::text from public.peopleflow_dev_treinamentos), 'igual após a migration', 'INFO'
  union all select 41, 'D. Contagens', 'participantes', (select count(*)::text from public.peopleflow_dev_participantes), 'igual após a migration', 'INFO'
  union all select 42, 'D. Contagens', 'evidencias (total / listas de presença do sistema)', (select count(*)::text || ' / ' || count(*) filter (where storage_path ~ '^treinamentos/[0-9]+/sistema/') from public.peopleflow_dev_evidencias), 'igual após a migration', 'INFO'
  union all select 43, 'D. Contagens', 'auditoria', (select count(*)::text from public.peopleflow_dev_auditoria), 'igual após a migration', 'INFO'
  union all select 44, 'D. Contagens', 'habilitacoes (responsaveis_gestao)', coalesce((select total::text from hab), '—'), 'igual após a migration', 'INFO'
  union all select 45, 'D. Contagens', 'necessidades / vínculos com treinamentos',
         (select count(*)::text from public.peopleflow_dev_necessidades) || ' / ' || (select count(*)::text from public.peopleflow_dev_treinamento_necessidades), 'igual após a migration', 'INFO'
  union all select 46, 'D. Contagens', 'avaliações de reação (envios / respostas)',
         case when to_regclass('public.peopleflow_dev_avaliacoes_reacao') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.peopleflow_dev_avaliacoes_reacao', false, true, '')))[1]::text else 'tabela ausente' end || ' / ' ||
         case when to_regclass('public.peopleflow_dev_reacao_respostas') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.peopleflow_dev_reacao_respostas', false, true, '')))[1]::text else 'tabela ausente' end,
         'igual após a migration', 'INFO'
) x
order by ordem;
