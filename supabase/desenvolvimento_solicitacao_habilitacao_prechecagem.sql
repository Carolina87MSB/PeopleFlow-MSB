-- ════════════════════════════════════════════════════════════════════════
-- Pré-checagem (SOMENTE LEITURA) — Gestor autorizado + solicitação de habilitação
-- Rodar em Supabase > SQL Editor ANTES de aplicar supabase/desenvolvimento_solicitacao_habilitacao.sql. Não altera nada.
-- É UMA consulta só (o SQL Editor mostra uma por vez): copie a tabela inteira de volta.
-- Situação: OK = como esperado · INFO = ponto de partida · ATENÇÃO = confira · BLOQUEIA = NÃO aplicar a migration.
-- ════════════════════════════════════════════════════════════════════════
with
gere as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'peopleflow_dev_gere_treinamento' limit 1
)
select * from (
  select 10 as ordem, 'A. Estado e dependências' as grupo, 'Migration anterior (modelo de habilitação) aplicada: tabela de transferências' as verificacao,
         case when to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then 'sim' else 'NÃO' end as resultado, 'sim' as esperado,
         case when to_regclass('public.peopleflow_dev_transferencias_responsabilidade') is not null then 'OK' else 'BLOQUEIA' end as situacao
  union all select 11, 'A. Estado e dependências', 'Função de leitura atual é a do modelo de habilitação (usa habilitado_agora, sem o responsável principal no escopo)',
         case when (select def from gere) is null then 'ausente' when (select def from gere) like '%t.responsavel_colaborador_id)%' then 'já é a nova' when (select def from gere) like '%habilitado_agora%' then 'modelo de habilitação' else 'anterior' end, 'modelo de habilitação',
         case when (select def from gere) is null then 'BLOQUEIA' when (select def from gere) like '%habilitado_agora%' and (select def from gere) not like '%t.responsavel_colaborador_id)%' then 'OK' when (select def from gere) like '%t.responsavel_colaborador_id)%' then 'INFO' else 'BLOQUEIA' end
  union all select 12, 'A. Estado e dependências', 'Tabela de solicitações já existe? (migration já aplicada)',
         case when to_regclass('public.peopleflow_dev_habilitacao_solicitacoes') is not null then 'sim' else 'não' end, 'não',
         case when to_regclass('public.peopleflow_dev_habilitacao_solicitacoes') is not null then 'INFO' else 'OK' end
  union all select 13, 'A. Estado e dependências', 'Funções-base usadas (bloquear_exclusao, meu_perfil, meu_colaborador_id, habilitado_agora)',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('peopleflow_dev_bloquear_exclusao', 'peopleflow_dev_meu_perfil', 'peopleflow_dev_meu_colaborador_id', 'peopleflow_dev_habilitado_agora')), '4',
         case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('peopleflow_dev_bloquear_exclusao', 'peopleflow_dev_meu_perfil', 'peopleflow_dev_meu_colaborador_id', 'peopleflow_dev_habilitado_agora')) = 4 then 'OK' else 'BLOQUEIA' end
  union all select 14, 'A. Estado e dependências', 'Log de notificações por e-mail existe (usado para avisar o RH)',
         case when to_regclass('public.peopleflow_notificacoes_email') is not null then 'sim' else 'NÃO' end, 'sim',
         case when to_regclass('public.peopleflow_notificacoes_email') is not null then 'OK' else 'ATENÇÃO' end

  union all select 20, 'B. Quem será notificado e quem será autorizado', 'Contas do módulo por perfil (RH recebe o e-mail; Gestor passa a ser autorizado)',
         coalesce((select string_agg(perfil || ': ' || n, ' · ' order by perfil) from (select perfil, count(*) n from public.peopleflow_dev_contas group by perfil) x), 'nenhuma'), 'RH: 2 · Gestor: 6', 'INFO'
  union all select 21, 'B. Quem será notificado e quem será autorizado', 'Habilitações hoje (total / ativas / revogadas)',
         (select count(*)::text || ' / ' || count(*) filter (where ativo)::text || ' / ' || count(*) filter (where not ativo)::text from public.peopleflow_dev_responsaveis_gestao), 'informativo', 'INFO'

  union all select 30, 'C. Contagens (devem ser IDÊNTICAS depois)', 'treinamentos', (select count(*)::text from public.peopleflow_dev_treinamentos), 'igual após a migration', 'INFO'
  union all select 31, 'C. Contagens (devem ser IDÊNTICAS depois)', 'participantes', (select count(*)::text from public.peopleflow_dev_participantes), 'igual após a migration', 'INFO'
  union all select 32, 'C. Contagens (devem ser IDÊNTICAS depois)', 'evidencias', (select count(*)::text from public.peopleflow_dev_evidencias), 'igual após a migration', 'INFO'
  union all select 33, 'C. Contagens (devem ser IDÊNTICAS depois)', 'habilitacoes (responsaveis_gestao)', (select count(*)::text from public.peopleflow_dev_responsaveis_gestao), 'igual após a migration', 'INFO'
  union all select 34, 'C. Contagens (devem ser IDÊNTICAS depois)', 'transferencias de responsabilidade', (select count(*)::text from public.peopleflow_dev_transferencias_responsabilidade), 'igual após a migration', 'INFO'
  union all select 35, 'C. Contagens (devem ser IDÊNTICAS depois)', 'auditoria (pode SUBIR por acessos; não pode diminuir)', (select count(*)::text from public.peopleflow_dev_auditoria), 'igual ou maior', 'INFO'
) x
order by ordem;
