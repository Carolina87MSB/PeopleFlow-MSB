-- Rollback do lançamento simples: restaura as listas de origem anteriores (sem 'informado_rh').
-- RECUSA reverter se já existir qualquer valor confirmado com a origem 'informado_rh' (reverter apagaria a rastreabilidade da confirmação).
-- Nesse caso, mantenha a migration (ela só amplia) ou migre antes esses registros por decisão expressa do RH.

begin;

do $rb$
declare
  v_n int;
begin
  select (select count(*) from public.peopleflow_desligamentos where rescisao_fonte = 'informado_rh' or grrf_fonte = 'informado_rh')
       + (select count(*) from public.peopleflow_rescisoes_historico_rubricas where grrf_fonte = 'informado_rh')
    into v_n;
  if v_n > 0 then
    raise exception 'Há % registro(s) com origem informado_rh: o rollback foi recusado para não perder a rastreabilidade das confirmações.', v_n;
  end if;
end
$rb$;

alter table public.peopleflow_desligamentos drop constraint if exists peopleflow_desligamentos_validacao_chk;
alter table public.peopleflow_desligamentos add constraint peopleflow_desligamentos_validacao_chk check (
  (rescisao_validada_em is null and rescisao_validada_por is null and rescisao_fonte is null
    or rescisao_validada_em is not null and btrim(coalesce(rescisao_validada_por, '')) <> '' and rescisao_fonte is not null and rescisao_fonte in ('folha_rescisao', 'demonstrativo_rescisao', 'outro_documento') and valor_rescisao is not null)
  and
  (grrf_validada_em is null and grrf_validada_por is null and grrf_fonte is null and grrf_nao_aplicavel = false and grrf_justificativa is null
    or grrf_validada_em is not null and btrim(coalesce(grrf_validada_por, '')) <> '' and valor_grrf is not null
       and ((grrf_nao_aplicavel and valor_grrf = 0 and btrim(coalesce(grrf_justificativa, '')) <> '' and grrf_fonte is null)
            or (not grrf_nao_aplicavel and grrf_fonte is not null and grrf_fonte in ('guia_grrf', 'demonstrativo_rescisao', 'outro_documento'))))
);

alter table public.peopleflow_rescisoes_historico_rubricas drop constraint if exists peopleflow_rubricas_grrf_chk;
alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_grrf_chk check (
  grrf_fonte is null or grrf_fonte in ('guia_grrf', 'demonstrativo_rescisao', 'outro_documento')
);

commit;
