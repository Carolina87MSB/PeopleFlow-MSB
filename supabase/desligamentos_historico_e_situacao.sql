-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PeopleFlow — Situação funcional central (SQL) + histórico de rescisões (estrutura própria)
--
-- O QUE FAZ (tudo ADITIVO — nenhuma tabela/coluna existente é alterada; `colaboradores` e o SST não são tocados):
--   1. Funções `peopleflow_situacao_funcional_em` / `peopleflow_ativo_em`: espelho EXATO de src/domain/situacaoFuncional.ts
--      (paridade TS × SQL testada em tests/desligamentos). Servem às consultas/views que precisarem da regra única.
--   2. Tabela `peopleflow_rescisoes_historico`: registro das rescisões da folha (relatório "Relação de Rescisões Calculadas"),
--      com identificador único por rescisão (empresa + código da folha + data), para os INDICADORES do Dashboard Executivo e
--      rastreabilidade. NÃO cria cadastro artificial em `colaboradores`.
--        natureza = 'saida_efetiva'          → pessoa que deixou a empresa;
--        natureza = 'conversao_estagio_clt'  → encerramento de estágio com efetivação (a pessoa CONTINUA na empresa).
--      `colaborador_id` liga a linha ao cadastro quando a pessoa já existe (evita dupla contagem: quem tem cadastro é contado
--      pelo cadastro; o histórico só complementa quem não tem).
--   3. Tabela `peopleflow_rescisoes_historico_rubricas`: valores do relatório (salário, proventos, descontos, líquido, FGTS).
--      Fica SOMENTE no servidor (RLS ligada e nenhuma política) e NÃO alimenta nenhum indicador: a natureza de cada rubrica
--      ainda não foi validada pelo RH (`natureza_validada = false`).
--   4. View `peopleflow_v_rescisoes_historico_contaveis` (só service_role): linhas que contam como saída efetiva sem cadastro.
--
-- SEGURANÇA: uma única transação; pré-condições abortam sem gravar nada; reaplicável (idempotente).
-- REVERSÃO: supabase/desligamentos_historico_e_situacao_rollback.sql (recusa se houver dados, salvo autorização explícita).
-- VALIDAÇÃO: supabase/desligamentos_historico_e_situacao_validacao.sql (somente leitura).
-- DADOS: a carga dos registros reais fica em arquivo SEPARADO e ignorado pelo git (supabase/*.local.sql) — o repositório é público.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── pré-condições ───────────────────────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.colaboradores') is null then
    raise exception 'PRÉ-CONDIÇÃO: tabela public.colaboradores não existe — nada foi alterado.';
  end if;
  if to_regprocedure('public.peopleflow_dev_normalizar_nome(text)') is null then
    raise exception 'PRÉ-CONDIÇÃO: função peopleflow_dev_normalizar_nome(text) (Fase 2 do módulo Desenvolvimento) não existe — nada foi alterado.';
  end if;
end
$mig$;

-- ── 1. Situação funcional central ───────────────────────────────────────────────────────────────
-- Regra (idêntica ao TS):
--   fora_do_quadro : afiliada, exceto no escopo 'acesso';
--   desligado      : desligado com data <= ref; ou desligado SEM data e ref >= hoje;
--   nao_iniciado   : (só escopo 'quadro') admissão nula ou posterior a ref;
--   ativo          : demais casos. Desligado com data FUTURA continua ativo até a data.
create or replace function public.peopleflow_situacao_funcional_em(
  p_admissao date,
  p_desligado boolean,
  p_data_desligamento date,
  p_afiliada boolean,
  p_ref date,
  p_escopo text,
  p_hoje date default ((now() at time zone 'America/Sao_Paulo')::date)
) returns text
language plpgsql stable set search_path = public as $fn$
begin
  if p_escopo is null or p_escopo not in ('quadro', 'operacional', 'acesso') then
    raise exception 'escopo inválido: % (use quadro, operacional ou acesso)', p_escopo;
  end if;
  if p_escopo <> 'acesso' and coalesce(p_afiliada, false) then
    return 'fora_do_quadro';
  end if;
  if coalesce(p_desligado, false) then
    if p_data_desligamento is not null then
      if p_data_desligamento <= p_ref then
        return 'desligado';
      end if;
    elsif p_ref >= p_hoje then
      return 'desligado';
    end if;
  end if;
  if p_escopo = 'quadro' and (p_admissao is null or p_admissao > p_ref) then
    return 'nao_iniciado';
  end if;
  return 'ativo';
end
$fn$;

create or replace function public.peopleflow_ativo_em(
  p_admissao date,
  p_desligado boolean,
  p_data_desligamento date,
  p_afiliada boolean,
  p_ref date,
  p_escopo text,
  p_hoje date default ((now() at time zone 'America/Sao_Paulo')::date)
) returns boolean
language sql stable set search_path = public as $fn$
  select public.peopleflow_situacao_funcional_em(p_admissao, p_desligado, p_data_desligamento, p_afiliada, p_ref, p_escopo, p_hoje) = 'ativo'
$fn$;

grant execute on function public.peopleflow_situacao_funcional_em(date, boolean, date, boolean, date, text, date) to authenticated, service_role;
grant execute on function public.peopleflow_ativo_em(date, boolean, date, boolean, date, text, date) to authenticated, service_role;

-- ── 2. Histórico de rescisões ───────────────────────────────────────────────────────────────────
create table if not exists public.peopleflow_rescisoes_historico (
  id bigint generated always as identity primary key,
  origem text not null default 'folha_rescisoes_calculadas',
  fonte_documento text not null default '',
  relatorio_emitido_em date not null,
  empresa_codigo integer not null default 2,
  codigo_folha integer not null,
  nome text not null check (btrim(nome) <> ''),
  nome_normalizado text generated always as (public.peopleflow_dev_normalizar_nome(nome)) stored,
  admissao date not null,
  aviso date,
  demissao date not null,
  tipo_rescisao text not null default '',
  centro_custo_codigo integer,
  centro_custo text,
  departamento text,
  departamento_origem text not null default 'mapeamento_centro_custo' check (departamento_origem in ('cadastro', 'mapeamento_centro_custo')),
  natureza text not null check (natureza in ('saida_efetiva', 'conversao_estagio_clt')),
  /** Início do vínculo seguinte (só conversão): documenta a continuidade; o cadastro mantém as suas próprias datas. */
  efetivacao_em date,
  colaborador_id bigint references public.colaboradores (id),
  observacao text not null default '',
  created_at timestamptz not null default now(),
  created_by text,
  constraint peopleflow_rescisoes_hist_demissao_chk check (demissao >= admissao),
  constraint peopleflow_rescisoes_hist_conversao_chk check (natureza <> 'conversao_estagio_clt' or (colaborador_id is not null and efetivacao_em is not null)),
  constraint peopleflow_rescisoes_hist_saida_chk check (natureza <> 'saida_efetiva' or efetivacao_em is null)
);
comment on table public.peopleflow_rescisoes_historico is
  'Rescisões da folha (relatório "Relação de Rescisões Calculadas") para indicadores e rastreabilidade — NÃO é cadastro de colaboradores. colaborador_id preenchido = a pessoa tem cadastro (contada pelo cadastro, nunca em duplicidade).';

-- identificador único de uma rescisão (idempotência da carga)
create unique index if not exists peopleflow_rescisoes_hist_uidx on public.peopleflow_rescisoes_historico (empresa_codigo, codigo_folha, demissao);
create index if not exists peopleflow_rescisoes_hist_nome_idx on public.peopleflow_rescisoes_historico (nome_normalizado, admissao);
create index if not exists peopleflow_rescisoes_hist_colab_idx on public.peopleflow_rescisoes_historico (colaborador_id) where colaborador_id is not null;
create index if not exists peopleflow_rescisoes_hist_demissao_idx on public.peopleflow_rescisoes_historico (demissao);

create table if not exists public.peopleflow_rescisoes_historico_rubricas (
  rescisao_id bigint primary key references public.peopleflow_rescisoes_historico (id),
  saldo_fgts numeric(14, 2),
  salario numeric(14, 2),
  proventos numeric(14, 2),
  descontos numeric(14, 2),
  liquido numeric(14, 2),
  fgts_rescisorio numeric(14, 2),
  /** false até o RH validar a natureza de cada rubrica (o que é custo desembolsado, o que é saldo/provisão etc.). */
  natureza_validada boolean not null default false,
  observacao text not null default ''
);
comment on table public.peopleflow_rescisoes_historico_rubricas is
  'Valores do relatório da folha, por rescisão. Somente servidor. Não alimenta indicadores enquanto natureza_validada = false: não somar salário, FGTS, proventos, descontos e líquido indiscriminadamente.';

-- ── guardas: o histórico é imutável (só se liga ao cadastro, uma vez) e não se apaga ─────────────
create or replace function public.peopleflow_rescisoes_historico_guard()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'peopleflow_rescisoes_historico: registros históricos não são excluídos.';
  end if;
  if new.nome is distinct from old.nome or new.admissao is distinct from old.admissao or new.demissao is distinct from old.demissao
     or new.codigo_folha is distinct from old.codigo_folha or new.empresa_codigo is distinct from old.empresa_codigo
     or new.natureza is distinct from old.natureza or new.tipo_rescisao is distinct from old.tipo_rescisao
     or new.efetivacao_em is distinct from old.efetivacao_em or new.relatorio_emitido_em is distinct from old.relatorio_emitido_em then
    raise exception 'peopleflow_rescisoes_historico: nome, datas, natureza e identificadores originais não podem ser alterados.';
  end if;
  if old.colaborador_id is not null and new.colaborador_id is distinct from old.colaborador_id then
    raise exception 'peopleflow_rescisoes_historico: o vínculo com o cadastro já definido não pode ser trocado.';
  end if;
  return new;
end
$fn$;

drop trigger if exists peopleflow_rescisoes_historico_guard on public.peopleflow_rescisoes_historico;
create trigger peopleflow_rescisoes_historico_guard before update or delete on public.peopleflow_rescisoes_historico
  for each row execute function public.peopleflow_rescisoes_historico_guard();

-- ── acesso ──────────────────────────────────────────────────────────────────────────────────────
alter table public.peopleflow_rescisoes_historico enable row level security;
alter table public.peopleflow_rescisoes_historico_rubricas enable row level security;

-- leitura para autenticados (nomes e datas; mesmo nível das demais tabelas de pessoas); escrita só pelo servidor (service_role)
drop policy if exists "authenticated_select_rescisoes_historico" on public.peopleflow_rescisoes_historico;
create policy "authenticated_select_rescisoes_historico" on public.peopleflow_rescisoes_historico for select to authenticated using (true);

revoke all on public.peopleflow_rescisoes_historico from public, anon, authenticated;
grant select on public.peopleflow_rescisoes_historico to authenticated;
grant all on public.peopleflow_rescisoes_historico to service_role;
-- rubricas: RLS ligada e NENHUMA política — só service_role
revoke all on public.peopleflow_rescisoes_historico_rubricas from public, anon, authenticated;
grant all on public.peopleflow_rescisoes_historico_rubricas to service_role;

-- ── 4. View de apoio (servidor/relatórios): saídas efetivas SEM cadastro ─────────────────────────
create or replace view public.peopleflow_v_rescisoes_historico_contaveis with (security_invoker = true) as
select h.*
from public.peopleflow_rescisoes_historico h
where h.natureza = 'saida_efetiva'
  and h.colaborador_id is null
  and not exists (
    select 1 from public.colaboradores c
    where public.peopleflow_dev_normalizar_nome(c.nome) = h.nome_normalizado and c.admissao = h.admissao
  );
revoke all on public.peopleflow_v_rescisoes_historico_contaveis from public, anon, authenticated;
grant select on public.peopleflow_v_rescisoes_historico_contaveis to service_role;

commit;
