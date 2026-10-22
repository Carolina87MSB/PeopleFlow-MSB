-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Participação por gravação
-- ════════════════════════════════════════════════════════════════════════
-- Altera SOMENTE objetos peopleflow_dev_*. Nenhum dado existente é alterado.
--
--   1. peopleflow_dev_treinamentos: 4 colunas NOVAS, todas com padrão seguro (nada muda para os treinamentos existentes):
--        permite_gravacao (padrão false) · gravacao_url (link da gravação no SharePoint) · gravacao_definida_em/_por.
--   2. peopleflow_dev_participantes.presenca_metodo: o método 'gravacao' passa a ser aceito (qr, manual, login, importacao
--      continuam válidos). A confirmação por gravação grava presença 'presente' + método 'gravacao' + data/hora + usuário.
--
-- A confirmação é feita pelo próprio colaborador autenticado, via servidor, com a declaração "Declaro que assisti ao treinamento".
-- Ela registra a DECLARAÇÃO do colaborador; não comprova tecnicamente a visualização integral do vídeo.
-- Transacional e idempotente. Rodar em Supabase > SQL Editor > New query.
-- Reversão: supabase/desenvolvimento_participacao_gravacao_rollback.sql (recusa-se se já houver participação por gravação).
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1. Treinamentos: permissão e link da gravação
alter table public.peopleflow_dev_treinamentos
  add column if not exists permite_gravacao boolean not null default false,
  add column if not exists gravacao_url text,
  add column if not exists gravacao_definida_em timestamptz,
  add column if not exists gravacao_definida_por uuid;
alter table public.peopleflow_dev_treinamentos drop constraint if exists peopleflow_dev_trein_gravacao_url_chk;
alter table public.peopleflow_dev_treinamentos
  add constraint peopleflow_dev_trein_gravacao_url_chk check (gravacao_url is null or (gravacao_url ~* '^https://' and length(gravacao_url) <= 1000));
comment on column public.peopleflow_dev_treinamentos.permite_gravacao is
  'Permite que participantes (presentes, ausentes ou só gravado) confirmem a participação assistindo à gravação, enquanto o treinamento estiver em andamento.';
comment on column public.peopleflow_dev_treinamentos.gravacao_url is
  'Link https da gravação (SharePoint). Só participantes da turma, RH e quem conduz enxergam o link.';

-- 2. Método de presença 'gravacao' (substitui a verificação de presenca_metodo, qualquer que seja o nome atual)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.peopleflow_dev_participantes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%presenca_metodo%'
  loop
    execute format('alter table public.peopleflow_dev_participantes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.peopleflow_dev_participantes
  add constraint peopleflow_dev_participantes_presenca_metodo_chk check (presenca_metodo is null or presenca_metodo in ('manual', 'qr', 'login', 'importacao', 'gravacao'));

-- Atualiza o cache da API (PostgREST) para enxergar as colunas novas imediatamente.
notify pgrst, 'reload schema';

commit;
