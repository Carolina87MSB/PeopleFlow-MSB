-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 8A (Fundação de dados da interpretação semântica com IA)
-- ════════════════════════════════════════════════════════════════════════
-- SOMENTE ESTRUTURA. Nenhuma IA é chamada, nenhum dado é criado, nenhuma linha existente muda.
--
-- Modelo (decisão de arquitetura):
--   INTERPRETAÇÃO (peopleflow_dev_pdi_interpretacoes) = a análise de UM item do PDI:
--       resultado geral do item + observação geral + 0, 1 ou N sugestões.
--   SUGESTÃO (peopleflow_dev_pdi_sugestoes) = uma possível Necessidade de Desenvolvimento:
--       confiança + justificativa + as ações de origem que a sustentam (peopleflow_dev_pdi_sugestao_acoes).
--
-- O que muda (tudo ADITIVO; colunas novas NULAS para legado e regra local):
--   • interpretacoes: + pdi_item_id, + resultado_interpretacao, + observacao_interpretacao
--       - pdi_item_id existe porque a tabela, até aqui, era uma EXECUÇÃO (a regra local analisa vários itens por vez)
--         e não identificava o item. Uma interpretação IA é de UM item (regra local continua em lote, com item nulo).
--       - resultado/observação NÃO são repetidos nas N sugestões: ficam aqui; a view os mostra por junção.
--   • sugestoes: + confianca, + justificativa_interpretacao (só origem 'ia'; ambas juntas ou nenhuma)
--       - Sugestão IA SEM confiança/justificativa = "neutra": artefato técnico da triagem que cobre as ações sem
--         necessidade (resultado evidencia_insuficiente/somente_acao_pdi, ou ações que não sustentam necessidade).
--         "A definir pelo RH" NÃO é uma necessidade identificada pela IA; o resultado verdadeiro está na interpretação.
--   • TRAVA ATÔMICA: no máximo 1 interpretação IA 'em_andamento' por item (índice único parcial em pdi_item_id).
--   • Guardas (triggers) das duas tabelas SUBSTITUÍDAS por versões que mantêm tudo o que a Fase 7 já garantia e
--     acrescentam: item da sugestão = item da interpretação; confiança/justificativa e item imutáveis; e, ao CONCLUIR
--     uma interpretação IA: resultado coerente com as sugestões e cobertura integral das ações em aberto do item.
--   • View peopleflow_dev_v_pdi_sugestoes: mesmas colunas + 4 no FINAL (security_invoker mantido).
--
-- NÃO cria tabela. NÃO mexe em Fase 7 (arquivos), LNT, PDI, Necessidades, RLS ou permissões existentes.
-- Reversão: desenvolvimento_fase8a_ia_fundacao_rollback.sql · Conferência: ..._validacao.sql
--
-- EXECUÇÃO: um único bloco DO (uma só instrução, atômico), com PRE-FLIGHT e POST-FLIGHT. NÃO é idempotente
-- de propósito (se algo da 8A já existir, o pre-flight para). Rodar em Supabase > SQL Editor, o ARQUIVO INTEIRO.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare
  v_n integer;
  v_txt text;
  v_pol_antes text;
  v_col_antes text;
  v_dados_antes text;
  v_pol_depois text;
  v_col_depois text;
  v_dados_depois text;
  v_n_interp integer;
  v_n_sug integer;
  v_triggers_antes integer;
begin
  -- ── PRE-FLIGHT ────────────────────────────────────────────────────────
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'PRE-FLIGHT: Postgres % — as views usam security_invoker (exige 15+).', current_setting('server_version');
  end if;

  select string_agg(o, ', ') into v_txt from (
    select 'tabela peopleflow_dev_pdi_interpretacoes' as o where to_regclass('public.peopleflow_dev_pdi_interpretacoes') is null
    union all select 'tabela peopleflow_dev_pdi_sugestoes' where to_regclass('public.peopleflow_dev_pdi_sugestoes') is null
    union all select 'tabela peopleflow_dev_pdi_sugestao_acoes' where to_regclass('public.peopleflow_dev_pdi_sugestao_acoes') is null
    union all select 'view peopleflow_dev_v_pdi_sugestoes' where to_regclass('public.peopleflow_dev_v_pdi_sugestoes') is null
    union all select 'view peopleflow_dev_v_pdi_acoes_triagem' where to_regclass('public.peopleflow_dev_v_pdi_acoes_triagem') is null
    union all select 'tabela peopleflow_pdi_itens' where to_regclass('public.peopleflow_pdi_itens') is null
    union all select 'tabela peopleflow_pdi_acoes' where to_regclass('public.peopleflow_pdi_acoes') is null
    union all select 'tabelas da LNT (Fase 6)' where to_regclass('public.peopleflow_dev_lnt_ciclos') is null or to_regclass('public.peopleflow_dev_lnt_itens') is null or to_regclass('public.peopleflow_dev_lnt_necessidades') is null
    union all select 'função peopleflow_dev_pdi_interpretacoes_guarda()' where to_regprocedure('public.peopleflow_dev_pdi_interpretacoes_guarda()') is null
    union all select 'função peopleflow_dev_pdi_sugestoes_guarda()' where to_regprocedure('public.peopleflow_dev_pdi_sugestoes_guarda()') is null
  ) x;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: a Fase 7 (Etapa 1A) não está completa — faltam: %', v_txt;
  end if;

  select string_agg(o, ', ') into v_txt from (
    select 'coluna interpretacoes.' || column_name as o from information_schema.columns
     where table_schema = 'public' and table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao')
    union all select 'coluna sugestoes.' || column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')
    union all select 'índice ' || indexname from pg_indexes
     where schemaname = 'public' and indexname in ('peopleflow_dev_pdi_interp_ia_andamento_uidx', 'peopleflow_dev_pdi_sug_ia_neutra_uidx')
  ) x;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: já existe(m): % — esta migration não foi feita para rodar duas vezes.', v_txt;
  end if;

  -- As guardas atuais precisam ser as da Fase 7 (ainda sem os campos da 8A).
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname in ('peopleflow_dev_pdi_interpretacoes_guarda', 'peopleflow_dev_pdi_sugestoes_guarda')
     and ((p.proname = 'peopleflow_dev_pdi_interpretacoes_guarda' and (p.prosrc like '%sem cobertura%' or p.prosrc not like '%imutáveis%'))
       or (p.proname = 'peopleflow_dev_pdi_sugestoes_guarda' and (p.prosrc like '%confianca%' or p.prosrc not like '%imutáveis%')));
  if v_n <> 0 then
    raise exception 'PRE-FLIGHT: as funções de guarda não são as da Fase 7 (já alteradas?) — nada foi feito.';
  end if;

  select count(*) into v_n from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia';
  if v_n <> 0 then
    raise exception 'PRE-FLIGHT: já existem % interpretação(ões) do tipo ia — a Fase 7 não previa IA; investigar antes.', v_n;
  end if;

  select count(*) into v_triggers_antes from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not tg.tgisinternal;
  select count(*) into v_n_interp from public.peopleflow_dev_pdi_interpretacoes;
  select count(*) into v_n_sug from public.peopleflow_dev_pdi_sugestoes;
  raise notice 'PRE-FLIGHT: % interpretação(ões) (regra local) e % sugestão(ões) existentes — nenhuma será alterada.', v_n_interp, v_n_sug;

  -- Fotografia do que JÁ existe, para provar no pós-voo que nada existente foi alterado.
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_antes from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_antes from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%'
     and table_name not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes');
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_ciclos x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.item_id, x.necessidade_id) from public.peopleflow_dev_lnt_necessidades x), '') || '#' ||
      -- tabelas da Fase 7: as linhas existentes não podem mudar (as colunas novas ficam de fora da conta: nascem nulas)
      coalesce((select string_agg((to_jsonb(x) - array['pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_interpretacoes x), '') || '#' ||
      coalesce((select string_agg((to_jsonb(x) - array['confianca', 'justificativa_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestoes x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestao_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text) into v_dados_antes;

  -- ── 1. Interpretações: item, resultado geral e observação geral ───────
  alter table public.peopleflow_dev_pdi_interpretacoes
    add column pdi_item_id text,
    add column resultado_interpretacao text,
    add column observacao_interpretacao text;

  alter table public.peopleflow_dev_pdi_interpretacoes
    add constraint peopleflow_dev_pdi_interp_resultado_chk check (
      resultado_interpretacao is null or resultado_interpretacao in ('necessidade_identificada', 'multiplas_necessidades', 'evidencia_insuficiente', 'somente_acao_pdi')),
    add constraint peopleflow_dev_pdi_interp_obs_chk check (
      observacao_interpretacao is null or (btrim(observacao_interpretacao) <> '' and length(observacao_interpretacao) <= 500)),
    -- IA = sempre de UM item; regra local (execução em lote) = sem item
    add constraint peopleflow_dev_pdi_interp_item_chk check (
      (tipo = 'ia' and pdi_item_id is not null and btrim(pdi_item_id) <> '') or (tipo <> 'ia' and pdi_item_id is null)),
    -- resultado e observação só existem na IA e só depois de concluída; regra local/legado ficam exatamente como estavam
    add constraint peopleflow_dev_pdi_interp_ia_resultado_chk check (
      (tipo = 'ia' and ((status = 'concluida') = (resultado_interpretacao is not null)) and (status = 'concluida' or observacao_interpretacao is null))
      or (tipo <> 'ia' and resultado_interpretacao is null and observacao_interpretacao is null)),
    add constraint peopleflow_dev_pdi_interp_ia_itens_chk check (tipo <> 'ia' or itens_analisados <= 1);

  -- TRAVA ATÔMICA: no máximo 1 interpretação IA em andamento para o MESMO item
  -- (chave = pdi_item_id, restrita a tipo = 'ia' e status = 'em_andamento'; a regra local não participa: item nulo).
  create unique index peopleflow_dev_pdi_interp_ia_andamento_uidx on public.peopleflow_dev_pdi_interpretacoes (pdi_item_id)
    where tipo = 'ia' and status = 'em_andamento';

  -- ── 2. Sugestões: confiança e justificativa da interpretação ──────────
  alter table public.peopleflow_dev_pdi_sugestoes
    add column confianca text,
    add column justificativa_interpretacao text;

  alter table public.peopleflow_dev_pdi_sugestoes
    add constraint peopleflow_dev_pdi_sug_confianca_chk check (confianca is null or confianca in ('alta', 'media', 'baixa')),
    add constraint peopleflow_dev_pdi_sug_justif_chk check (
      justificativa_interpretacao is null or (btrim(justificativa_interpretacao) <> '' and length(justificativa_interpretacao) <= 1000)),
    -- só IA; confiança e justificativa sempre juntas (com = necessidade sugerida pela IA; sem = sugestão neutra/artefato)
    add constraint peopleflow_dev_pdi_sug_semantica_chk check (
      (origem_sugestao = 'ia' and (confianca is null) = (justificativa_interpretacao is null))
      or (origem_sugestao <> 'ia' and confianca is null and justificativa_interpretacao is null));

  -- no máximo 1 sugestão neutra (artefato técnico) por interpretação
  create unique index peopleflow_dev_pdi_sug_ia_neutra_uidx on public.peopleflow_dev_pdi_sugestoes (interpretacao_id)
    where origem_sugestao = 'ia' and confianca is null;

  comment on column public.peopleflow_dev_pdi_interpretacoes.pdi_item_id is
    'Item do PDI analisado. Preenchido só em interpretação IA (1 item por interpretação); nulo na regra local (execução em lote). Sem chave estrangeira de propósito (salvar o PDI recria itens).';
  comment on column public.peopleflow_dev_pdi_interpretacoes.resultado_interpretacao is
    'Resultado geral do item (IA): necessidade_identificada | multiplas_necessidades | evidencia_insuficiente | somente_acao_pdi. Só em interpretação IA concluída. O resultado verdadeiro mora AQUI, não nas sugestões.';
  comment on column public.peopleflow_dev_pdi_interpretacoes.observacao_interpretacao is
    'Observação geral curta da IA sobre o item. Só em interpretação IA concluída.';
  comment on column public.peopleflow_dev_pdi_sugestoes.confianca is
    'Confiança da IA (alta | media | baixa) nesta necessidade sugerida. Nula = sugestão neutra (artefato técnico que cobre ações sem necessidade; "A definir pelo RH" NÃO é necessidade identificada pela IA).';
  comment on column public.peopleflow_dev_pdi_sugestoes.justificativa_interpretacao is
    'Justificativa curta da IA para esta necessidade sugerida. Nula junto com a confiança em sugestão neutra.';

  -- ── 3. Guardas: as da Fase 7 + as regras da 8A (substituídas por CREATE OR REPLACE) ──
  create or replace function public.peopleflow_dev_pdi_interpretacoes_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  declare
    v_sem integer;
    v_neutras integer;
    v_total integer;
    v_descobertas integer;
  begin
    if tg_op = 'INSERT' then
      if new.status <> 'em_andamento' then
        raise exception 'Interpretação do PDI: nasce em_andamento.' using errcode = 'P0001';
      end if;
      -- Fase 8A: a interpretação IA é de UM item do PDI (que precisa existir). Sem chave estrangeira de propósito:
      -- salvar o PDI apaga e recria itens, e isso não pode ser bloqueado por um histórico de interpretações.
      if new.tipo = 'ia' then
        perform 1 from public.peopleflow_pdi_itens i where i.id = new.pdi_item_id;
        if not found then
          raise exception 'Interpretação do PDI: item do PDI não localizado.' using errcode = 'P0001';
        end if;
      end if;
      return new;
    end if;
    if new.id is distinct from old.id or new.tipo is distinct from old.tipo or new.solicitada_por is distinct from old.solicitada_por
       or new.solicitada_por_colaborador_id is distinct from old.solicitada_por_colaborador_id or new.solicitada_em is distinct from old.solicitada_em
       or new.provedor is distinct from old.provedor or new.modelo is distinct from old.modelo
       or new.versao_prompt is distinct from old.versao_prompt or new.versao_regra is distinct from old.versao_regra
       or new.pdi_item_id is distinct from old.pdi_item_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Interpretação do PDI: quem pediu, quando, tipo, item, provedor, modelo e versões são imutáveis.' using errcode = 'P0001';
    end if;
    if old.status <> 'em_andamento' then
      raise exception 'Interpretação do PDI já encerrada (%): não pode mais ser alterada.', old.status using errcode = 'P0001';
    end if;
    -- Fase 8A: ao CONCLUIR uma interpretação IA, resultado, sugestões e cobertura das ações precisam fechar.
    if new.status = 'concluida' and new.tipo = 'ia' then
      select count(*) filter (where s.confianca is not null), count(*) filter (where s.confianca is null), count(*)
        into v_sem, v_neutras, v_total
        from public.peopleflow_dev_pdi_sugestoes s where s.interpretacao_id = new.id;
      if new.itens_analisados is distinct from 1 then
        raise exception 'Interpretação do PDI: uma interpretação IA analisa exatamente 1 item.' using errcode = 'P0001';
      end if;
      if new.sugestoes_geradas is distinct from v_total then
        raise exception 'Interpretação do PDI: sugestoes_geradas (%) não confere com as sugestões gravadas (%).', new.sugestoes_geradas, v_total using errcode = 'P0001';
      end if;
      -- "neutra" = artefato técnico da triagem (sem confiança/justificativa): nunca é uma necessidade identificada pela IA
      if v_neutras > 1 then
        raise exception 'Interpretação do PDI: no máximo 1 sugestão neutra (ações sem necessidade) por interpretação.' using errcode = 'P0001';
      end if;
      if (new.resultado_interpretacao = 'necessidade_identificada' and v_sem <> 1)
         or (new.resultado_interpretacao = 'multiplas_necessidades' and v_sem < 2)
         or (new.resultado_interpretacao in ('evidencia_insuficiente', 'somente_acao_pdi') and (v_sem <> 0 or v_neutras <> 1)) then
        raise exception 'Interpretação do PDI: o resultado (%) não confere com as sugestões (% com necessidade, % neutra).', new.resultado_interpretacao, v_sem, v_neutras using errcode = 'P0001';
      end if;
      -- cobertura integral: toda ação em aberto do item precisa estar coberta por uma sugestão ativa (necessidade sugerida ou "sem necessidade")
      select count(*) into v_descobertas from public.peopleflow_pdi_acoes a
       where a.item_id = new.pdi_item_id and a.status not in ('Concluída', 'Cancelada') and btrim(a.descricao) <> ''
         and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.pdi_acao_id = a.id and sa.ativa);
      if v_descobertas > 0 then
        raise exception 'Interpretação do PDI: % ação(ões) em aberto do item ficaram sem cobertura (necessidade sugerida ou "sem necessidade").', v_descobertas using errcode = 'P0001';
      end if;
    end if;
    return new;
  end $f$;

  create or replace function public.peopleflow_dev_pdi_sugestoes_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  declare
    v_run record;
    v_item record;
    v_nec record;
    v_n integer;
  begin
    if tg_op = 'INSERT' then
      if new.estado <> 'pendente' then
        raise exception 'Sugestão do PDI: nasce pendente (a decisão vem depois).' using errcode = 'P0001';
      end if;
      if new.origem_sugestao in ('regra_local', 'ia') then
        select tipo, status, pdi_item_id into v_run from public.peopleflow_dev_pdi_interpretacoes where id = new.interpretacao_id;
        if v_run.tipo is distinct from new.origem_sugestao then
          raise exception 'Sugestão do PDI: a origem (%) não confere com o tipo da execução.', new.origem_sugestao using errcode = 'P0001';
        end if;
        if v_run.status <> 'em_andamento' then
          raise exception 'Sugestão do PDI: a execução já foi encerrada.' using errcode = 'P0001';
        end if;
        -- Fase 8A: uma interpretação IA é de UM item; a sugestão tem de ser do mesmo item.
        if new.origem_sugestao = 'ia' and v_run.pdi_item_id is distinct from new.pdi_item_id then
          raise exception 'Sugestão do PDI: o item da sugestão não confere com o item da interpretação.' using errcode = 'P0001';
        end if;
      end if;
      if new.derivada_de_id is not null then
        perform 1 from public.peopleflow_dev_pdi_sugestoes s where s.id = new.derivada_de_id and s.pdi_item_id = new.pdi_item_id;
        if not found then
          raise exception 'Sugestão do PDI: a sugestão de origem deve existir e ser do mesmo item.' using errcode = 'P0001';
        end if;
      end if;
      if new.origem_sugestao <> 'legado' then
        -- a fotografia do item é sempre tirada pelo banco, a partir do PDI atual (não confia no cliente)
        select i.pdi_id, i.competencia_nome, i.tipo_competencia, i.objetivo_desenvolvimento into v_item
          from public.peopleflow_pdi_itens i where i.id = new.pdi_item_id;
        if not found or v_item.pdi_id <> new.pdi_id then
          raise exception 'Sugestão do PDI: item do PDI não localizado (ou de outro PDI).' using errcode = 'P0001';
        end if;
        new.item_competencia_nome := v_item.competencia_nome;
        new.item_tipo_competencia := v_item.tipo_competencia;
        new.item_objetivo := coalesce(v_item.objetivo_desenvolvimento, '');
        new.hash_origem := public.peopleflow_dev_pdi_hash_item(new.pdi_item_id);
      end if;
      return new;
    end if;

    -- UPDATE: só por mudança de estado; campos de origem e fotografia são imutáveis.
    if new.id is distinct from old.id or new.interpretacao_id is distinct from old.interpretacao_id
       or new.origem_sugestao is distinct from old.origem_sugestao or new.derivada_de_id is distinct from old.derivada_de_id
       or new.pdi_id is distinct from old.pdi_id or new.pdi_item_id is distinct from old.pdi_item_id
       or new.item_competencia_nome is distinct from old.item_competencia_nome or new.item_tipo_competencia is distinct from old.item_tipo_competencia
       or new.item_objetivo is distinct from old.item_objetivo or new.hash_origem is distinct from old.hash_origem
       or new.texto_sugerido is distinct from old.texto_sugerido or new.tema is distinct from old.tema
       or new.categoria_sugerida is distinct from old.categoria_sugerida
       or new.confianca is distinct from old.confianca or new.justificativa_interpretacao is distinct from old.justificativa_interpretacao
       or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Sugestão do PDI: origem, fotografia do item e texto sugerido são imutáveis.' using errcode = 'P0001';
    end if;
    if new.estado = old.estado then
      raise exception 'Sugestão do PDI: só pode mudar por decisão (mudança de estado).' using errcode = 'P0001';
    end if;
    if not ((old.estado = 'pendente' and new.estado in ('validada', 'mantida_no_pdi', 'substituida'))
            or (old.estado = 'mantida_no_pdi' and new.estado = 'substituida')) then
      raise exception 'Sugestão do PDI: transição não permitida (% → %).', old.estado, new.estado using errcode = 'P0001';
    end if;

    if new.estado in ('validada', 'mantida_no_pdi') then
      select count(*) into v_n from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = new.id;
      if v_n = 0 then
        raise exception 'Sugestão do PDI: sem ação de origem — não pode ser decidida.' using errcode = 'P0001';
      end if;
    end if;

    if new.estado = 'validada' then
      select n.origem, n.pdi_id, n.pdi_item_id, n.pdi_acao_id into v_nec from public.peopleflow_dev_necessidades n where n.id = new.necessidade_id;
      if not found then
        raise exception 'Sugestão do PDI: necessidade vinculada não encontrada.' using errcode = 'P0001';
      end if;
      -- Regra de compatibilidade com a Base: a necessidade é do PDI, do mesmo item, e a ação que ela
      -- referencia (legado: UMA ação, a principal) precisa estar entre as ações de origem da sugestão.
      if v_nec.origem <> 'pdi' or v_nec.pdi_id is distinct from new.pdi_id or v_nec.pdi_item_id is distinct from new.pdi_item_id
         or not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = new.id and sa.pdi_acao_id = v_nec.pdi_acao_id) then
        raise exception 'Sugestão do PDI: a necessidade vinculada precisa ser do mesmo PDI/item e referenciar uma das ações de origem da sugestão.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end $f$;

  -- ── 4. View: mesmas colunas, 4 novas no FINAL; security_invoker e permissões mantidos ──
  create or replace view public.peopleflow_dev_v_pdi_sugestoes with (security_invoker = true) as
  select s.id, s.interpretacao_id, s.origem_sugestao, s.derivada_de_id, s.pdi_id, s.pdi_item_id,
         s.item_competencia_nome, s.item_tipo_competencia, s.item_objetivo, s.hash_origem,
         s.texto_sugerido, s.tema, s.categoria_sugerida, s.estado, s.texto_final, s.editada,
         s.decidido_por, s.decidido_em, s.motivo_decisao, s.necessidade_id, s.created_at,
         x.acoes_total, x.acoes_alteradas, x.acoes_removidas,
         (x.acoes_alteradas > 0 or x.acoes_removidas > 0) as origem_alterada,
         (public.peopleflow_dev_pdi_hash_item(s.pdi_item_id) is distinct from s.hash_origem) as contexto_do_item_alterado,
         ((x.acoes_alteradas > 0 or x.acoes_removidas > 0) and s.estado in ('validada', 'mantida_no_pdi')) as origem_alterada_apos_decisao,
         case when s.estado = 'pendente' and (x.acoes_alteradas > 0 or x.acoes_removidas > 0) then 'desatualizada'
              when s.estado = 'validada' and s.editada then 'editada_validada'
              else s.estado end as estado_exibicao,
         s.confianca, s.justificativa_interpretacao, i.resultado_interpretacao, i.observacao_interpretacao
    from public.peopleflow_dev_pdi_sugestoes s
    left join public.peopleflow_dev_pdi_interpretacoes i on i.id = s.interpretacao_id
    cross join lateral (
      select count(*)::integer as acoes_total,
             (count(*) filter (where a.id is not null and public.peopleflow_dev_pdi_hash_texto(a.descricao) <> sa.hash_texto))::integer as acoes_alteradas,
             (count(*) filter (where a.id is null))::integer as acoes_removidas
        from public.peopleflow_dev_pdi_sugestao_acoes sa
        left join public.peopleflow_pdi_acoes a on a.id = sa.pdi_acao_id
       where sa.sugestao_id = s.id) x
   where (select public.peopleflow_dev_meu_perfil()) = 'RH';

  -- ── POST-FLIGHT ───────────────────────────────────────────────────────
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and is_nullable = 'YES' and data_type = 'text'
     and ((table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'))
       or (table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')));
  if v_n <> 5 then raise exception 'POST-FLIGHT: % de 5 colunas novas (texto, nulas)', v_n; end if;

  select count(*) into v_n from pg_constraint
   where conname in ('peopleflow_dev_pdi_interp_resultado_chk', 'peopleflow_dev_pdi_interp_obs_chk', 'peopleflow_dev_pdi_interp_item_chk',
                     'peopleflow_dev_pdi_interp_ia_resultado_chk', 'peopleflow_dev_pdi_interp_ia_itens_chk',
                     'peopleflow_dev_pdi_sug_confianca_chk', 'peopleflow_dev_pdi_sug_justif_chk', 'peopleflow_dev_pdi_sug_semantica_chk');
  if v_n <> 8 then raise exception 'POST-FLIGHT: % de 8 constraints novas', v_n; end if;

  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and indexname in ('peopleflow_dev_pdi_interp_ia_andamento_uidx', 'peopleflow_dev_pdi_sug_ia_neutra_uidx') and indexdef like '%UNIQUE%' and indexdef like '%WHERE%';
  if v_n <> 2 then raise exception 'POST-FLIGHT: % de 2 índices únicos parciais novos', v_n; end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and ((p.proname = 'peopleflow_dev_pdi_interpretacoes_guarda' and p.prosrc like '%pdi_item_id is distinct from old.pdi_item_id%' and p.prosrc like '%sem cobertura%' and p.prosrc like '%imutáveis%')
       or (p.proname = 'peopleflow_dev_pdi_sugestoes_guarda' and p.prosrc like '%confianca is distinct from old.confianca%' and p.prosrc like '%não confere com o item da interpretação%' and p.prosrc like '%imutáveis%'));
  if v_n <> 2 then raise exception 'POST-FLIGHT: % de 2 funções de guarda atualizadas', v_n; end if;

  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not tg.tgisinternal;
  if v_n <> v_triggers_antes then raise exception 'POST-FLIGHT: a quantidade de triggers mudou (% → %)', v_triggers_antes, v_n; end if;

  -- View: 4 colunas novas por último, security_invoker mantido, só leitura (RH via política) e anon sem nada
  select string_agg(a.attname::text, ',' order by a.attnum) into v_txt
    from pg_attribute a where a.attrelid = 'public.peopleflow_dev_v_pdi_sugestoes'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attnum > (select max(a2.attnum) - 4 from pg_attribute a2 where a2.attrelid = a.attrelid and a2.attnum > 0 and not a2.attisdropped);
  if v_txt is distinct from 'confianca,justificativa_interpretacao,resultado_interpretacao,observacao_interpretacao' then
    raise exception 'POST-FLIGHT: as 4 colunas novas da view não estão no final (%)', v_txt;
  end if;
  if not exists (select 1 from pg_class c where c.oid = 'public.peopleflow_dev_v_pdi_sugestoes'::regclass and c.reloptions @> array['security_invoker=true']) then
    raise exception 'POST-FLIGHT: a view perdeu security_invoker';
  end if;
  if not has_table_privilege('authenticated', 'public.peopleflow_dev_v_pdi_sugestoes', 'SELECT')
     or has_table_privilege('authenticated', 'public.peopleflow_dev_v_pdi_sugestoes', 'INSERT') or has_table_privilege('authenticated', 'public.peopleflow_dev_v_pdi_sugestoes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.peopleflow_dev_v_pdi_sugestoes', 'DELETE') or has_table_privilege('anon', 'public.peopleflow_dev_v_pdi_sugestoes', 'SELECT') then
    raise exception 'POST-FLIGHT: permissões da view mudaram';
  end if;
  select count(*) into v_n from unnest(array['peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes']) t
   where has_table_privilege('authenticated', 'public.' || t, 'INSERT') or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || t, 'DELETE') or has_table_privilege('anon', 'public.' || t, 'SELECT');
  if v_n <> 0 then raise exception 'POST-FLIGHT: permissão indevida para authenticated/anon nas tabelas'; end if;

  -- As linhas existentes (regra local, legado) ficam com as colunas novas NULAS.
  select count(*) into v_n from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id is not null or resultado_interpretacao is not null or observacao_interpretacao is not null;
  if v_n <> 0 then raise exception 'POST-FLIGHT: % interpretação(ões) existente(s) com coluna nova preenchida', v_n; end if;
  select count(*) into v_n from public.peopleflow_dev_pdi_sugestoes where confianca is not null or justificativa_interpretacao is not null;
  if v_n <> 0 then raise exception 'POST-FLIGHT: % sugestão(ões) existente(s) com coluna nova preenchida', v_n; end if;
  if (select count(*) from public.peopleflow_dev_pdi_interpretacoes) <> v_n_interp or (select count(*) from public.peopleflow_dev_pdi_sugestoes) <> v_n_sug then
    raise exception 'POST-FLIGHT: a quantidade de interpretações/sugestões mudou';
  end if;

  -- Nada existente mudou: políticas, colunas das demais tabelas e linhas.
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_depois from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_depois from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%'
     and table_name not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes');
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_ciclos x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_lnt_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.item_id, x.necessidade_id) from public.peopleflow_dev_lnt_necessidades x), '') || '#' ||
      -- tabelas da Fase 7: as linhas existentes não podem mudar (as colunas novas ficam de fora da conta: nascem nulas)
      coalesce((select string_agg((to_jsonb(x) - array['pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_interpretacoes x), '') || '#' ||
      coalesce((select string_agg((to_jsonb(x) - array['confianca', 'justificativa_interpretacao'])::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestoes x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_pdi_sugestao_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text) into v_dados_depois;
  if v_pol_depois is distinct from v_pol_antes then raise exception 'POST-FLIGHT: políticas (RLS) foram alteradas'; end if;
  if v_col_depois is distinct from v_col_antes then raise exception 'POST-FLIGHT: colunas de outras tabelas foram alteradas'; end if;
  if v_dados_depois is distinct from v_dados_antes then raise exception 'POST-FLIGHT: linhas existentes (necessidades, PDI, LNT, Fase 7, auditoria, treinamentos) mudaram — nada foi gravado'; end if;

  raise notice 'FASE 8A OK: 5 colunas, 8 constraints, 2 índices únicos parciais, 2 guardas e 1 view atualizados; nada existente mudou.';
end
$mig$;

select 'FASE 8A OK — colunas novas: 5 · interpretações: ' || (select count(*) from public.peopleflow_dev_pdi_interpretacoes)
    || ' · sugestões: ' || (select count(*) from public.peopleflow_dev_pdi_sugestoes)
    || ' · interpretações IA: ' || (select count(*) from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia') as resultado;
