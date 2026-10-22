-- ════════════════════════════════════════════════════════════════════════
-- Reversão: Participação por gravação (supabase/desenvolvimento_participacao_gravacao.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Recusa-se se já existir participação confirmada por gravação ou treinamento configurado para gravação
-- (são registros de qualidade e nunca são apagados nem reclassificados). Transacional e repetível.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
declare tem boolean := false;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_treinamentos' and column_name = 'permite_gravacao') then
    execute 'select exists (select 1 from public.peopleflow_dev_treinamentos where permite_gravacao or gravacao_url is not null)' into tem;
  end if;
  if not tem then
    select exists (select 1 from public.peopleflow_dev_participantes where presenca_metodo = 'gravacao') into tem;
  end if;
  if tem then
    raise exception 'Reversão bloqueada: já existem treinamentos com gravação ou participações confirmadas por gravação (registros não são alterados).';
  end if;
end $$;

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
  add constraint peopleflow_dev_participantes_presenca_metodo_check check (presenca_metodo in ('manual', 'qr', 'login', 'importacao'));

alter table public.peopleflow_dev_treinamentos drop constraint if exists peopleflow_dev_trein_gravacao_url_chk;
alter table public.peopleflow_dev_treinamentos
  drop column if exists permite_gravacao,
  drop column if exists gravacao_url,
  drop column if exists gravacao_definida_em,
  drop column if exists gravacao_definida_por;

commit;
