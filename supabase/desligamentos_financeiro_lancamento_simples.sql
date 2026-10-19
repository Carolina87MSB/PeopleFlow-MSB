-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- PeopleFlow · Desligamentos · Lançamento simples (Rescisão + GRRF informados e confirmados pelo RH)
--
-- MIGRATION ADITIVA — NÃO edita a migration já aplicada (desligamentos_financeiro.sql).
--
-- Motivo: o lançamento futuro deixa de pedir "fonte documental" (guia, demonstrativo, outro documento). A confirmação expressa do RH
-- passa a ser a própria validação, e internamente a origem fica registrada como 'informado_rh' ("Informado e confirmado pelo RH"),
-- sem se passar por conferência de documento.
--
-- O que muda (somente AMPLIA a lista de origens aceitas; nada é enfraquecido):
--   • peopleflow_desligamentos_validacao_chk  → rescisao_fonte / grrf_fonte aceitam também 'informado_rh'.
--   • peopleflow_rubricas_grrf_chk            → grrf_fonte aceita também 'informado_rh'.
--
-- O que NÃO muda (continua exigido pelo banco, exatamente como antes):
--   • responsável (validada_por) preenchido e não vazio sempre que houver data de validação;
--   • data de validação (validada_em) obrigatória quando há responsável/fonte, e vice-versa (tudo-ou-nada);
--   • valor preenchido para validar; GRRF "não aplicável" = valor 0 + justificativa + fonte nula;
--   • total da GRRF = depósito + multa quando os dois existirem; valores >= 0;
--   • trilha de auditoria (peopleflow_fechamentos_log) somente inserção — as ações existentes são reaproveitadas.
--
-- Dados existentes: nenhuma linha é alterada. As 19 rescisões validadas (fonte 'folha_rescisao'), os 7 fechamentos, as 24 rubricas e a
-- trilha continuam válidos sob a lista ampliada (a verificação abaixo falha a migration se alguma linha deixar de satisfazer).
-- Idempotente. Reversível: desligamentos_financeiro_lancamento_simples_rollback.sql (recusa reverter se já houver 'informado_rh').
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- pré-condição: a migration financeira base precisa estar aplicada
do $pre$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_desligamentos' and column_name = 'rescisao_fonte') then
    raise exception 'Aplique antes desligamentos_financeiro.sql (colunas de validação ausentes).';
  end if;
end
$pre$;

-- ── 1. Fechamento por colaborador: mesma regra de validação, com a origem 'informado_rh' a mais ─────────
alter table public.peopleflow_desligamentos drop constraint if exists peopleflow_desligamentos_validacao_chk;
alter table public.peopleflow_desligamentos add constraint peopleflow_desligamentos_validacao_chk check (
  (rescisao_validada_em is null and rescisao_validada_por is null and rescisao_fonte is null
    or rescisao_validada_em is not null and btrim(coalesce(rescisao_validada_por, '')) <> '' and rescisao_fonte is not null
       and rescisao_fonte in ('folha_rescisao', 'demonstrativo_rescisao', 'outro_documento', 'informado_rh') and valor_rescisao is not null)
  and
  (grrf_validada_em is null and grrf_validada_por is null and grrf_fonte is null and grrf_nao_aplicavel = false and grrf_justificativa is null
    or grrf_validada_em is not null and btrim(coalesce(grrf_validada_por, '')) <> '' and valor_grrf is not null
       and ((grrf_nao_aplicavel and valor_grrf = 0 and btrim(coalesce(grrf_justificativa, '')) <> '' and grrf_fonte is null)
            or (not grrf_nao_aplicavel and grrf_fonte is not null and grrf_fonte in ('guia_grrf', 'demonstrativo_rescisao', 'outro_documento', 'informado_rh'))))
);

-- ── 2. Rubricas (rescisões da folha): GRRF informada e confirmada pelo RH ────────────────────────────────
alter table public.peopleflow_rescisoes_historico_rubricas drop constraint if exists peopleflow_rubricas_grrf_chk;
alter table public.peopleflow_rescisoes_historico_rubricas add constraint peopleflow_rubricas_grrf_chk check (
  grrf_fonte is null or grrf_fonte in ('guia_grrf', 'demonstrativo_rescisao', 'outro_documento', 'informado_rh')
);

comment on column public.peopleflow_desligamentos.rescisao_fonte is '''folha_rescisao'' (líquido da folha validado), ''demonstrativo_rescisao'' / ''outro_documento'' (legado) ou ''informado_rh'' (Informado e confirmado pelo RH — não é conferência de documento).';
comment on column public.peopleflow_desligamentos.grrf_fonte is '''guia_grrf'' / ''demonstrativo_rescisao'' / ''outro_documento'' (legado) ou ''informado_rh'' (Informado e confirmado pelo RH — não é conferência de documento). Nula quando a GRRF é não aplicável.';

-- ── 3. Verificação interna: nada existente pode ter ficado inválido (o ADD CONSTRAINT já validou; aqui só confirma e informa) ─────
do $chk$
declare
  v_desl int; v_rub int;
begin
  select count(*) into v_desl from public.peopleflow_desligamentos;
  select count(*) into v_rub from public.peopleflow_rescisoes_historico_rubricas;
  raise notice 'Lançamento simples: % fechamentos e % rubricas verificados sob as constraints ampliadas.', v_desl, v_rub;
end
$chk$;

commit;
