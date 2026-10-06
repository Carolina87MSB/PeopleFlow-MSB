-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 7 (Fundação da triagem PDI → Necessidade de Desenvolvimento)
-- ════════════════════════════════════════════════════════════════════════
-- PARA REVISÃO — AINDA NÃO EXECUTADA EM LUGAR NENHUM (testada só em réplica em memória).
--
-- Muda a UNIDADE de triagem: de "ação do PDI" para "item do PDI" (competência/KPI + objetivo +
-- 1 ou mais ações). O item é a unidade de ANÁLISE; dele nascem N sugestões de Necessidade de
-- Desenvolvimento (0, 1 ou, excepcionalmente, mais), cada uma ligada às ações que a originaram.
-- Somente a validação do RH cria a Necessidade na Base. Nada aqui altera PDI, ação, competência/KPI,
-- LNT, treinamentos ou AVD.
--
-- CRIA (somente acréscimo):
--   3 tabelas   peopleflow_dev_pdi_interpretacoes   execuções de interpretação (regra local ou, no futuro, IA)
--               peopleflow_dev_pdi_sugestoes        sugestão de Necessidade, por item do PDI
--               peopleflow_dev_pdi_sugestao_acoes   ações de origem de cada sugestão (fotografia do texto)
--   2 views     peopleflow_dev_v_pdi_sugestoes      sugestão + "origem alterada?" (derivado, nunca gravado)
--               peopleflow_dev_v_pdi_acoes_triagem  destino de cada ação atual do PDI
--   funções     hash/normalização do texto, guardas (triggers) e o backfill idempotente do legado
--
-- ESPELHA o que já foi decidido (SEM apagar nem reescrever nada do legado):
--   • cada Necessidade com origem PDI  → 1 sugestão "legado" validada, ligada à ação de origem;
--   • cada ação "mantida somente no PDI" (peopleflow_dev_pdi_sugestoes_dispensadas) → 1 sugestão
--     "legado" mantida_no_pdi, ligada à ação.
--   As tabelas legadas continuam intactas (histórico e índice de duplicidade); depois desta fase a
--   fonte de verdade da triagem passa a ser peopleflow_dev_pdi_sugestao_acoes (ver DESENHO.md).
--
-- ÚNICA mudança em tabelas existentes (opcional, v_guardas_legado): 3 triggers de guarda — UPDATE OF
-- de colunas de vínculo PDI em peopleflow_dev_necessidades (só dispara se o valor MUDAR e a
-- necessidade estiver vinculada a uma sugestão), e INSERT em necessidades (origem pdi) e em
-- sugestões dispensadas, que recusam decidir de novo uma ação já decidida na triagem. Nenhuma coluna,
-- política, índice ou dado existente muda. Para ficar 100% aditivo, troque v_guardas_legado para false.
--
-- Segurança: RLS em tudo; o navegador só LÊ (RH); anon nada; escrita só pelo servidor (service_role);
-- sem exclusão física; auditoria continua em peopleflow_dev_auditoria (gravada pelo servidor, sem
-- estrutura paralela). Gestor, Diretoria e Colaborador: sem acesso à triagem de PDI.
--
-- EXECUÇÃO: um único bloco DO (uma só instrução, atômico), com PRE-FLIGHT e POST-FLIGHT. NÃO é
-- idempotente de propósito (se algo já existir, o pre-flight para). Rodar em Supabase > SQL Editor.
-- Reversão: desenvolvimento_fase7_triagem_pdi_rollback.sql · Conferência: ..._validacao.sql
-- Repetir só o espelhamento do legado (seguro, idempotente), se houver decisões novas feitas pela
-- tela antiga antes da Etapa 1B:  select * from public.peopleflow_dev_pdi_backfill_legado();
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare
  v_guardas_legado boolean := true;   -- false = não cria os 3 triggers de guarda nas tabelas legadas
  v_n integer;
  v_esperado integer;
  v_txt text;
  v_pol_antes text;
  v_col_antes text;
  v_dados_antes text;
  v_pol_depois text;
  v_col_depois text;
  v_dados_depois text;
  v_nec_pdi integer;
  v_disp integer;
  v_bf record;
begin
  -- ── PRE-FLIGHT ────────────────────────────────────────────────────────
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'PRE-FLIGHT: Postgres % — as views desta fase usam security_invoker (exige 15+).', current_setting('server_version');
  end if;

  select string_agg(o, ', ') into v_txt from (
    select 'tabela peopleflow_pdi' as o where to_regclass('public.peopleflow_pdi') is null
    union all select 'tabela peopleflow_pdi_itens' where to_regclass('public.peopleflow_pdi_itens') is null
    union all select 'tabela peopleflow_pdi_acoes' where to_regclass('public.peopleflow_pdi_acoes') is null
    union all select 'tabela peopleflow_dev_necessidades' where to_regclass('public.peopleflow_dev_necessidades') is null
    union all select 'tabela peopleflow_dev_pdi_sugestoes_dispensadas' where to_regclass('public.peopleflow_dev_pdi_sugestoes_dispensadas') is null
    union all select 'tabela peopleflow_dev_auditoria' where to_regclass('public.peopleflow_dev_auditoria') is null
    union all select 'tabela colaboradores' where to_regclass('public.colaboradores') is null
    union all select 'função peopleflow_dev_set_updated_at()' where to_regprocedure('public.peopleflow_dev_set_updated_at()') is null
    union all select 'função peopleflow_dev_bloquear_exclusao()' where to_regprocedure('public.peopleflow_dev_bloquear_exclusao()') is null
    union all select 'função peopleflow_dev_meu_perfil()' where to_regprocedure('public.peopleflow_dev_meu_perfil()') is null
  ) x;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: objetos esperados não encontrados (Fases 1 a 6 aplicadas?): %', v_txt;
  end if;

  select string_agg(t, ', ') into v_txt from unnest(array[
    'peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes',
    'peopleflow_dev_v_pdi_sugestoes', 'peopleflow_dev_v_pdi_acoes_triagem']) t
   where to_regclass('public.' || t) is not null;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: já existe(m): % — esta migration não foi feita para rodar duas vezes.', v_txt;
  end if;

  select string_agg(f, ', ') into v_txt from unnest(array[
    'peopleflow_dev_pdi_norm_texto(text)', 'peopleflow_dev_pdi_hash_texto(text)', 'peopleflow_dev_pdi_hash_item(text)',
    'peopleflow_dev_pdi_interpretacoes_guarda()', 'peopleflow_dev_pdi_sugestoes_guarda()', 'peopleflow_dev_pdi_sugestoes_propaga()',
    'peopleflow_dev_pdi_sugestao_acoes_guarda()', 'peopleflow_dev_pdi_guarda_necessidade_vinculo()',
    'peopleflow_dev_pdi_guarda_necessidade_insert()', 'peopleflow_dev_pdi_guarda_dispensada_insert()',
    'peopleflow_dev_pdi_backfill_legado()']) f
   where to_regprocedure('public.' || f) is not null;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: já existe(m) função(ões): %', v_txt;
  end if;

  select count(*) into v_nec_pdi from public.peopleflow_dev_necessidades where origem = 'pdi';
  select count(*) into v_disp from public.peopleflow_dev_pdi_sugestoes_dispensadas;
  raise notice 'PRE-FLIGHT: legado a espelhar — % necessidade(s) com origem PDI, % ação(ões) mantida(s) somente no PDI.', v_nec_pdi, v_disp;

  -- Fotografia do que JÁ existe, para provar no pós-voo que nada existente foi alterado.
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_antes from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_antes from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%';
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text)
    into v_dados_antes;

  -- ── Funções de texto/hash (iguais para servidor, view e backfill) ─────
  -- Normalização: só espaços/tabs/quebras de linha repetidos viram um espaço; aparar as pontas.
  -- (Propositalmente restrita a ASCII para dar o mesmo resultado em qualquer cliente.)
  create function public.peopleflow_dev_pdi_norm_texto(p text)
  returns text language sql immutable set search_path = public as $f$
    select btrim(regexp_replace(coalesce(p, ''), '[ \t\r\n]+', ' ', 'g'))
  $f$;

  create function public.peopleflow_dev_pdi_hash_texto(p text)
  returns text language sql immutable set search_path = public as $f$
    select md5(public.peopleflow_dev_pdi_norm_texto(p))
  $f$;

  -- Fotografia do ITEM: competência/KPI + objetivo + (id:hash do texto) de TODAS as ações do item
  -- (qualquer status). Muda se o objetivo mudar ou se uma ação for editada, incluída ou removida;
  -- NÃO muda com status/prazo/responsável.
  create function public.peopleflow_dev_pdi_hash_item(p_item_id text)
  returns text language sql stable set search_path = public as $f$
    select md5(
      public.peopleflow_dev_pdi_norm_texto(i.competencia_nome) || E'\n' ||
      public.peopleflow_dev_pdi_norm_texto(i.objetivo_desenvolvimento) || E'\n' ||
      coalesce((select string_agg(a.id || ':' || public.peopleflow_dev_pdi_hash_texto(a.descricao), ',' order by a.id)
                  from public.peopleflow_pdi_acoes a where a.item_id = i.id), ''))
    from public.peopleflow_pdi_itens i where i.id = p_item_id
  $f$;

  -- ── 1. Execuções de interpretação ─────────────────────────────────────
  create table public.peopleflow_dev_pdi_interpretacoes (
    id bigint generated always as identity primary key,
    tipo text not null,
    status text not null default 'em_andamento',
    solicitada_por uuid not null,
    solicitada_por_colaborador_id bigint references public.colaboradores (id),
    solicitada_em timestamptz not null default now(),
    provedor text,
    modelo text,
    versao_prompt text,
    versao_regra text,
    hash_conteudo text,
    itens_analisados integer not null default 0,
    sugestoes_geradas integer not null default 0,
    tokens_entrada integer,
    tokens_saida integer,
    erro_tecnico text,
    concluida_em timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint peopleflow_dev_pdi_interp_tipo_chk check (tipo in ('regra_local', 'ia')),
    constraint peopleflow_dev_pdi_interp_status_chk check (status in ('em_andamento', 'concluida', 'falhou')),
    constraint peopleflow_dev_pdi_interp_coerencia_chk check (
      (status = 'em_andamento' and concluida_em is null and erro_tecnico is null)
      or (status = 'concluida' and concluida_em is not null and erro_tecnico is null)
      or (status = 'falhou' and concluida_em is not null and btrim(coalesce(erro_tecnico, '')) <> '')),
    constraint peopleflow_dev_pdi_interp_ia_chk check (
      tipo <> 'ia' or (btrim(coalesce(provedor, '')) <> '' and btrim(coalesce(modelo, '')) <> '' and btrim(coalesce(versao_prompt, '')) <> '')),
    constraint peopleflow_dev_pdi_interp_local_chk check (
      tipo <> 'regra_local' or (btrim(coalesce(versao_regra, '')) <> '' and provedor is null and modelo is null and versao_prompt is null)),
    constraint peopleflow_dev_pdi_interp_contagens_chk check (
      itens_analisados >= 0 and sugestoes_geradas >= 0 and coalesce(tokens_entrada, 0) >= 0 and coalesce(tokens_saida, 0) >= 0),
    constraint peopleflow_dev_pdi_interp_hash_chk check (hash_conteudo is null or hash_conteudo ~ '^[0-9a-f]{32}$')
  );
  create index peopleflow_dev_pdi_interp_solicitada_idx on public.peopleflow_dev_pdi_interpretacoes (solicitada_em desc);

  -- ── 2. Sugestões de Necessidade (por item do PDI) ─────────────────────
  create table public.peopleflow_dev_pdi_sugestoes (
    id bigint generated always as identity primary key,
    interpretacao_id bigint references public.peopleflow_dev_pdi_interpretacoes (id),
    origem_sugestao text not null,
    derivada_de_id bigint references public.peopleflow_dev_pdi_sugestoes (id),
    pdi_id bigint not null references public.peopleflow_pdi (id),
    pdi_item_id text not null,
    -- Fotografia do item no momento da sugestão (preenchida pelo próprio banco; só cópia, o PDI não muda):
    item_competencia_nome text not null,
    item_tipo_competencia text,
    item_objetivo text not null default '',
    hash_origem text not null,
    texto_sugerido text not null,
    tema text,
    categoria_sugerida text,
    estado text not null default 'pendente',
    texto_final text,
    decidido_por uuid,
    decidido_em timestamptz,
    motivo_decisao text,
    necessidade_id bigint references public.peopleflow_dev_necessidades (id),
    editada boolean generated always as (estado = 'validada' and texto_final is distinct from texto_sugerido) stored,
    created_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    constraint peopleflow_dev_pdi_sug_origem_chk check (origem_sugestao in ('regra_local', 'ia', 'rh', 'legado')),
    constraint peopleflow_dev_pdi_sug_execucao_chk check ((origem_sugestao in ('regra_local', 'ia')) = (interpretacao_id is not null)),
    constraint peopleflow_dev_pdi_sug_derivada_chk check (derivada_de_id is null or derivada_de_id <> id),
    constraint peopleflow_dev_pdi_sug_estado_chk check (estado in ('pendente', 'validada', 'mantida_no_pdi', 'substituida')),
    constraint peopleflow_dev_pdi_sug_coerencia_chk check (
      (estado = 'pendente' and necessidade_id is null and texto_final is null and decidido_em is null and decidido_por is null)
      or (estado = 'validada' and necessidade_id is not null and btrim(coalesce(texto_final, '')) <> '' and decidido_em is not null
          and (decidido_por is not null or origem_sugestao = 'legado'))
      or (estado = 'mantida_no_pdi' and necessidade_id is null and texto_final is null and decidido_em is not null
          and (decidido_por is not null or origem_sugestao = 'legado'))
      or (estado = 'substituida' and necessidade_id is null and texto_final is null and decidido_em is not null and decidido_por is not null)),
    constraint peopleflow_dev_pdi_sug_texto_chk check (btrim(texto_sugerido) <> '' and length(texto_sugerido) <= 500 and (texto_final is null or length(texto_final) <= 500)),
    constraint peopleflow_dev_pdi_sug_tema_chk check (tema is null or (btrim(tema) <> '' and length(tema) <= 120)),
    constraint peopleflow_dev_pdi_sug_categoria_chk check (
      categoria_sugerida is null or categoria_sugerida in ('tecnica', 'qualidade_regulatorio', 'seguranca', 'sistemas_ferramentas', 'comportamental', 'lideranca', 'integracao', 'outra')),
    constraint peopleflow_dev_pdi_sug_hash_chk check (hash_origem ~ '^[0-9a-f]{32}$')
  );
  create unique index peopleflow_dev_pdi_sug_necessidade_uidx on public.peopleflow_dev_pdi_sugestoes (necessidade_id) where necessidade_id is not null;
  create index peopleflow_dev_pdi_sug_item_idx on public.peopleflow_dev_pdi_sugestoes (pdi_item_id);
  create index peopleflow_dev_pdi_sug_pdi_idx on public.peopleflow_dev_pdi_sugestoes (pdi_id);
  create index peopleflow_dev_pdi_sug_estado_idx on public.peopleflow_dev_pdi_sugestoes (estado);
  create index peopleflow_dev_pdi_sug_interp_idx on public.peopleflow_dev_pdi_sugestoes (interpretacao_id);

  -- ── 3. Ações de origem de cada sugestão ───────────────────────────────
  create table public.peopleflow_dev_pdi_sugestao_acoes (
    id bigint generated always as identity primary key,
    sugestao_id bigint not null references public.peopleflow_dev_pdi_sugestoes (id),
    pdi_item_id text not null,
    pdi_acao_id text not null,
    acao_texto text not null,     -- fotografia do texto da ação (preenchida pelo banco, a partir do PDI)
    hash_texto text generated always as (public.peopleflow_dev_pdi_hash_texto(acao_texto)) stored,
    ativa boolean not null default true,   -- mantida por trigger: false quando a sugestão é substituída
    created_at timestamptz not null default now(),
    constraint peopleflow_dev_pdi_sugacao_uk unique (sugestao_id, pdi_acao_id),
    constraint peopleflow_dev_pdi_sugacao_texto_chk check (btrim(acao_texto) <> '')
  );
  -- Uma ação não pode estar em duas sugestões ATIVAS. Sugestões substituídas liberam a ação (separar/refazer).
  create unique index peopleflow_dev_pdi_sugacao_ativa_uidx on public.peopleflow_dev_pdi_sugestao_acoes (pdi_acao_id) where ativa;
  create index peopleflow_dev_pdi_sugacao_item_idx on public.peopleflow_dev_pdi_sugestao_acoes (pdi_item_id);

  comment on table public.peopleflow_dev_pdi_interpretacoes is
    'Execução de interpretação das ações do PDI (regra local ou, no futuro, IA): quem pediu, quando, modelo/versão, hash do conteúdo, uso e status. Sem dado pessoal. Imutável depois de encerrada.';
  comment on table public.peopleflow_dev_pdi_sugestoes is
    'Possível Necessidade de Desenvolvimento sugerida a partir de UM item do PDI (1 item → N sugestões). Só a validação do RH cria a Necessidade (necessidade_id). Fotografia do item e do texto fixada pelo banco; "origem alterada" é derivada na view, nunca reescrita.';
  comment on table public.peopleflow_dev_pdi_sugestao_acoes is
    'Ações do PDI que originaram a sugestão (fotografia do texto). FONTE DE VERDADE de "quais ações originaram a necessidade" e do destino de cada ação. peopleflow_dev_necessidades.pdi_acao_id é só o ponteiro legado para a ação principal.';
  comment on column public.peopleflow_dev_pdi_sugestoes.estado is
    'pendente → validada | mantida_no_pdi | substituida;  mantida_no_pdi → substituida (reconsiderar, futuro). validada e substituida são terminais.';

  -- ── Guardas (triggers) ────────────────────────────────────────────────
  create function public.peopleflow_dev_pdi_interpretacoes_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if tg_op = 'INSERT' then
      if new.status <> 'em_andamento' then
        raise exception 'Interpretação do PDI: nasce em_andamento.' using errcode = 'P0001';
      end if;
      return new;
    end if;
    if new.id is distinct from old.id or new.tipo is distinct from old.tipo or new.solicitada_por is distinct from old.solicitada_por
       or new.solicitada_por_colaborador_id is distinct from old.solicitada_por_colaborador_id or new.solicitada_em is distinct from old.solicitada_em
       or new.provedor is distinct from old.provedor or new.modelo is distinct from old.modelo
       or new.versao_prompt is distinct from old.versao_prompt or new.versao_regra is distinct from old.versao_regra
       or new.created_at is distinct from old.created_at then
      raise exception 'Interpretação do PDI: quem pediu, quando, tipo, provedor, modelo e versões são imutáveis.' using errcode = 'P0001';
    end if;
    if old.status <> 'em_andamento' then
      raise exception 'Interpretação do PDI já encerrada (%): não pode mais ser alterada.', old.status using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  create function public.peopleflow_dev_pdi_sugestoes_guarda()
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
        select tipo, status into v_run from public.peopleflow_dev_pdi_interpretacoes where id = new.interpretacao_id;
        if v_run.tipo is distinct from new.origem_sugestao then
          raise exception 'Sugestão do PDI: a origem (%) não confere com o tipo da execução.', new.origem_sugestao using errcode = 'P0001';
        end if;
        if v_run.status <> 'em_andamento' then
          raise exception 'Sugestão do PDI: a execução já foi encerrada.' using errcode = 'P0001';
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

  -- Quando a sugestão é substituída, as ações dela ficam livres para outra sugestão (separar ações / refazer).
  create function public.peopleflow_dev_pdi_sugestoes_propaga()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if new.estado = 'substituida' and old.estado <> 'substituida' then
      update public.peopleflow_dev_pdi_sugestao_acoes set ativa = false where sugestao_id = new.id;
    end if;
    return null;
  end $f$;

  create function public.peopleflow_dev_pdi_sugestao_acoes_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  declare
    v_sug record;
    v_acao record;
  begin
    if tg_op = 'INSERT' then
      select s.estado, s.pdi_item_id, s.origem_sugestao into v_sug from public.peopleflow_dev_pdi_sugestoes s where s.id = new.sugestao_id;
      if not found then
        raise exception 'Ação de origem: sugestão não encontrada.' using errcode = 'P0001';
      end if;
      if v_sug.estado <> 'pendente' then
        raise exception 'Ação de origem: só se incluem ações enquanto a sugestão está pendente.' using errcode = 'P0001';
      end if;
      if new.pdi_item_id is distinct from v_sug.pdi_item_id then
        raise exception 'Ação de origem: a ação precisa ser do mesmo item da sugestão.' using errcode = 'P0001';
      end if;
      if v_sug.origem_sugestao <> 'legado' then
        -- a fotografia do texto é sempre tirada pelo banco, a partir do PDI atual
        select a.descricao into v_acao from public.peopleflow_pdi_acoes a where a.id = new.pdi_acao_id and a.item_id = new.pdi_item_id;
        if not found then
          raise exception 'Ação de origem: ação do PDI não localizada neste item.' using errcode = 'P0001';
        end if;
        new.acao_texto := v_acao.descricao;
      end if;
      new.ativa := true;
      return new;
    end if;
    -- UPDATE: somente "ativa", e somente por trigger (propagação da substituição) — nunca direto.
    if pg_trigger_depth() < 2 or new.id is distinct from old.id or new.sugestao_id is distinct from old.sugestao_id
       or new.pdi_item_id is distinct from old.pdi_item_id or new.pdi_acao_id is distinct from old.pdi_acao_id
       or new.acao_texto is distinct from old.acao_texto or new.created_at is distinct from old.created_at then
      raise exception 'Ação de origem: fotografia e vínculo são imutáveis.' using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  create trigger peopleflow_dev_pdi_interpretacoes_updated_at before update on public.peopleflow_dev_pdi_interpretacoes
    for each row execute function public.peopleflow_dev_set_updated_at();
  create trigger peopleflow_dev_pdi_interpretacoes_guarda before insert or update on public.peopleflow_dev_pdi_interpretacoes
    for each row execute function public.peopleflow_dev_pdi_interpretacoes_guarda();
  create trigger peopleflow_dev_pdi_interpretacoes_sem_delete before delete on public.peopleflow_dev_pdi_interpretacoes
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_pdi_interpretacoes_sem_truncate before truncate on public.peopleflow_dev_pdi_interpretacoes
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();

  create trigger peopleflow_dev_pdi_sugestoes_updated_at before update on public.peopleflow_dev_pdi_sugestoes
    for each row execute function public.peopleflow_dev_set_updated_at();
  create trigger peopleflow_dev_pdi_sugestoes_guarda before insert or update on public.peopleflow_dev_pdi_sugestoes
    for each row execute function public.peopleflow_dev_pdi_sugestoes_guarda();
  create trigger peopleflow_dev_pdi_sugestoes_propaga after update on public.peopleflow_dev_pdi_sugestoes
    for each row execute function public.peopleflow_dev_pdi_sugestoes_propaga();
  create trigger peopleflow_dev_pdi_sugestoes_sem_delete before delete on public.peopleflow_dev_pdi_sugestoes
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_pdi_sugestoes_sem_truncate before truncate on public.peopleflow_dev_pdi_sugestoes
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();

  create trigger peopleflow_dev_pdi_sugestao_acoes_guarda before insert or update on public.peopleflow_dev_pdi_sugestao_acoes
    for each row execute function public.peopleflow_dev_pdi_sugestao_acoes_guarda();
  create trigger peopleflow_dev_pdi_sugestao_acoes_sem_delete before delete on public.peopleflow_dev_pdi_sugestao_acoes
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_pdi_sugestao_acoes_sem_truncate before truncate on public.peopleflow_dev_pdi_sugestao_acoes
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();

  -- ── Guardas opcionais nas tabelas legadas (v_guardas_legado) ──────────
  create function public.peopleflow_dev_pdi_guarda_necessidade_vinculo()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if (new.origem is distinct from old.origem or new.colaborador_id is distinct from old.colaborador_id or new.pdi_id is distinct from old.pdi_id
        or new.pdi_item_id is distinct from old.pdi_item_id or new.pdi_acao_id is distinct from old.pdi_acao_id)
       and exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = old.id) then
      raise exception 'Necessidade vinculada a uma sugestão do PDI: origem, colaborador e ação de origem não podem ser alterados.' using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  -- errcode 23505 (unique_violation) DE PROPÓSITO: é o código que as ações atuais do servidor já tratam como "ação já decidida"
  -- (409 com mensagem própria). Com outro código a tentativa viraria erro 500 técnico no fluxo atual.
  create function public.peopleflow_dev_pdi_guarda_necessidade_insert()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if new.origem = 'pdi' and new.pdi_acao_id is not null and exists (
         select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa
           join public.peopleflow_dev_pdi_sugestoes s on s.id = sa.sugestao_id
          where sa.pdi_acao_id = new.pdi_acao_id and sa.ativa and s.estado in ('validada', 'mantida_no_pdi')) then
      raise exception 'Esta ação do PDI já tem decisão na triagem (necessidade confirmada ou mantida somente no PDI).' using errcode = '23505';
    end if;
    return new;
  end $f$;

  -- (mesmo motivo: errcode 23505 preserva a resposta 409 atual)
  create function public.peopleflow_dev_pdi_guarda_dispensada_insert()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if exists (
         select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa
           join public.peopleflow_dev_pdi_sugestoes s on s.id = sa.sugestao_id
          where sa.pdi_acao_id = new.pdi_acao_id and sa.ativa and s.estado in ('validada', 'mantida_no_pdi')) then
      raise exception 'Esta ação do PDI já tem decisão na triagem (necessidade confirmada ou mantida somente no PDI).' using errcode = '23505';
    end if;
    return new;
  end $f$;

  if v_guardas_legado then
    create trigger peopleflow_dev_necessidades_pdi_vinculo before update of origem, colaborador_id, pdi_id, pdi_item_id, pdi_acao_id on public.peopleflow_dev_necessidades
      for each row execute function public.peopleflow_dev_pdi_guarda_necessidade_vinculo();
    create trigger peopleflow_dev_necessidades_pdi_decisao before insert on public.peopleflow_dev_necessidades
      for each row execute function public.peopleflow_dev_pdi_guarda_necessidade_insert();
    create trigger peopleflow_dev_pdi_dispensadas_decisao before insert on public.peopleflow_dev_pdi_sugestoes_dispensadas
      for each row execute function public.peopleflow_dev_pdi_guarda_dispensada_insert();
  end if;

  -- ── Backfill idempotente do legado (espelha; não altera o legado) ─────
  create function public.peopleflow_dev_pdi_backfill_legado()
  returns table (confirmadas_espelhadas integer, mantidas_espelhadas integer, ja_espelhadas integer, nao_espelhadas_sem_item integer, nao_espelhadas_conflito integer)
  language plpgsql set search_path = public as $f$
  declare
    r record;
    v_item record;
    v_acao record;
    v_sug bigint;
    v_txt text;
    c_conf integer := 0;
    c_mant integer := 0;
    c_ja integer := 0;
    c_sem integer := 0;
    c_conflito integer := 0;
  begin
    -- (1) Necessidades confirmadas a partir do PDI → sugestão legado validada
    for r in select n.* from public.peopleflow_dev_necessidades n where n.origem = 'pdi' and n.pdi_acao_id is not null order by n.id loop
      if exists (select 1 from public.peopleflow_dev_pdi_sugestoes s where s.necessidade_id = r.id) then
        c_ja := c_ja + 1; continue;
      end if;
      if r.pdi_item_id is null or r.pdi_id is null then
        c_sem := c_sem + 1; continue;
      end if;
      if exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.pdi_acao_id = r.pdi_acao_id and sa.ativa) then
        c_conflito := c_conflito + 1; continue;
      end if;
      select i.competencia_nome, i.tipo_competencia, i.objetivo_desenvolvimento into v_item from public.peopleflow_pdi_itens i where i.id = r.pdi_item_id;
      select a.descricao into v_acao from public.peopleflow_pdi_acoes a where a.id = r.pdi_acao_id and a.item_id = r.pdi_item_id;
      insert into public.peopleflow_dev_pdi_sugestoes
        (origem_sugestao, pdi_id, pdi_item_id, item_competencia_nome, item_tipo_competencia, item_objetivo, hash_origem,
         texto_sugerido, categoria_sugerida, created_at)
      values ('legado', r.pdi_id, r.pdi_item_id, coalesce(v_item.competencia_nome, nullif(btrim(r.pdi_item_nome), ''), '(item não localizado)'),
              v_item.tipo_competencia, coalesce(v_item.objetivo_desenvolvimento, ''),
              coalesce(public.peopleflow_dev_pdi_hash_item(r.pdi_item_id), md5('legado:necessidade:' || r.id)),
              left(r.descricao, 500), r.categoria, coalesce(r.validada_em, r.created_at))
      returning id into v_sug;
      -- Fotografia da ação: o texto atual do PDI, se ainda é o que foi confirmado; senão o texto aprovado na necessidade
      -- (assim uma alteração POSTERIOR do PDI aparece como "origem alterada" e não é escondida).
      v_txt := case when v_acao.descricao is not null
                     and (v_acao.descricao = r.descricao or left(v_acao.descricao, 500) = r.descricao
                          or public.peopleflow_dev_pdi_norm_texto(v_acao.descricao) = public.peopleflow_dev_pdi_norm_texto(r.descricao))
                    then v_acao.descricao else r.descricao end;
      insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values (v_sug, r.pdi_item_id, r.pdi_acao_id, v_txt);
      update public.peopleflow_dev_pdi_sugestoes
         set estado = 'validada', necessidade_id = r.id, texto_final = left(r.descricao, 500),
             decidido_por = r.validada_por, decidido_em = coalesce(r.validada_em, r.created_at)
       where id = v_sug;
      c_conf := c_conf + 1;
    end loop;

    -- (2) Ações "mantidas somente no PDI" (tabela de sugestões dispensadas) → sugestão legado mantida_no_pdi
    for r in select d.* from public.peopleflow_dev_pdi_sugestoes_dispensadas d order by d.dispensada_em, d.pdi_acao_id loop
      if exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.pdi_acao_id = r.pdi_acao_id and sa.ativa) then
        -- já espelhada (execução anterior) ou em conflito com outra sugestão ativa
        if exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa join public.peopleflow_dev_pdi_sugestoes s on s.id = sa.sugestao_id
                    where sa.pdi_acao_id = r.pdi_acao_id and sa.ativa and s.origem_sugestao = 'legado' and s.estado = 'mantida_no_pdi') then
          c_ja := c_ja + 1;
        else
          c_conflito := c_conflito + 1;
        end if;
        continue;
      end if;
      select a.id, a.item_id, a.descricao, i.pdi_id as item_pdi_id, i.competencia_nome, i.tipo_competencia, i.objetivo_desenvolvimento into v_acao
        from public.peopleflow_pdi_acoes a join public.peopleflow_pdi_itens i on i.id = a.item_id where a.id = r.pdi_acao_id;
      if not found then
        c_sem := c_sem + 1; continue;
      end if;
      v_txt := coalesce(nullif(btrim(v_acao.descricao), ''), '(ação sem texto)');
      insert into public.peopleflow_dev_pdi_sugestoes
        (origem_sugestao, pdi_id, pdi_item_id, item_competencia_nome, item_tipo_competencia, item_objetivo, hash_origem, texto_sugerido, created_at)
      values ('legado', coalesce(r.pdi_id, v_acao.item_pdi_id), v_acao.item_id, v_acao.competencia_nome, v_acao.tipo_competencia,
              coalesce(v_acao.objetivo_desenvolvimento, ''), public.peopleflow_dev_pdi_hash_item(v_acao.item_id), left(v_txt, 500), r.dispensada_em)
      returning id into v_sug;
      insert into public.peopleflow_dev_pdi_sugestao_acoes (sugestao_id, pdi_item_id, pdi_acao_id, acao_texto) values (v_sug, v_acao.item_id, r.pdi_acao_id, v_txt);
      update public.peopleflow_dev_pdi_sugestoes
         set estado = 'mantida_no_pdi', decidido_por = r.dispensada_por, decidido_em = r.dispensada_em, motivo_decisao = r.motivo
       where id = v_sug;
      c_mant := c_mant + 1;
    end loop;

    return query select c_conf, c_mant, c_ja, c_sem, c_conflito;
  end $f$;

  -- ── Views (derivadas; nada é gravado) ─────────────────────────────────
  -- "Origem alterada" é calculado na leitura, comparando a fotografia com o PDI de agora. Nunca reescreve
  -- a sugestão nem a necessidade; para uma sugestão já decidida é um EVENTO POSTERIOR (origem_alterada_apos_decisao).
  create view public.peopleflow_dev_v_pdi_sugestoes with (security_invoker = true) as
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
              else s.estado end as estado_exibicao
    from public.peopleflow_dev_pdi_sugestoes s
    cross join lateral (
      select count(*)::integer as acoes_total,
             (count(*) filter (where a.id is not null and public.peopleflow_dev_pdi_hash_texto(a.descricao) <> sa.hash_texto))::integer as acoes_alteradas,
             (count(*) filter (where a.id is null))::integer as acoes_removidas
        from public.peopleflow_dev_pdi_sugestao_acoes sa
        left join public.peopleflow_pdi_acoes a on a.id = sa.pdi_acao_id
       where sa.sugestao_id = s.id) x
   where (select public.peopleflow_dev_meu_perfil()) = 'RH';

  create view public.peopleflow_dev_v_pdi_acoes_triagem with (security_invoker = true) as
  select a.id as pdi_acao_id, a.item_id as pdi_item_id, i.pdi_id, i.competencia_nome, i.tipo_competencia,
         a.descricao, a.status as acao_status, sa.sugestao_id, s.estado as sugestao_estado,
         case s.estado when 'validada' then 'confirmada'
                       when 'mantida_no_pdi' then 'mantida_no_pdi'
                       when 'pendente' then 'sugestao_pendente'
                       else 'sem_decisao' end as destino
    from public.peopleflow_pdi_acoes a
    join public.peopleflow_pdi_itens i on i.id = a.item_id
    left join public.peopleflow_dev_pdi_sugestao_acoes sa on sa.pdi_acao_id = a.id and sa.ativa
    left join public.peopleflow_dev_pdi_sugestoes s on s.id = sa.sugestao_id
   where (select public.peopleflow_dev_meu_perfil()) = 'RH';

  -- ── RLS (somente leitura para o navegador; só o RH) ───────────────────
  alter table public.peopleflow_dev_pdi_interpretacoes enable row level security;
  alter table public.peopleflow_dev_pdi_sugestoes enable row level security;
  alter table public.peopleflow_dev_pdi_sugestao_acoes enable row level security;

  create policy dev_pdi_interpretacoes_leitura on public.peopleflow_dev_pdi_interpretacoes for select to authenticated
    using ((select public.peopleflow_dev_meu_perfil()) = 'RH');
  create policy dev_pdi_sugestoes_leitura on public.peopleflow_dev_pdi_sugestoes for select to authenticated
    using ((select public.peopleflow_dev_meu_perfil()) = 'RH');
  create policy dev_pdi_sugestao_acoes_leitura on public.peopleflow_dev_pdi_sugestao_acoes for select to authenticated
    using ((select public.peopleflow_dev_meu_perfil()) = 'RH');

  -- ── Permissões: navegador só lê; anon nada; gravação só pelo servidor ─
  revoke all on public.peopleflow_dev_pdi_interpretacoes, public.peopleflow_dev_pdi_sugestoes, public.peopleflow_dev_pdi_sugestao_acoes from public, anon, authenticated;
  grant select on public.peopleflow_dev_pdi_interpretacoes, public.peopleflow_dev_pdi_sugestoes, public.peopleflow_dev_pdi_sugestao_acoes to authenticated;
  grant all on public.peopleflow_dev_pdi_interpretacoes, public.peopleflow_dev_pdi_sugestoes, public.peopleflow_dev_pdi_sugestao_acoes to service_role;

  revoke all on public.peopleflow_dev_v_pdi_sugestoes, public.peopleflow_dev_v_pdi_acoes_triagem from public, anon, authenticated;
  grant select on public.peopleflow_dev_v_pdi_sugestoes, public.peopleflow_dev_v_pdi_acoes_triagem to authenticated, service_role;

  revoke all on function public.peopleflow_dev_pdi_norm_texto(text), public.peopleflow_dev_pdi_hash_texto(text), public.peopleflow_dev_pdi_hash_item(text) from public, anon;
  grant execute on function public.peopleflow_dev_pdi_norm_texto(text), public.peopleflow_dev_pdi_hash_texto(text), public.peopleflow_dev_pdi_hash_item(text) to authenticated, service_role;
  revoke all on function public.peopleflow_dev_pdi_backfill_legado() from public, anon, authenticated;
  grant execute on function public.peopleflow_dev_pdi_backfill_legado() to service_role;
  revoke all on function public.peopleflow_dev_pdi_interpretacoes_guarda(), public.peopleflow_dev_pdi_sugestoes_guarda(), public.peopleflow_dev_pdi_sugestoes_propaga(),
    public.peopleflow_dev_pdi_sugestao_acoes_guarda(), public.peopleflow_dev_pdi_guarda_necessidade_vinculo(),
    public.peopleflow_dev_pdi_guarda_necessidade_insert(), public.peopleflow_dev_pdi_guarda_dispensada_insert() from public, anon, authenticated;

  -- ── Espelhamento do legado (única escrita de dados desta migration, só nas tabelas NOVAS) ──
  select * into v_bf from public.peopleflow_dev_pdi_backfill_legado();
  raise notice 'BACKFILL: % necessidade(s) confirmada(s) espelhada(s), % mantida(s) somente no PDI espelhada(s), % já espelhada(s), % não espelhável(is) (sem item/ação), % em conflito.',
    v_bf.confirmadas_espelhadas, v_bf.mantidas_espelhadas, v_bf.ja_espelhadas, v_bf.nao_espelhadas_sem_item, v_bf.nao_espelhadas_conflito;
  if v_bf.nao_espelhadas_conflito > 0 then
    raise exception 'BACKFILL: % decisão(ões) do legado em conflito entre si — não deveria acontecer; nada foi gravado. Investigar antes de repetir.', v_bf.nao_espelhadas_conflito;
  end if;

  -- ── POST-FLIGHT ───────────────────────────────────────────────────────
  select count(*) into v_n from unnest(array['peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes']) t
   where to_regclass('public.' || t) is not null;
  if v_n <> 3 then raise exception 'POST-FLIGHT: % de 3 tabelas criadas', v_n; end if;
  select count(*) into v_n from unnest(array['peopleflow_dev_v_pdi_sugestoes', 'peopleflow_dev_v_pdi_acoes_triagem']) t where to_regclass('public.' || t) is not null;
  if v_n <> 2 then raise exception 'POST-FLIGHT: % de 2 views criadas', v_n; end if;

  select string_agg(c.relname, ', ') into v_txt from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not c.relrowsecurity;
  if v_txt is not null then raise exception 'POST-FLIGHT: RLS desligada em %', v_txt; end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes');
  if v_n <> 3 then raise exception 'POST-FLIGHT: % políticas nas tabelas novas (esperado 3, todas de SELECT)', v_n; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'POST-FLIGHT: política de escrita encontrada nas tabelas novas'; end if;

  select count(*) into v_n from unnest(array['peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes', 'peopleflow_dev_v_pdi_sugestoes', 'peopleflow_dev_v_pdi_acoes_triagem']) t
   where has_table_privilege('authenticated', 'public.' || t, 'INSERT') or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || t, 'DELETE') or has_table_privilege('anon', 'public.' || t, 'SELECT');
  if v_n <> 0 then raise exception 'POST-FLIGHT: permissão indevida para authenticated/anon nos objetos novos'; end if;

  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not tg.tgisinternal;
  if v_n <> 12 then raise exception 'POST-FLIGHT: % triggers nas tabelas novas (esperado 12)', v_n; end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where tg.tgname in ('peopleflow_dev_necessidades_pdi_vinculo', 'peopleflow_dev_necessidades_pdi_decisao', 'peopleflow_dev_pdi_dispensadas_decisao') and not tg.tgisinternal;
  v_esperado := case when v_guardas_legado then 3 else 0 end;
  if v_n <> v_esperado then raise exception 'POST-FLIGHT: % triggers de guarda nas tabelas legadas (esperado %)', v_n, v_esperado; end if;

  -- Espelhamento = legado: cada decisão do legado tem exatamente 1 sugestão legado com 1 ação.
  select count(*) into v_n from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'legado';
  if v_n <> v_bf.confirmadas_espelhadas + v_bf.mantidas_espelhadas then raise exception 'POST-FLIGHT: % sugestões legado (esperado %)', v_n, v_bf.confirmadas_espelhadas + v_bf.mantidas_espelhadas; end if;
  select count(*) into v_n from public.peopleflow_dev_pdi_sugestao_acoes;
  if v_n <> v_bf.confirmadas_espelhadas + v_bf.mantidas_espelhadas then raise exception 'POST-FLIGHT: % ações de origem (esperado %)', v_n, v_bf.confirmadas_espelhadas + v_bf.mantidas_espelhadas; end if;
  select count(*) into v_n from public.peopleflow_dev_pdi_sugestoes s join public.peopleflow_dev_necessidades n on n.id = s.necessidade_id
   where s.estado = 'validada' and not exists (select 1 from public.peopleflow_dev_pdi_sugestao_acoes sa where sa.sugestao_id = s.id and sa.pdi_acao_id = n.pdi_acao_id);
  if v_n <> 0 then raise exception 'POST-FLIGHT: % necessidade(s) cuja ação de origem não está entre as ações da sugestão', v_n; end if;
  select count(*) into v_n from public.peopleflow_dev_pdi_interpretacoes;
  if v_n <> 0 then raise exception 'POST-FLIGHT: a tabela de execuções deveria nascer vazia (sem IA nesta fase)'; end if;

  -- Nada existente mudou: políticas, colunas e linhas (necessidades, sugestões dispensadas, PDI, auditoria, treinamentos).
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_depois from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_'
     and tablename not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes');
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_depois from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_v_%'
     and table_name not in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes');
  select md5(
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_dev_necessidades x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.pdi_acao_id) from public.peopleflow_dev_pdi_sugestoes_dispensadas x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_itens x), '') || '#' ||
      coalesce((select string_agg(to_jsonb(x)::text, '|' order by x.id) from public.peopleflow_pdi_acoes x), '') || '#' ||
      (select count(*) from public.peopleflow_dev_auditoria)::text || '#' ||
      (select count(*) from public.peopleflow_dev_treinamentos)::text)
    into v_dados_depois;
  if v_pol_depois is distinct from v_pol_antes then raise exception 'POST-FLIGHT: políticas de tabelas existentes foram alteradas'; end if;
  if v_col_depois is distinct from v_col_antes then raise exception 'POST-FLIGHT: colunas de tabelas existentes foram alteradas'; end if;
  if v_dados_depois is distinct from v_dados_antes then raise exception 'POST-FLIGHT: linhas de necessidades/sugestões dispensadas/PDI/auditoria/treinamentos mudaram — nada foi gravado'; end if;

  raise notice 'FASE 7 OK: 3 tabelas e 2 views criadas, com RLS; legado espelhado sem alterar nada existente.';
end
$mig$;

select 'FASE 7 OK — sugestões (espelho do legado): ' || (select count(*) from public.peopleflow_dev_pdi_sugestoes)
    || ', ações de origem: ' || (select count(*) from public.peopleflow_dev_pdi_sugestao_acoes)
    || ', execuções: ' || (select count(*) from public.peopleflow_dev_pdi_interpretacoes) as resultado;
