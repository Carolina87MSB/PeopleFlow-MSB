-- FECHAMENTO DO ACESSO DIRETO ao fechamento financeiro (peopleflow_desligamentos) — migration SEPARADA, aplicada só DEPOIS de o código novo estar no ar.
-- Até aqui qualquer usuário autenticado lia e gravava esta tabela pelo navegador (política "authenticated_rw_desligamentos"). Depois desta migration só o
-- servidor (service_role) acessa: o RH vê os valores individuais pela conferência financeira (servidor) e a Diretoria só os totais mensais.
-- Reversão: supabase/desligamentos_financeiro_fechar_acesso_rollback.sql (recria a política e os privilégios anteriores).
begin;

do $mig$
begin
  if to_regclass('public.peopleflow_desligamentos') is null then
    raise exception 'PRÉ-CONDIÇÃO: peopleflow_desligamentos não existe — nada foi alterado.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_desligamentos' and column_name = 'validado_em') then
    raise exception 'PRÉ-CONDIÇÃO: aplique antes supabase/desligamentos_financeiro.sql — nada foi alterado.';
  end if;
end
$mig$;

drop policy if exists "authenticated_rw_desligamentos" on public.peopleflow_desligamentos;
alter table public.peopleflow_desligamentos enable row level security;
revoke all on public.peopleflow_desligamentos from public, anon, authenticated;
grant all on public.peopleflow_desligamentos to service_role;

commit;
