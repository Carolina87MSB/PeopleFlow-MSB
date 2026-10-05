-- ════════════════════════════════════════════════════════════════════════
-- Módulo Desenvolvimento — Fase 6 (Núcleo da LNT)
-- ════════════════════════════════════════════════════════════════════════
-- SOMENTE ACRÉSCIMO. Cria 3 tabelas novas, com prefixo peopleflow_dev_lnt_*,
-- e funções auxiliares novas. NÃO altera, renomeia nem apaga nenhuma tabela,
-- coluna, política, trigger, função, view ou dado existente — de Necessidades,
-- Treinamentos, Habilidades/Requisitos, PDI, AVD ou qualquer outro módulo.
--
--   peopleflow_dev_lnt_ciclos         ciclo da LNT (ex.: LNT 2027)
--   peopleflow_dev_lnt_itens          item consolidado da LNT do ciclo
--   peopleflow_dev_lnt_necessidades   situação de cada necessidade no ciclo
--                                     (fotografia imutável da carga — status, prioridade,
--                                     departamento, alerta e o CONTEÚDO da necessidade:
--                                     descrição, justificativa e sugestão de capacitação —
--                                     mais a decisão da RH)
--
-- Pontos de contato com estruturas existentes (apenas chaves estrangeiras A
-- PARTIR das tabelas novas; nenhuma coluna/dado das tabelas de origem muda):
--   • peopleflow_dev_necessidades.id   (necessidade de origem — só leitura)
--   • peopleflow_dev_treinamentos.id   (alerta "treinamento já planejado")
--
-- Segurança (mesmo padrão do módulo): RLS em todas as tabelas; o navegador
-- (role authenticated) só tem SELECT, filtrado por perfil; nenhuma política
-- using(true); nenhuma permissão para anon; toda gravação passa pelo
-- servidor (service_role). Sem exclusão física (triggers bloqueiam
-- DELETE/TRUNCATE). A auditoria continua sendo peopleflow_dev_auditoria
-- (gravada pelo servidor) — nenhuma estrutura de auditoria nova.
--
-- Leitura: RH vê tudo; Gestor vê o ciclo, as necessidades da PRÓPRIA equipe
-- no ciclo (situação e motivo) e os itens que contêm alguma necessidade da
-- equipe; demais perfis nada. Diretoria/Responsável/Colaborador: sem acesso.
--
-- Trava do ciclo fechado: itens e necessidades do ciclo ficam imutáveis
-- (exceto a marcação "mudou desde a carga"); o ciclo só volta a aceitar
-- edição ao ser reaberto (reaberturas + 1).
--
-- EXECUÇÃO: um único bloco DO (uma só instrução) — atômico por si só, não
-- depende de BEGIN/COMMIT do editor. Tem PRE-FLIGHT (aborta antes de
-- escrever se o banco não estiver como esperado) e POST-FLIGHT (desfaz tudo
-- se o resultado não for o esperado). NÃO é idempotente de propósito: se as
-- tabelas já existirem, o pre-flight para e informa.
-- Rodar em Supabase > SQL Editor > New query, colando o arquivo inteiro.
-- Reversão: supabase/desenvolvimento_fase6_lnt_nucleo_rollback.sql
-- Conferência depois: supabase/desenvolvimento_fase6_lnt_nucleo_validacao.sql
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
begin
  -- ── PRE-FLIGHT ────────────────────────────────────────────────────────
  select string_agg(o, ', ') into v_txt from (
    select 'tabela peopleflow_dev_necessidades' as o where to_regclass('public.peopleflow_dev_necessidades') is null
    union all select 'tabela peopleflow_dev_treinamentos' where to_regclass('public.peopleflow_dev_treinamentos') is null
    union all select 'tabela peopleflow_dev_auditoria' where to_regclass('public.peopleflow_dev_auditoria') is null
    union all select 'função peopleflow_dev_set_updated_at()' where to_regprocedure('public.peopleflow_dev_set_updated_at()') is null
    union all select 'função peopleflow_dev_bloquear_exclusao()' where to_regprocedure('public.peopleflow_dev_bloquear_exclusao()') is null
    union all select 'função peopleflow_dev_meu_perfil()' where to_regprocedure('public.peopleflow_dev_meu_perfil()') is null
    union all select 'função peopleflow_dev_pode_ver_colaborador(bigint)' where to_regprocedure('public.peopleflow_dev_pode_ver_colaborador(bigint)') is null
  ) x;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: objetos esperados não encontrados (Fases 1 a 5 aplicadas?): %', v_txt;
  end if;

  select string_agg(t, ', ') into v_txt from unnest(array['peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades']) t
   where to_regclass('public.' || t) is not null;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: já existe(m): % — esta migration não foi feita para rodar duas vezes.', v_txt;
  end if;

  select string_agg(f, ', ') into v_txt from unnest(array[
    'peopleflow_dev_lnt_direcionadores_validos(text[])', 'peopleflow_dev_lnt_necessidade_visivel(bigint)', 'peopleflow_dev_lnt_item_visivel(bigint)',
    'peopleflow_dev_lnt_ciclo_guarda()', 'peopleflow_dev_lnt_itens_guarda()', 'peopleflow_dev_lnt_necessidades_guarda()']) f
   where to_regprocedure('public.' || f) is not null;
  if v_txt is not null then
    raise exception 'PRE-FLIGHT: já existe(m) função(ões): %', v_txt;
  end if;

  -- Fotografia do que JÁ existe (políticas, colunas e linhas das tabelas do PeopleFlow),
  -- para provar no pós-voo que nada existente foi alterado.
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_antes from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_antes from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_';
  select (select count(*) from public.peopleflow_dev_necessidades)::text || '/' || (select count(*) from public.peopleflow_dev_treinamentos)::text
         || '/' || (select count(*) from public.peopleflow_dev_auditoria)::text
    into v_dados_antes;

  -- ── Funções auxiliares (novas) ────────────────────────────────────────
  -- Vocabulário controlado dos direcionadores (sem repetição).
  create function public.peopleflow_dev_lnt_direcionadores_validos(p text[])
  returns boolean language sql immutable set search_path = public as $f$
    select p is not null
       and p <@ array[
         'requisito_legal_regulatorio', 'risco_qualidade', 'seguranca', 'necessidade_estrategica', 'gap_cargo',
         'desempenho', 'pdi', 'mudanca_processo_tecnologia', 'desenvolvimento_lideranca', 'demanda_operacional']::text[]
       and (select count(*) = count(distinct d) from unnest(p) d)
  $f$;

  -- ── 1. Ciclos ─────────────────────────────────────────────────────────
  create table public.peopleflow_dev_lnt_ciclos (
    id bigint generated always as identity primary key,
    ano_planejamento integer not null,
    ano_levantamento integer not null,
    titulo text not null check (btrim(titulo) <> ''),
    status text not null default 'em_elaboracao',
    data_corte date not null,
    observacao text not null default '',
    reaberturas integer not null default 0,
    fechada_em timestamptz,
    fechada_por uuid,
    fechamento_resumo jsonb,
    ultima_reabertura_em timestamptz,
    ultima_reabertura_por uuid,
    ultima_reabertura_motivo text,
    created_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    constraint peopleflow_dev_lnt_ciclo_ano_uk unique (ano_planejamento),
    constraint peopleflow_dev_lnt_ciclo_ano_chk check (ano_planejamento between 2000 and 2100 and ano_levantamento < ano_planejamento),
    constraint peopleflow_dev_lnt_ciclo_status_chk check (status in ('em_elaboracao', 'fechada')),
    constraint peopleflow_dev_lnt_ciclo_reaberturas_chk check (reaberturas >= 0),
    constraint peopleflow_dev_lnt_ciclo_fechamento_chk check ((status = 'fechada') = (fechada_em is not null and fechada_por is not null)),
    constraint peopleflow_dev_lnt_ciclo_reabertura_chk check (reaberturas = 0 or (ultima_reabertura_em is not null and coalesce(btrim(ultima_reabertura_motivo), '') <> ''))
  );
  comment on table public.peopleflow_dev_lnt_ciclos is
    'LNT: um ciclo por ano de planejamento (ex.: LNT 2027, levantamento 2026). Fechada = itens e necessidades do ciclo ficam travados até a reabertura.';
  comment on column public.peopleflow_dev_lnt_ciclos.data_corte is
    'Corte das candidatas: necessidades validadas e ainda abertas até esta data (definida pelo RH na abertura do ciclo).';
  comment on column public.peopleflow_dev_lnt_ciclos.fechamento_resumo is
    'Fotografia dos totais no fechamento (candidatas, itens, pessoas, departamentos) — gravada pelo servidor.';
  comment on column public.peopleflow_dev_lnt_ciclos.reaberturas is
    'Quantas vezes o ciclo foi reaberto após fechado. Cada reabertura exige motivo (trigger) e é auditada.';

  -- ── 2. Itens da LNT ───────────────────────────────────────────────────
  create table public.peopleflow_dev_lnt_itens (
    id bigint generated always as identity primary key,
    ciclo_id bigint not null references public.peopleflow_dev_lnt_ciclos (id),
    titulo text not null check (btrim(titulo) <> ''),
    descricao text not null default '',
    justificativa text not null default '',
    categoria text,
    origem_item text not null default 'consolidacao',
    situacao text not null default 'em_analise',
    prioridade text,
    direcionadores text[] not null default '{}',
    justificativa_prioridade text not null default '',
    publico_estimado integer,
    publico_descricao text not null default '',
    motivo_decisao text not null default '',
    decidido_em timestamptz,
    decidido_por uuid,
    created_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    constraint peopleflow_dev_lnt_item_ciclo_id_uk unique (ciclo_id, id),
    constraint peopleflow_dev_lnt_item_categoria_chk check (categoria is null or categoria in
      ('tecnica', 'qualidade_regulatorio', 'seguranca', 'sistemas_ferramentas', 'comportamental', 'lideranca', 'integracao', 'outra')),
    constraint peopleflow_dev_lnt_item_origem_chk check (origem_item in ('consolidacao', 'direto')),
    constraint peopleflow_dev_lnt_item_situacao_chk check (situacao in ('em_analise', 'incluido', 'nao_priorizado')),
    constraint peopleflow_dev_lnt_item_prioridade_chk check (prioridade is null or prioridade in ('alta', 'media', 'baixa')),
    constraint peopleflow_dev_lnt_item_direcionadores_chk check (public.peopleflow_dev_lnt_direcionadores_validos(direcionadores)),
    constraint peopleflow_dev_lnt_item_publico_chk check (publico_estimado is null or publico_estimado > 0),
    -- Incluído: prioridade, ao menos um direcionador e decisão registrada (quem/quando).
    constraint peopleflow_dev_lnt_item_incluido_chk check (situacao <> 'incluido'
      or (prioridade is not null and cardinality(direcionadores) >= 1 and decidido_em is not null and decidido_por is not null)),
    -- Prioridade Alta sempre justificada.
    constraint peopleflow_dev_lnt_item_alta_chk check (prioridade is distinct from 'alta' or btrim(justificativa_prioridade) <> ''),
    -- Não priorizado: motivo e decisão registrados.
    constraint peopleflow_dev_lnt_item_nao_priorizado_chk check (situacao <> 'nao_priorizado'
      or (btrim(motivo_decisao) <> '' and decidido_em is not null and decidido_por is not null)),
    -- Item direto (estratégico, sem necessidade individual): justificativa, direcionador e público estimado.
    constraint peopleflow_dev_lnt_item_direto_chk check (origem_item <> 'direto'
      or (btrim(justificativa) <> '' and cardinality(direcionadores) >= 1 and publico_estimado is not null))
  );
  create unique index peopleflow_dev_lnt_item_titulo_uidx on public.peopleflow_dev_lnt_itens (ciclo_id, lower(btrim(titulo)));
  create index peopleflow_dev_lnt_item_situacao_idx on public.peopleflow_dev_lnt_itens (ciclo_id, situacao);
  comment on table public.peopleflow_dev_lnt_itens is
    'LNT: item consolidado do ciclo. Prioridade, direcionadores e decisão ficam aqui; quantidade de pessoas e departamentos NÃO são gravados (calculados a partir das necessidades ligadas).';
  comment on column public.peopleflow_dev_lnt_itens.origem_item is
    'consolidacao (nasce de necessidades) | direto (item estratégico sem necessidade individual — exige justificativa, direcionador e público estimado).';
  comment on column public.peopleflow_dev_lnt_itens.direcionadores is
    'Vocabulário controlado: requisito_legal_regulatorio, risco_qualidade, seguranca, necessidade_estrategica, gap_cargo, desempenho, pdi, mudanca_processo_tecnologia, desenvolvimento_lideranca, demanda_operacional.';

  -- ── 3. Necessidades no ciclo ──────────────────────────────────────────
  create table public.peopleflow_dev_lnt_necessidades (
    id bigint generated always as identity primary key,
    ciclo_id bigint not null references public.peopleflow_dev_lnt_ciclos (id),
    necessidade_id bigint not null references public.peopleflow_dev_necessidades (id),
    decisao text not null default 'candidata',
    item_id bigint,
    motivo text not null default '',
    decidido_em timestamptz,
    decidido_por uuid,
    -- Fotografia da necessidade no momento da carga — tudo abaixo é IMUTÁVEL depois da criação da linha.
    --   carregada_em = momento de NEGÓCIO da carga/fotografia (created_at é só o metadado técnico da linha;
    --   created_by = quem carregou).
    carregada_em timestamptz not null default now(),
    status_na_carga text not null,
    validada_em_na_carga timestamptz,
    prioridade_na_carga text,
    departamento_na_carga text,
    alerta_treinamento_id bigint references public.peopleflow_dev_treinamentos (id),
    -- Conteúdo: "o que exatamente era esta necessidade quando entrou na LNT" (campos reais de peopleflow_dev_necessidades).
    descricao_na_carga text not null,
    justificativa_na_carga text not null,
    sugestao_capacitacao_na_carga text not null,
    -- Marcação posterior (não altera a fotografia): a necessidade mudou depois da carga.
    mudou_desde_carga_em timestamptz,
    mudanca_observada jsonb,
    created_at timestamptz not null default now(),
    created_by uuid,
    updated_at timestamptz not null default now(),
    updated_by uuid,
    -- Uma necessidade aparece uma única vez por ciclo — e, tendo um único item_id, em no máximo um item.
    constraint peopleflow_dev_lnt_nec_ciclo_nec_uk unique (ciclo_id, necessidade_id),
    -- O item precisa ser do MESMO ciclo (item_id nulo não é checado).
    constraint peopleflow_dev_lnt_nec_item_fk foreign key (ciclo_id, item_id) references public.peopleflow_dev_lnt_itens (ciclo_id, id),
    constraint peopleflow_dev_lnt_nec_decisao_chk check (decisao in ('candidata', 'em_item', 'nao_priorizada')),
    constraint peopleflow_dev_lnt_nec_item_chk check ((decisao = 'em_item') = (item_id is not null)),
    constraint peopleflow_dev_lnt_nec_decidida_chk check (decisao = 'candidata' or (decidido_em is not null and decidido_por is not null)),
    constraint peopleflow_dev_lnt_nec_motivo_chk check (decisao <> 'nao_priorizada' or btrim(motivo) <> ''),
    -- Só necessidades validadas ou planejadas são carregadas (sugerida, atendida e cancelada não entram).
    constraint peopleflow_dev_lnt_nec_status_carga_chk check (status_na_carga in ('validada', 'planejada')),
    constraint peopleflow_dev_lnt_nec_prioridade_carga_chk check (prioridade_na_carga is null or prioridade_na_carga in ('alta', 'media', 'baixa')),
    constraint peopleflow_dev_lnt_nec_descricao_carga_chk check (btrim(descricao_na_carga) <> ''),
    constraint peopleflow_dev_lnt_nec_alerta_chk check (alerta_treinamento_id is null or status_na_carga = 'planejada'),
    constraint peopleflow_dev_lnt_nec_mudou_chk check ((mudou_desde_carga_em is null) = (mudanca_observada is null))
  );
  create index peopleflow_dev_lnt_nec_decisao_idx on public.peopleflow_dev_lnt_necessidades (ciclo_id, decisao);
  create index peopleflow_dev_lnt_nec_item_idx on public.peopleflow_dev_lnt_necessidades (item_id) where item_id is not null;
  create index peopleflow_dev_lnt_nec_necessidade_idx on public.peopleflow_dev_lnt_necessidades (necessidade_id);
  comment on table public.peopleflow_dev_lnt_necessidades is
    'LNT: situação de cada necessidade no ciclo. candidata (sem decisão) | em_item (consolidada/incluída em um item) | nao_priorizada (com motivo). A necessidade original NUNCA é alterada pela LNT.';
  comment on column public.peopleflow_dev_lnt_necessidades.carregada_em is
    'Momento de negócio em que a necessidade foi carregada/fotografada para o ciclo. Imutável. Distinto de created_at (metadado técnico da linha); na carga os dois podem coincidir.';
  comment on column public.peopleflow_dev_lnt_necessidades.descricao_na_carga is
    'Fotografia de peopleflow_dev_necessidades.descricao no momento da carga (imutável). A necessidade viva pode mudar depois; a LNT preserva o que foi analisado.';
  comment on column public.peopleflow_dev_lnt_necessidades.justificativa_na_carga is
    'Fotografia de peopleflow_dev_necessidades.justificativa no momento da carga (imutável; pode ser vazia, como na origem).';
  comment on column public.peopleflow_dev_lnt_necessidades.sugestao_capacitacao_na_carga is
    'Fotografia de peopleflow_dev_necessidades.sugestao_capacitacao (sugestão de capacitação/ação) no momento da carga (imutável; pode ser vazia, como na origem).';
  comment on column public.peopleflow_dev_lnt_necessidades.status_na_carga is
    'Status que a necessidade tinha quando foi carregada no ciclo (fotografia imutável). O status atual continua em peopleflow_dev_necessidades.';
  comment on column public.peopleflow_dev_lnt_necessidades.alerta_treinamento_id is
    'D1: necessidade PLANEJADA entra como candidata com alerta — treinamento que já a cobria na carga. Fora das estimativas até decisão da RH.';
  comment on column public.peopleflow_dev_lnt_necessidades.mudanca_observada is
    'Ex.: {"status": {"antes": "validada", "depois": "atendida"}}. Preenchida pelo servidor quando a necessidade muda depois da carga; a fotografia não muda.';

  -- ── Funções de guarda (triggers) ──────────────────────────────────────
  create function public.peopleflow_dev_lnt_ciclo_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  begin
    if new.ano_planejamento <> old.ano_planejamento or new.ano_levantamento <> old.ano_levantamento then
      raise exception 'LNT: o ano do ciclo não pode ser alterado.' using errcode = 'P0001';
    end if;
    if new.reaberturas < old.reaberturas then
      raise exception 'LNT: o número de reaberturas não pode diminuir.' using errcode = 'P0001';
    end if;
    if old.status = 'fechada' and new.status = 'fechada'
       and (to_jsonb(new) - 'updated_at' - 'updated_by') is distinct from (to_jsonb(old) - 'updated_at' - 'updated_by') then
      raise exception 'LNT: ciclo fechado — reabra o ciclo antes de editar.' using errcode = 'P0001';
    end if;
    if old.status = 'em_elaboracao' and new.status = 'fechada' and new.reaberturas <> old.reaberturas then
      raise exception 'LNT: o fechamento não altera o número de reaberturas.' using errcode = 'P0001';
    end if;
    if old.status = 'fechada' and new.status = 'em_elaboracao' and new.reaberturas <> old.reaberturas + 1 then
      raise exception 'LNT: a reabertura deve somar 1 ao número de reaberturas.' using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  create function public.peopleflow_dev_lnt_itens_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  declare v_status text;
  begin
    select status into v_status from public.peopleflow_dev_lnt_ciclos where id = new.ciclo_id;
    if v_status = 'fechada' then
      raise exception 'LNT: ciclo fechado — reabra o ciclo antes de alterar itens.' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (new.ciclo_id <> old.ciclo_id or new.origem_item <> old.origem_item) then
      raise exception 'LNT: ciclo e origem do item não podem ser alterados.' using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  create function public.peopleflow_dev_lnt_necessidades_guarda()
  returns trigger language plpgsql set search_path = public as $f$
  declare v_status text;
  begin
    select status into v_status from public.peopleflow_dev_lnt_ciclos where id = new.ciclo_id;
    if tg_op = 'INSERT' then
      if v_status = 'fechada' then
        raise exception 'LNT: ciclo fechado — reabra o ciclo antes de carregar necessidades.' using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- A fotografia da carga é imutável: ciclo, necessidade, carregada_em, todos os *_na_carga, o alerta de treinamento e a criação da linha.
    if (new.ciclo_id, new.necessidade_id, new.carregada_em, new.status_na_carga, new.validada_em_na_carga, new.prioridade_na_carga,
        new.departamento_na_carga, new.alerta_treinamento_id, new.descricao_na_carga, new.justificativa_na_carga,
        new.sugestao_capacitacao_na_carga, new.created_at, new.created_by)
       is distinct from
       (old.ciclo_id, old.necessidade_id, old.carregada_em, old.status_na_carga, old.validada_em_na_carga, old.prioridade_na_carga,
        old.departamento_na_carga, old.alerta_treinamento_id, old.descricao_na_carga, old.justificativa_na_carga,
        old.sugestao_capacitacao_na_carga, old.created_at, old.created_by) then
      raise exception 'LNT: a fotografia da carga (ciclo, necessidade, carregada_em, status, prioridade, departamento, alerta, descrição, justificativa e sugestão de capacitação) é imutável.' using errcode = 'P0001';
    end if;
    -- Ciclo fechado: só a marcação "mudou desde a carga" pode ser atualizada.
    if v_status = 'fechada'
       and (to_jsonb(new) - 'mudou_desde_carga_em' - 'mudanca_observada' - 'updated_at' - 'updated_by')
           is distinct from
           (to_jsonb(old) - 'mudou_desde_carga_em' - 'mudanca_observada' - 'updated_at' - 'updated_by') then
      raise exception 'LNT: ciclo fechado — reabra o ciclo antes de alterar decisões.' using errcode = 'P0001';
    end if;
    return new;
  end $f$;

  -- Visibilidade para o Gestor (SECURITY DEFINER, como as demais do módulo).
  create function public.peopleflow_dev_lnt_necessidade_visivel(p_necessidade_id bigint)
  returns boolean language sql stable security definer set search_path = public as $f$
    select exists (
      select 1 from public.peopleflow_dev_necessidades n
      where n.id = p_necessidade_id and n.colaborador_id is not null
        and public.peopleflow_dev_pode_ver_colaborador(n.colaborador_id))
  $f$;

  create function public.peopleflow_dev_lnt_item_visivel(p_item_id bigint)
  returns boolean language sql stable security definer set search_path = public as $f$
    select exists (
      select 1 from public.peopleflow_dev_lnt_necessidades ln
      where ln.item_id = p_item_id and public.peopleflow_dev_lnt_necessidade_visivel(ln.necessidade_id))
  $f$;

  -- ── Triggers: updated_at, sem exclusão física, guardas ────────────────
  create trigger peopleflow_dev_lnt_ciclos_updated_at before update on public.peopleflow_dev_lnt_ciclos
    for each row execute function public.peopleflow_dev_set_updated_at();
  create trigger peopleflow_dev_lnt_itens_updated_at before update on public.peopleflow_dev_lnt_itens
    for each row execute function public.peopleflow_dev_set_updated_at();
  create trigger peopleflow_dev_lnt_necessidades_updated_at before update on public.peopleflow_dev_lnt_necessidades
    for each row execute function public.peopleflow_dev_set_updated_at();

  create trigger peopleflow_dev_lnt_ciclos_sem_delete before delete on public.peopleflow_dev_lnt_ciclos
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_lnt_ciclos_sem_truncate before truncate on public.peopleflow_dev_lnt_ciclos
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_lnt_itens_sem_delete before delete on public.peopleflow_dev_lnt_itens
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_lnt_itens_sem_truncate before truncate on public.peopleflow_dev_lnt_itens
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_lnt_necessidades_sem_delete before delete on public.peopleflow_dev_lnt_necessidades
    for each row execute function public.peopleflow_dev_bloquear_exclusao();
  create trigger peopleflow_dev_lnt_necessidades_sem_truncate before truncate on public.peopleflow_dev_lnt_necessidades
    for each statement execute function public.peopleflow_dev_bloquear_exclusao();

  create trigger peopleflow_dev_lnt_ciclos_guarda before update on public.peopleflow_dev_lnt_ciclos
    for each row execute function public.peopleflow_dev_lnt_ciclo_guarda();
  create trigger peopleflow_dev_lnt_itens_guarda before insert or update on public.peopleflow_dev_lnt_itens
    for each row execute function public.peopleflow_dev_lnt_itens_guarda();
  create trigger peopleflow_dev_lnt_necessidades_guarda before insert or update on public.peopleflow_dev_lnt_necessidades
    for each row execute function public.peopleflow_dev_lnt_necessidades_guarda();

  -- ── RLS (somente leitura para o navegador) ────────────────────────────
  alter table public.peopleflow_dev_lnt_ciclos enable row level security;
  alter table public.peopleflow_dev_lnt_itens enable row level security;
  alter table public.peopleflow_dev_lnt_necessidades enable row level security;

  create policy dev_lnt_ciclos_leitura on public.peopleflow_dev_lnt_ciclos for select to authenticated
    using ((select public.peopleflow_dev_meu_perfil()) in ('RH', 'Gestor'));

  create policy dev_lnt_itens_leitura on public.peopleflow_dev_lnt_itens for select to authenticated
    using (
      (select public.peopleflow_dev_meu_perfil()) = 'RH'
      or ((select public.peopleflow_dev_meu_perfil()) = 'Gestor' and public.peopleflow_dev_lnt_item_visivel(id))
    );

  create policy dev_lnt_necessidades_leitura on public.peopleflow_dev_lnt_necessidades for select to authenticated
    using (
      (select public.peopleflow_dev_meu_perfil()) = 'RH'
      or ((select public.peopleflow_dev_meu_perfil()) = 'Gestor' and public.peopleflow_dev_lnt_necessidade_visivel(necessidade_id))
    );

  -- ── Permissões: navegador só lê; anon nada; gravação só pelo servidor ─
  revoke all on public.peopleflow_dev_lnt_ciclos, public.peopleflow_dev_lnt_itens, public.peopleflow_dev_lnt_necessidades from public, anon, authenticated;
  grant select on public.peopleflow_dev_lnt_ciclos, public.peopleflow_dev_lnt_itens, public.peopleflow_dev_lnt_necessidades to authenticated;
  grant all on public.peopleflow_dev_lnt_ciclos, public.peopleflow_dev_lnt_itens, public.peopleflow_dev_lnt_necessidades to service_role;

  revoke all on function public.peopleflow_dev_lnt_necessidade_visivel(bigint), public.peopleflow_dev_lnt_item_visivel(bigint) from public, anon;
  grant execute on function public.peopleflow_dev_lnt_necessidade_visivel(bigint), public.peopleflow_dev_lnt_item_visivel(bigint) to authenticated, service_role;
  revoke all on function public.peopleflow_dev_lnt_direcionadores_validos(text[]) from public, anon, authenticated;
  grant execute on function public.peopleflow_dev_lnt_direcionadores_validos(text[]) to service_role;
  revoke all on function public.peopleflow_dev_lnt_ciclo_guarda(), public.peopleflow_dev_lnt_itens_guarda(), public.peopleflow_dev_lnt_necessidades_guarda() from public, anon, authenticated;

  -- ── POST-FLIGHT ───────────────────────────────────────────────────────
  select count(*) into v_n from unnest(array['peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades']) t
   where to_regclass('public.' || t) is not null;
  if v_n <> 3 then raise exception 'POST-FLIGHT: % de 3 tabelas criadas', v_n; end if;

  select string_agg(c.relname, ', ') into v_txt from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname in ('peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades') and not c.relrowsecurity;
  if v_txt is not null then raise exception 'POST-FLIGHT: RLS desligada em %', v_txt; end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename like 'peopleflow_dev_lnt_%';
  if v_n <> 3 then raise exception 'POST-FLIGHT: % políticas nas tabelas LNT (esperado 3, todas de SELECT)', v_n; end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename like 'peopleflow_dev_lnt_%' and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'POST-FLIGHT: política de escrita encontrada nas tabelas LNT'; end if;

  select count(*) into v_n from unnest(array['peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades']) t
   where has_table_privilege('authenticated', 'public.' || t, 'INSERT') or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || t, 'DELETE') or has_table_privilege('anon', 'public.' || t, 'SELECT');
  if v_n <> 0 then raise exception 'POST-FLIGHT: permissão indevida para authenticated/anon nas tabelas LNT'; end if;

  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('peopleflow_dev_lnt_ciclos', 'peopleflow_dev_lnt_itens', 'peopleflow_dev_lnt_necessidades') and not tg.tgisinternal;
  if v_n <> 12 then raise exception 'POST-FLIGHT: % triggers nas tabelas LNT (esperado 12)', v_n; end if;

  select (select count(*) from public.peopleflow_dev_lnt_ciclos) + (select count(*) from public.peopleflow_dev_lnt_itens) + (select count(*) from public.peopleflow_dev_lnt_necessidades) into v_n;
  if v_n <> 0 then raise exception 'POST-FLIGHT: tabelas LNT deveriam nascer vazias'; end if;

  -- Nada existente mudou: políticas, colunas e linhas das tabelas do PeopleFlow.
  select md5(coalesce(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ';' order by tablename, policyname), ''))
    into v_pol_depois from pg_policies where schemaname = 'public' and left(tablename, 11) = 'peopleflow_' and tablename not like 'peopleflow_dev_lnt_%';
  select md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by table_name, ordinal_position), ''))
    into v_col_depois from information_schema.columns where table_schema = 'public' and left(table_name, 11) = 'peopleflow_' and table_name not like 'peopleflow_dev_lnt_%';
  select (select count(*) from public.peopleflow_dev_necessidades)::text || '/' || (select count(*) from public.peopleflow_dev_treinamentos)::text
         || '/' || (select count(*) from public.peopleflow_dev_auditoria)::text
    into v_dados_depois;
  if v_pol_depois is distinct from v_pol_antes then raise exception 'POST-FLIGHT: políticas de tabelas existentes foram alteradas'; end if;
  if v_col_depois is distinct from v_col_antes then raise exception 'POST-FLIGHT: colunas de tabelas existentes foram alteradas'; end if;
  if v_dados_depois is distinct from v_dados_antes then raise exception 'POST-FLIGHT: linhas de necessidades/treinamentos/auditoria mudaram (antes %, depois %)', v_dados_antes, v_dados_depois; end if;

  raise notice 'FASE 6 OK: 3 tabelas LNT criadas, vazias, com RLS; nada existente foi alterado.';
end
$mig$;

select 'FASE 6 OK — tabelas LNT: ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'peopleflow_dev_lnt_%')
    || ', políticas: ' || (select count(*) from pg_policies where schemaname = 'public' and tablename like 'peopleflow_dev_lnt_%')
    || ', linhas: 0' as resultado;
