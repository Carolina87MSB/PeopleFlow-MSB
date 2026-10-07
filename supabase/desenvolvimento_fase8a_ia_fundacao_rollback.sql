-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 8A (fundação da IA) — REVERSÃO
-- ════════════════════════════════════════════════════════════════════════
-- Remove SOMENTE o que a 8A criou: 5 colunas, 8 constraints, 2 índices e a extensão da view, e RESTAURA as duas
-- funções de guarda e a view EXATAMENTE como a Fase 7 as criou. Não toca na Fase 7 (tabelas, linhas, políticas),
-- nem em LNT, PDI, Necessidades, Treinamentos.
--
-- SEGURANÇA: a reversão RECUSA se já existir qualquer dado de IA (interpretação IA, sugestão IA, ou coluna da 8A
-- preenchida), porque ele seria perdido. Faça um backup lógico e só então troque v_permitir_perda para true:
-- as colunas da 8A são apagadas (as linhas IA ficam, sem resultado/confiança/justificativa).
--
-- Um único bloco DO (uma só instrução, atômico). Rodar em Supabase > SQL Editor, o ARQUIVO INTEIRO.
-- ════════════════════════════════════════════════════════════════════════

do $rb$
declare
  v_permitir_perda boolean := false;   -- troque para true SOMENTE se aceitar perder dados de IA já gravados
  v_ia_interp integer := 0;
  v_ia_sug integer := 0;
  v_preenchidas integer := 0;
  v_n integer;
  v_txt text;
  v_pol_antes text;
  v_col_antes text;
  v_dados_antes text;
  v_pol_depois text;
  v_col_depois text;
  v_dados_depois text;
  v_triggers_antes integer;
begin
  if to_regclass('public.peopleflow_dev_pdi_interpretacoes') is null or to_regclass('public.peopleflow_dev_pdi_sugestoes') is null then
    raise exception 'REVERSÃO: tabelas da Fase 7 não encontradas — nada a reverter.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name = 'resultado_interpretacao') then
    raise exception 'REVERSÃO: a Fase 8A não está aplicada (coluna resultado_interpretacao inexistente) — nada a reverter.';
  end if;

  select count(*) into v_ia_interp from public.peopleflow_dev_pdi_interpretacoes where tipo = 'ia';
  select count(*) into v_ia_sug from public.peopleflow_dev_pdi_sugestoes where origem_sugestao = 'ia';
  select (select count(*) from public.peopleflow_dev_pdi_interpretacoes where pdi_item_id is not null or resultado_interpretacao is not null or observacao_interpretacao is not null)
       + (select count(*) from public.peopleflow_dev_pdi_sugestoes where confianca is not null or justificativa_interpretacao is not null)
    into v_preenchidas;
  if (v_ia_interp > 0 or v_ia_sug > 0 or v_preenchidas > 0) and not v_permitir_perda then
    raise exception 'REVERSÃO RECUSADA: existem dados de IA (% interpretação(ões) IA, % sugestão(ões) IA, % valor(es) nas colunas da 8A) que seriam perdidos. Faça backup e ajuste v_permitir_perda para true se quiser prosseguir.', v_ia_interp, v_ia_sug, v_preenchidas;
  end if;

  select count(*) into v_triggers_antes from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not tg.tgisinternal;
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

  -- (1) view da Fase 7 de volta (CREATE OR REPLACE não consegue remover colunas: DROP + CREATE + permissões da Fase 7)
  drop view public.peopleflow_dev_v_pdi_sugestoes;
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
  revoke all on public.peopleflow_dev_v_pdi_sugestoes from public, anon, authenticated;
  grant select on public.peopleflow_dev_v_pdi_sugestoes to authenticated, service_role;

  -- (2) guardas da Fase 7 de volta (texto idêntico ao da migration da Fase 7)
  create or replace function public.peopleflow_dev_pdi_interpretacoes_guarda()
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

  -- (3) índices, constraints e colunas da 8A
  drop index public.peopleflow_dev_pdi_interp_ia_andamento_uidx;
  drop index public.peopleflow_dev_pdi_sug_ia_neutra_uidx;
  alter table public.peopleflow_dev_pdi_interpretacoes
    drop constraint peopleflow_dev_pdi_interp_resultado_chk,
    drop constraint peopleflow_dev_pdi_interp_obs_chk,
    drop constraint peopleflow_dev_pdi_interp_item_chk,
    drop constraint peopleflow_dev_pdi_interp_ia_resultado_chk,
    drop constraint peopleflow_dev_pdi_interp_ia_itens_chk;
  alter table public.peopleflow_dev_pdi_sugestoes
    drop constraint peopleflow_dev_pdi_sug_confianca_chk,
    drop constraint peopleflow_dev_pdi_sug_justif_chk,
    drop constraint peopleflow_dev_pdi_sug_semantica_chk;
  alter table public.peopleflow_dev_pdi_interpretacoes drop column pdi_item_id, drop column resultado_interpretacao, drop column observacao_interpretacao;
  alter table public.peopleflow_dev_pdi_sugestoes drop column confianca, drop column justificativa_interpretacao;

  -- Conferência: nada da 8A sobrou e nada da Fase 7 / demais tabelas mudou.
  select string_agg(o, ', ') into v_txt from (
    select column_name as o from information_schema.columns where table_schema = 'public'
       and ((table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'))
         or (table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')))
    union all select indexname from pg_indexes where schemaname = 'public' and indexname in ('peopleflow_dev_pdi_interp_ia_andamento_uidx', 'peopleflow_dev_pdi_sug_ia_neutra_uidx')
    union all select conname from pg_constraint where conname in ('peopleflow_dev_pdi_interp_resultado_chk', 'peopleflow_dev_pdi_interp_obs_chk', 'peopleflow_dev_pdi_interp_item_chk',
         'peopleflow_dev_pdi_interp_ia_resultado_chk', 'peopleflow_dev_pdi_interp_ia_itens_chk', 'peopleflow_dev_pdi_sug_confianca_chk', 'peopleflow_dev_pdi_sug_justif_chk', 'peopleflow_dev_pdi_sug_semantica_chk')
  ) x;
  if v_txt is not null then raise exception 'REVERSÃO: objetos da 8A ainda existem: %', v_txt; end if;
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and ((p.proname = 'peopleflow_dev_pdi_interpretacoes_guarda' and p.prosrc like '%sem cobertura%') or (p.proname = 'peopleflow_dev_pdi_sugestoes_guarda' and p.prosrc like '%confianca%'));
  if v_n <> 0 then raise exception 'REVERSÃO: as guardas ainda têm regras da 8A'; end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_pdi_interpretacoes', 'peopleflow_dev_pdi_sugestoes', 'peopleflow_dev_pdi_sugestao_acoes') and not tg.tgisinternal;
  if v_n <> v_triggers_antes then raise exception 'REVERSÃO: a quantidade de triggers mudou (% → %)', v_triggers_antes, v_n; end if;
  if to_regclass('public.peopleflow_dev_v_pdi_sugestoes') is null
     or not has_table_privilege('authenticated', 'public.peopleflow_dev_v_pdi_sugestoes', 'SELECT') or has_table_privilege('anon', 'public.peopleflow_dev_v_pdi_sugestoes', 'SELECT')
     or not exists (select 1 from pg_class c where c.oid = 'public.peopleflow_dev_v_pdi_sugestoes'::regclass and c.reloptions @> array['security_invoker=true']) then
    raise exception 'REVERSÃO: a view da Fase 7 não voltou corretamente (existência, security_invoker ou permissões)';
  end if;

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
  if v_pol_depois is distinct from v_pol_antes or v_col_depois is distinct from v_col_antes or v_dados_depois is distinct from v_dados_antes then
    raise exception 'REVERSÃO: algo existente mudou durante a reversão (não deveria) — nada foi gravado.';
  end if;

  raise notice 'REVERSÃO OK: objetos da 8A removidos; guardas e view da Fase 7 restauradas; Fase 7, LNT e PDI intactos.';
end
$rb$;

select 'REVERSÃO OK — colunas da 8A restantes: '
    || (select count(*) from information_schema.columns where table_schema = 'public'
          and ((table_name = 'peopleflow_dev_pdi_interpretacoes' and column_name in ('pdi_item_id', 'resultado_interpretacao', 'observacao_interpretacao'))
            or (table_name = 'peopleflow_dev_pdi_sugestoes' and column_name in ('confianca', 'justificativa_interpretacao')))) as resultado;
