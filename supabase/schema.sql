-- Portal PeopleFlow MSB — schema Supabase.
--
-- Este projeto compartilha o MESMO projeto Supabase do Portal SST MSB
-- (mesma tabela `public.colaboradores` = mesmas pessoas nos dois portais).
-- Rode este arquivo inteiro em Supabase Dashboard > SQL Editor > New query.
-- É seguro rodar mais de uma vez (usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- IMPORTANTE: este script NUNCA remove nem altera uma coluna/policy existente
-- do SST — só ADICIONA colunas novas (nullable) à tabela `colaboradores` e
-- cria tabelas novas, prefixadas `peopleflow_`, exclusivas deste portal. O
-- Portal SST continua funcionando exatamente como antes depois de rodar isto.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Extensão da tabela compartilhada `colaboradores`
-- ─────────────────────────────────────────────────────────────────────────
-- O SST guarda CPF/exames/EPI; o PeopleFlow precisa também de matrícula,
-- sigla do departamento, nível hierárquico, gestor imediato e data de
-- admissão para montar o organograma e o fluxo de aprovação. Colunas novas,
-- todas opcionais — linhas já existentes (seed do SST) ficam com esses
-- campos em branco até serem preenchidos (ver README > "Após rodar o schema").
alter table public.colaboradores
  add column if not exists matricula text,
  add column if not exists depto_code text,
  add column if not exists nivel text,
  add column if not exists gestor text,
  add column if not exists admissao date;

comment on column public.colaboradores.matricula is 'PeopleFlow: matrícula funcional (ex: MSB-101).';
comment on column public.colaboradores.depto_code is 'PeopleFlow: sigla do departamento (ex: PRD, ENG).';
comment on column public.colaboradores.nivel is 'PeopleFlow: nível hierárquico (Diretoria/Gerência/Liderança/Especialista/Analista/Técnico/Operacional/"Aprendiz / Estágio").';
comment on column public.colaboradores.gestor is 'PeopleFlow: nome do gestor imediato (deve bater com colaboradores.nome de outra linha).';
comment on column public.colaboradores.admissao is 'PeopleFlow: data de admissão.';

-- A policy de leitura já existente do SST (authenticated_can_read_colaboradores,
-- for select to authenticated using (true)) já cobre o PeopleFlow — mesmos
-- usuários autenticados, mesma tabela. Nada a mudar nela.

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Tabelas exclusivas do PeopleFlow (prefixo evita qualquer colisão com o SST)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.peopleflow_movimentacoes (
  id text primary key,
  tipo text not null,
  tipo_cod text not null,
  colaborador text not null,
  depto text not null,
  resumo text not null,
  solicitante text not null,
  data_solicitacao text not null,
  prioridade text not null,
  status text not null,
  justificativa text not null default '',
  dados jsonb not null default '[]'::jsonb,
  etapas jsonb not null default '[]'::jsonb,
  novo_cargo jsonb,
  aprovacao_final jsonb,
  legado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_movimentacoes is
  'Solicitações de movimentação de pessoal e seu fluxo de aprovação (etapas). Exclusiva do Portal PeopleFlow.';
comment on column public.peopleflow_movimentacoes.etapas is 'Array de { papel, aprovador, status, data, hora, comentario } — ver Etapa em src/types/domain.ts.';
comment on column public.peopleflow_movimentacoes.dados is 'Array de { label, value } com os campos específicos do tipo de movimentação.';

create table if not exists public.peopleflow_cargos_custom (
  nome text primary key,
  depto text not null,
  gestor text not null,
  vagas text,
  faixa text,
  nivel text not null default 'Novo cargo',
  descricao text not null default 'Pendente',
  created_at timestamptz not null default now()
);

comment on table public.peopleflow_cargos_custom is
  'Cargos criados via movimentação do tipo "Novo Cargo" após aprovação final — incorporados ao cadastro oficial de cargos. Exclusiva do Portal PeopleFlow.';

-- RLS: qualquer usuário autenticado (RH, Gestor ou Diretoria — o próprio app
-- decide quem pode agir em qual etapa, ver src/domain/permissoes.ts) pode
-- ler, criar e atualizar movimentações e cargos custom. Diferente do SST
-- (só leitura via RLS, escrita só por service_role), aqui a escrita
-- acontece direto do navegador porque não há dado de saúde/CPF nestas
-- tabelas — o risco é de negócio, não de LGPD.
alter table public.peopleflow_movimentacoes enable row level security;
alter table public.peopleflow_cargos_custom enable row level security;

drop policy if exists "authenticated_rw_movimentacoes" on public.peopleflow_movimentacoes;
create policy "authenticated_rw_movimentacoes"
  on public.peopleflow_movimentacoes
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated_rw_cargos_custom" on public.peopleflow_cargos_custom;
create policy "authenticated_rw_cargos_custom"
  on public.peopleflow_cargos_custom
  for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Desligamento — colunas compartilhadas com o SST + fechamento financeiro
-- ─────────────────────────────────────────────────────────────────────────
-- O SST grava desligado/data_desligamento/motivo_desligamento (ação "Desligar
-- colaborador" por lá, via api/desligar-colaborador.ts dele). Aqui só
-- garantimos que as colunas existem (idempotente — repetir este ADD COLUMN
-- no schema do SST ou daqui não causa conflito, são as mesmas colunas).
alter table public.colaboradores
  add column if not exists desligado boolean not null default false,
  add column if not exists data_desligamento date,
  add column if not exists motivo_desligamento text,
  add column if not exists desligado_by text;

-- Valor da rescisão e da GRRF são preenchidos manualmente pelo RH no
-- PeopleFlow (o SST não tem esses campos) — tabela exclusiva deste portal.
create table if not exists public.peopleflow_desligamentos (
  colaborador_nome text primary key,
  valor_rescisao numeric,
  valor_grrf numeric,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_desligamentos is
  'Fechamento financeiro do desligamento (rescisão, GRRF) — preenchido pelo RH no PeopleFlow. Exclusiva deste portal; colaborador_nome referencia colaboradores.nome.';

alter table public.peopleflow_desligamentos enable row level security;

drop policy if exists "authenticated_rw_desligamentos" on public.peopleflow_desligamentos;
create policy "authenticated_rw_desligamentos"
  on public.peopleflow_desligamentos
  for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Descrição de cargo — formulário oficial (POP-RH-001) por cargo
-- ─────────────────────────────────────────────────────────────────────────
-- Uma linha por cargo (chave = nome do cargo, igual ao usado em
-- colaboradores.cargo / peopleflow_cargos_custom.nome). Guarda o conteúdo
-- completo do formulário de descrição de cargo, incluindo os dados de
-- controle documental (código, revisão, data do formulário) usados em
-- auditorias. Edição por campo é exclusiva do RH (ver
-- src/domain/permissoes.ts — perfil "RH"), mas a leitura é liberada a
-- qualquer autenticado, assim como as demais tabelas deste portal.
create table if not exists public.peopleflow_descricoes_cargo (
  cargo_nome text primary key,
  codigo_formulario text,
  revisao_formulario text,
  data_formulario text,
  data_revisao_cargo text,
  subordinacao text,
  localidade text,
  nivel_documento text,
  sumario text,
  responsabilidades text,
  escolaridade text,
  experiencia text,
  habilidades_tecnicas text,
  habilidades_comportamentais text,
  epis text,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_descricoes_cargo is
  'Conteúdo do formulário de descrição de cargo (POP-RH-001) por cargo — cargo_nome referencia colaboradores.cargo. Exclusiva do Portal PeopleFlow.';
comment on column public.peopleflow_descricoes_cargo.codigo_formulario is 'Código do documento controlado (ex.: POP-RH-001-01) — usado em auditorias.';
comment on column public.peopleflow_descricoes_cargo.data_formulario is 'Data/revisão do template do formulário (cabeçalho do POP), distinta de data_revisao_cargo.';
comment on column public.peopleflow_descricoes_cargo.data_revisao_cargo is 'Data em que o conteúdo deste cargo específico foi revisado (ex.: "março/2026").';
comment on column public.peopleflow_descricoes_cargo.nivel_documento is 'Nível declarado no formulário (ex.: "PLENO", "I, II ou III") — não confundir com colaboradores.nivel.';

-- Log append-only de alterações campo a campo — alimenta o "Histórico de
-- atualizações" exibido junto com a descrição de cargo.
create table if not exists public.peopleflow_descricoes_cargo_historico (
  id bigint generated always as identity primary key,
  cargo_nome text not null,
  campo text not null,
  valor_anterior text,
  valor_novo text,
  editado_por text not null,
  editado_em timestamptz not null default now()
);

comment on table public.peopleflow_descricoes_cargo_historico is
  'Histórico append-only de edições campo a campo de peopleflow_descricoes_cargo.';

alter table public.peopleflow_descricoes_cargo enable row level security;
alter table public.peopleflow_descricoes_cargo_historico enable row level security;

drop policy if exists "authenticated_rw_descricoes_cargo" on public.peopleflow_descricoes_cargo;
create policy "authenticated_rw_descricoes_cargo"
  on public.peopleflow_descricoes_cargo
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated_rw_descricoes_cargo_historico" on public.peopleflow_descricoes_cargo_historico;
create policy "authenticated_rw_descricoes_cargo_historico"
  on public.peopleflow_descricoes_cargo_historico
  for all
  to authenticated
  using (true)
  with check (true);
