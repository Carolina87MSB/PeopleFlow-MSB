-- REVERSÃO de supabase/desligamentos_financeiro_fechar_acesso.sql: devolve a política e os privilégios anteriores (leitura/escrita por qualquer autenticado).
begin;
alter table public.peopleflow_desligamentos enable row level security;
drop policy if exists "authenticated_rw_desligamentos" on public.peopleflow_desligamentos;
create policy "authenticated_rw_desligamentos" on public.peopleflow_desligamentos for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.peopleflow_desligamentos to authenticated;
grant all on public.peopleflow_desligamentos to service_role;
commit;
