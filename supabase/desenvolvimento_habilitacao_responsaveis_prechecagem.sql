-- ════════════════════════════════════════════════════════════════════════
-- Pré-checagem (SOMENTE LEITURA) — Habilitação de Responsáveis por Treinamentos, Etapa 1
-- Rodar em Supabase > SQL Editor ANTES de aplicar supabase/desenvolvimento_habilitacao_responsaveis.sql.
-- Não altera nada. Guarde o resultado para comparar com a validação depois.
-- ════════════════════════════════════════════════════════════════════════

-- 1. A tabela de habilitações existe? (fase 5c aplicada)
select to_regclass('public.peopleflow_dev_responsaveis_gestao') is not null as tabela_responsaveis_existe;

-- 2. Habilitações hoje (esperado em produção: 0 linhas)
select count(*) as total, count(*) filter (where ativo) as ativas, count(*) filter (where not ativo) as revogadas
from public.peopleflow_dev_responsaveis_gestao;

-- 3. Colaboradores com mais de uma habilitação ativa (esperado: nenhuma linha — senão a migration recusa)
select colaborador_id, count(*) as ativas
from public.peopleflow_dev_responsaveis_gestao
where ativo
group by colaborador_id
having count(*) > 1;

-- 4. Quem hoje usa o perfil Responsavel no módulo (esperado: 0)
select perfil, count(*) as contas from public.peopleflow_dev_contas group by perfil order by perfil;

-- 5. Treinamentos por situação e quantos têm instrutor diferente do responsável (a visão do instrutor muda: passa a ser só leitura)
select status, count(*) as treinamentos,
       count(*) filter (where instrutor_colaborador_id is not null and instrutor_colaborador_id is distinct from responsavel_colaborador_id) as com_instrutor_distinto
from public.peopleflow_dev_treinamentos group by status order by status;

-- 6. Fotografia de contagens (devem ser IDÊNTICAS depois da migration)
select 'treinamentos' as tabela, count(*) as linhas from public.peopleflow_dev_treinamentos
union all select 'participantes', count(*) from public.peopleflow_dev_participantes
union all select 'evidencias', count(*) from public.peopleflow_dev_evidencias
union all select 'auditoria', count(*) from public.peopleflow_dev_auditoria
union all select 'responsaveis_gestao', count(*) from public.peopleflow_dev_responsaveis_gestao;
