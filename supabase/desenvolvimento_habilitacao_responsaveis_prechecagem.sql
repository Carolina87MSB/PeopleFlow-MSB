-- ════════════════════════════════════════════════════════════════════════
-- Pré-checagem (SOMENTE LEITURA) — Habilitação de Responsáveis por Treinamentos
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

-- 4. Quem hoje usa o perfil Responsavel no módulo (esperado: 0) — depois da migration, esse perfil só lê o que administra e enquanto habilitado
select perfil, count(*) as contas from public.peopleflow_dev_contas group by perfil order by perfil;

-- 5. Treinamentos por situação, quantos têm responsável diferente de quem registrou e quantos têm instrutor interno distinto do responsável
select status, count(*) as treinamentos,
       count(*) filter (where responsavel_colaborador_id is distinct from solicitado_por_colaborador_id) as responsavel_diferente_de_quem_registrou,
       count(*) filter (where instrutor_colaborador_id is not null and instrutor_colaborador_id is distinct from responsavel_colaborador_id) as com_instrutor_distinto
from public.peopleflow_dev_treinamentos group by status order by status;

-- 6. Ausências já registradas em treinamentos oficiais concluídos (passam a aparecer em "Pendências" do RH até serem encaminhadas, reporem ou serem dispensadas)
select count(*) as ausentes_em_treinamentos_oficiais_concluidos
from public.peopleflow_dev_participantes p
join public.peopleflow_dev_treinamentos t on t.id = p.treinamento_id
where p.presenca_status = 'ausente' and p.removido_em is null and t.status = 'concluido' and not t.homologacao;

-- 7. Fotografia de contagens (devem ser IDÊNTICAS depois da migration)
select 'treinamentos' as tabela, count(*) as linhas from public.peopleflow_dev_treinamentos
union all select 'participantes', count(*) from public.peopleflow_dev_participantes
union all select 'evidencias', count(*) from public.peopleflow_dev_evidencias
union all select 'auditoria', count(*) from public.peopleflow_dev_auditoria
union all select 'responsaveis_gestao', count(*) from public.peopleflow_dev_responsaveis_gestao;
