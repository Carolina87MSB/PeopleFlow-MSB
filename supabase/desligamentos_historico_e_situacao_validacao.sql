-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO (SOMENTE LEITURA) de supabase/desligamentos_historico_e_situacao.sql
-- Rode no SQL Editor depois da migration (e de novo depois da carga dos dados). Não grava nada.
-- Resultado: uma linha por verificação, com "OK" ou "FALHA". Tudo "OK" = estrutura e regra corretas.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

with
cenarios(descricao, admissao, desligado, data_desl, afiliada, ref, escopo, hoje, esperado) as (
  values
    ('ativo comum, quadro',                        date '2024-01-10', false, null::date, false, date '2026-10-16', 'quadro',      date '2026-10-16', 'ativo'),
    ('desligado antes da referência',              date '2024-01-10', true,  date '2026-07-13', false, date '2026-10-16', 'quadro', date '2026-10-16', 'desligado'),
    ('desligado NO dia da referência',             date '2024-01-10', true,  date '2026-10-16', false, date '2026-10-16', 'quadro', date '2026-10-16', 'desligado'),
    ('desligamento FUTURO ainda é ativo',          date '2024-01-10', true,  date '2026-11-30', false, date '2026-10-16', 'operacional', date '2026-10-16', 'ativo'),
    ('desligado sem data: hoje em diante',         date '2024-01-10', true,  null::date, false, date '2026-10-16', 'operacional', date '2026-10-16', 'desligado'),
    ('desligado sem data: passado conta ativo',    date '2024-01-10', true,  null::date, false, date '2026-03-01', 'quadro',      date '2026-10-16', 'ativo'),
    ('afiliada fora do quadro',                    date '2024-01-10', false, null::date, true,  date '2026-10-16', 'quadro',      date '2026-10-16', 'fora_do_quadro'),
    ('afiliada entra no acesso',                   date '2024-01-10', false, null::date, true,  date '2026-10-16', 'acesso',      date '2026-10-16', 'ativo'),
    ('admissão futura: quadro não conta',          date '2026-12-01', false, null::date, false, date '2026-10-16', 'quadro',      date '2026-10-16', 'nao_iniciado'),
    ('admissão futura: operacional permite',       date '2026-12-01', false, null::date, false, date '2026-10-16', 'operacional', date '2026-10-16', 'ativo'),
    ('admissão ausente: quadro não conta',         null::date,        false, null::date, false, date '2026-10-16', 'quadro',      date '2026-10-16', 'nao_iniciado'),
    ('admissão ausente: operacional permite',      null::date,        false, null::date, false, date '2026-10-16', 'operacional', date '2026-10-16', 'ativo')
),
checagens as (
  select 'regra SQL: ' || descricao as verificacao,
         public.peopleflow_situacao_funcional_em(admissao, desligado, data_desl, afiliada, ref, escopo, hoje) = esperado as ok
  from cenarios
  union all select 'função peopleflow_ativo_em existe', to_regprocedure('public.peopleflow_ativo_em(date,boolean,date,boolean,date,text,date)') is not null
  union all select 'tabela peopleflow_rescisoes_historico existe', to_regclass('public.peopleflow_rescisoes_historico') is not null
  union all select 'tabela de rubricas existe', to_regclass('public.peopleflow_rescisoes_historico_rubricas') is not null
  union all select 'RLS ligada no histórico', (select relrowsecurity from pg_class where oid = 'public.peopleflow_rescisoes_historico'::regclass)
  union all select 'RLS ligada nas rubricas', (select relrowsecurity from pg_class where oid = 'public.peopleflow_rescisoes_historico_rubricas'::regclass)
  union all select 'rubricas: nenhuma política (só servidor)', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'peopleflow_rescisoes_historico_rubricas')
  union all select 'rubricas: authenticated NÃO lê', not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico_rubricas', 'select')
  union all select 'histórico: authenticated só lê (sem escrita)', has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico', 'select')
      and not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico', 'insert')
      and not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico', 'update')
      and not has_table_privilege('authenticated', 'public.peopleflow_rescisoes_historico', 'delete')
  union all select 'identificador único (empresa+código+data)', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'peopleflow_rescisoes_hist_uidx')
  union all select 'guarda de imutabilidade ativa', exists (select 1 from pg_trigger where tgname = 'peopleflow_rescisoes_historico_guard' and not tgisinternal)
  union all select 'sem duplicidade de rescisão', not exists (select 1 from public.peopleflow_rescisoes_historico group by empresa_codigo, codigo_folha, demissao having count(*) > 1)
  union all select 'conversão sempre ligada a um cadastro existente', not exists (
      select 1 from public.peopleflow_rescisoes_historico h where h.natureza = 'conversao_estagio_clt' and (h.colaborador_id is null or not exists (select 1 from public.colaboradores c where c.id = h.colaborador_id)))
  union all select 'conversão não vira desligado no cadastro', not exists (
      select 1 from public.peopleflow_rescisoes_historico h join public.colaboradores c on c.id = h.colaborador_id where h.natureza = 'conversao_estagio_clt' and coalesce(c.desligado, false))
  union all select 'vínculo com o cadastro aponta a mesma pessoa (primeiro nome confere)', not exists (
      select 1 from public.peopleflow_rescisoes_historico h join public.colaboradores c on c.id = h.colaborador_id
      where split_part(h.nome_normalizado, ' ', 1) <> split_part(public.peopleflow_dev_normalizar_nome(c.nome), ' ', 1))
)
select verificacao, case when ok then 'OK' else 'FALHA' end as resultado from checagens
union all
select 'RESUMO: ' || count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' falha(s)', case when count(*) filter (where not ok) = 0 then 'OK' else 'FALHA' end from checagens
order by 2 desc, 1;

-- Informativo (depois da carga): totais do histórico por natureza
select natureza, count(*) as registros, count(*) filter (where colaborador_id is not null) as ligados_ao_cadastro
from public.peopleflow_rescisoes_historico group by natureza order by natureza;
