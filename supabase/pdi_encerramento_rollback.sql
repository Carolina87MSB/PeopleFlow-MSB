-- REVERSÃO de supabase/pdi_encerramento.sql
-- Remove os triggers, a função, o CHECK e as 3 colunas. RECUSA se existir algum PDI "Encerrado" (a reversão apagaria o registro do encerramento),
-- salvo autorização explícita: com v_permitir_perda := true, os PDIs encerrados voltam a "Em andamento" (itens e ações nunca foram alterados)
-- e o motivo/data/responsável são descartados — faça backup antes.
begin;

do $rb$
declare
  v_permitir_perda constant boolean := false;  -- troque para true SOMENTE depois de backup e decisão do RH
  v_encerrados int;
begin
  if to_regclass('public.peopleflow_pdi') is null then
    raise exception 'peopleflow_pdi não existe — nada a reverter.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_pdi' and column_name = 'encerrado_em') then
    select count(*) into v_encerrados from public.peopleflow_pdi where status = 'Encerrado';
    if v_encerrados > 0 and not v_permitir_perda then
      raise exception 'REVERSÃO RECUSADA: existem % PDI(s) encerrado(s). Faça backup e ajuste v_permitir_perda := true se for mesmo reverter.', v_encerrados;
    end if;
  end if;
end
$rb$;

drop trigger if exists peopleflow_pdi_itens_encerrado_guard on public.peopleflow_pdi_itens;
drop trigger if exists peopleflow_pdi_acoes_encerrado_guard on public.peopleflow_pdi_acoes;
drop trigger if exists peopleflow_pdi_encerrado_guard on public.peopleflow_pdi;
drop function if exists public.peopleflow_pdi_filhos_encerrado_guard();
drop function if exists public.peopleflow_pdi_encerrado_guard();
alter table public.peopleflow_pdi drop constraint if exists peopleflow_pdi_encerramento_chk;

do $rb$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_pdi' and column_name = 'encerrado_em') then
    update public.peopleflow_pdi set status = 'Em andamento' where status = 'Encerrado';
  end if;
end
$rb$;

alter table public.peopleflow_pdi drop column if exists encerrado_em, drop column if exists encerrado_por, drop column if exists encerrado_motivo;

commit;
