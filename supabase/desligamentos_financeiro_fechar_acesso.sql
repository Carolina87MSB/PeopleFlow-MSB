-- FECHAMENTO DO ACESSO DIRETO ao fechamento financeiro (peopleflow_desligamentos) — migration SEPARADA, aplicada só DEPOIS de o código novo estar no ar.
-- Até aqui qualquer usuário autenticado lia e gravava esta tabela pelo navegador (política "authenticated_rw_desligamentos"). Depois desta migration só o
-- servidor (service_role) acessa: o RH vê e registra os valores individuais pela conferência financeira / diálogo "Lançar e confirmar valores" (servidor),
-- a Diretoria recebe só os totais mensais agregados (servidor) e o Gestor não recebe valores financeiros.
--
-- Esta migration NÃO altera nenhuma linha, coluna, constraint ou trigger: só remove políticas e privilégios de acesso direto (anon/authenticated).
-- O navegador não usa mais esta tabela (todas as leituras e gravações passam pelas ações `financeiro_*` do servidor, que usa service_role).
-- Atômica: se a verificação final não confirmar o fechamento, a transação inteira é desfeita.
-- Reversão: supabase/desligamentos_financeiro_fechar_acesso_rollback.sql (recria a política e os privilégios anteriores).
begin;

do $mig$
begin
  if to_regclass('public.peopleflow_desligamentos') is null then
    raise exception 'PRÉ-CONDIÇÃO: peopleflow_desligamentos não existe — nada foi alterado.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_desligamentos' and column_name = 'rescisao_validada_em') then
    raise exception 'PRÉ-CONDIÇÃO: aplique antes supabase/desligamentos_financeiro.sql — nada foi alterado.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peopleflow_desligamentos_validacao_chk' and conrelid = 'public.peopleflow_desligamentos'::regclass and pg_get_constraintdef(oid) like '%informado_rh%') then
    raise exception 'PRÉ-CONDIÇÃO: aplique antes supabase/desligamentos_financeiro_lancamento_simples.sql — nada foi alterado.';
  end if;
end
$mig$;

-- remove TODA política da tabela (a conhecida e qualquer outra que exista), mantendo a RLS ligada
do $pol$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'peopleflow_desligamentos' loop
    execute format('drop policy %I on public.peopleflow_desligamentos', p.policyname);
  end loop;
end
$pol$;

alter table public.peopleflow_desligamentos enable row level security;
revoke all on public.peopleflow_desligamentos from public, anon, authenticated;
grant all on public.peopleflow_desligamentos to service_role;

-- verificação final: se o fechamento não estiver completo, desfaz tudo
do $chk$
begin
  if has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'select')
     or has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'insert')
     or has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'update')
     or has_table_privilege('authenticated', 'public.peopleflow_desligamentos', 'delete')
     or has_table_privilege('anon', 'public.peopleflow_desligamentos', 'select')
     or has_table_privilege('anon', 'public.peopleflow_desligamentos', 'insert') then
    raise exception 'FECHAMENTO NÃO CONFIRMADO: authenticated/anon ainda têm privilégio — transação desfeita.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'peopleflow_desligamentos') then
    raise exception 'FECHAMENTO NÃO CONFIRMADO: ainda existe política na tabela — transação desfeita.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.peopleflow_desligamentos'::regclass) then
    raise exception 'FECHAMENTO NÃO CONFIRMADO: RLS desligada — transação desfeita.';
  end if;
  if not has_table_privilege('service_role', 'public.peopleflow_desligamentos', 'select') then
    raise exception 'FECHAMENTO NÃO CONFIRMADO: o servidor (service_role) perdeu o acesso — transação desfeita.';
  end if;
end
$chk$;

commit;
