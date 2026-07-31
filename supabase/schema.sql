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

-- Antes, admissaoInfo/atualizacaoInfo/desligamentoInfo só existiam em memória
-- (nunca eram persistidos) — qualquer aprovação final feita numa sessão
-- diferente de quem abriu a movimentação (o caso normal: Gestor, Diretor e
-- RH em dias/sessões diferentes) perdia esses dados e a sincronização com
-- `colaboradores` nunca disparava. As 3 colunas abaixo corrigem isso.
alter table public.peopleflow_movimentacoes
  add column if not exists admissao_info jsonb,
  add column if not exists atualizacao_info jsonb,
  add column if not exists desligamento_info jsonb,
  add column if not exists sincronizado_em timestamptz;

comment on column public.peopleflow_movimentacoes.admissao_info is 'AdmissaoInfo (candidato/cargo/depto/gestor/vinculo/admissaoIso) — só para tipo_cod = ADM. Fixado na criação, nunca muda depois.';
comment on column public.peopleflow_movimentacoes.atualizacao_info is 'AtualizacaoCargoDeptoInfo (nome/novoCargo/novoDepto/novoGestor/dataPrevistaIso) — só para PRO/TRF. Fixado na criação, nunca muda depois.';
comment on column public.peopleflow_movimentacoes.desligamento_info is 'DesligamentoInfo (nome/motivo/dataIso) — só para tipo_cod = DES. Fixado na criação, nunca muda depois.';
comment on column public.peopleflow_movimentacoes.sincronizado_em is 'Quando a sincronização de cargo/departamento/gestor com `colaboradores` foi de fato aplicada (PRO/TRF). Null = aprovada mas ainda não efetivada — respeita a "Data prevista" em atualizacao_info.dataPrevistaIso antes de aplicar.';

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

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Vínculo — substitui a coluna `matricula` na tela Colaboradores
-- ─────────────────────────────────────────────────────────────────────────
-- `matricula` nunca chegou a ser preenchida com dado real (sempre "—" na UI)
-- e foi substituída por `vinculo` (CLT/PJ/Estágio etc.) por pedido do RH. A
-- coluna `matricula` continua existindo na tabela (schema aditivo — nunca
-- removemos coluna), só não é mais lida/gravada pelo app.
alter table public.colaboradores
  add column if not exists vinculo text;

comment on column public.colaboradores.vinculo is 'PeopleFlow: tipo de vínculo do colaborador (ex.: CLT, PJ, Estágio).';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Desligamento pendente — ponte entre a movimentação do PeopleFlow e a
--    efetivação no Portal SST
-- ─────────────────────────────────────────────────────────────────────────
-- Concluir a etapa final (RH) de uma movimentação de Desligamento NÃO marca
-- mais `colaboradores.desligado = true` diretamente — em vez disso, cria uma
-- linha aqui. O Portal SST lê essa tabela para mostrar a notificação
-- "Desligamento pendente" no Dashboard; a efetivação real (desligado/
-- data_desligamento/motivo_desligamento/desligado_by, com ASO demissional
-- anexado se aplicável) continua acontecendo pela tela "Desligar colaborador"
-- de lá — que, ao confirmar, apaga a linha correspondente daqui.
create table if not exists public.peopleflow_desligamento_pendente (
  colaborador_nome text primary key,
  data_desligamento date,
  motivo text not null,
  solicitado_por text not null,
  criado_em timestamptz not null default now()
);

comment on table public.peopleflow_desligamento_pendente is
  'Fila de desligamentos aprovados no PeopleFlow aguardando efetivação no Portal SST (tela Desligar colaborador, com ASO demissional).';

alter table public.peopleflow_desligamento_pendente enable row level security;

drop policy if exists "authenticated_rw_desligamento_pendente" on public.peopleflow_desligamento_pendente;
create policy "authenticated_rw_desligamento_pendente"
  on public.peopleflow_desligamento_pendente
  for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Avaliação de experiência (45+90 dias)
-- ─────────────────────────────────────────────────────────────────────────
-- Uma linha por etapa avaliada (nunca sobrescrita — histórico imutável, como
-- as demais tabelas de registro deste app). `indicacao` é a sugestão
-- automática calculada a partir da nota (ver calcularIndicacao() em
-- src/domain/avaliacaoExperiencia.ts); `decisao_final` é o que o gestor
-- realmente escolheu — quando diverge da indicação, `justificativa_divergencia`
-- é obrigatória (ver AvaliacaoExperiencia em src/types/domain.ts).
create table if not exists public.peopleflow_avaliacoes_experiencia (
  id text primary key,
  colaborador_nome text not null,
  etapa text not null,
  respostas jsonb not null,
  nota_final_pct numeric not null,
  indicacao text not null,
  decisao_final text not null,
  justificativa_divergencia text not null default '',
  avaliado_por text not null,
  avaliado_em timestamptz not null default now()
);

comment on table public.peopleflow_avaliacoes_experiencia is
  'Avaliações de experiência de 45/90 dias — ver AvaliacaoExperiencia em src/types/domain.ts.';
comment on column public.peopleflow_avaliacoes_experiencia.respostas is 'Array de { perguntaId, nota } — nota de 1 a 5 por pergunta.';

alter table public.peopleflow_avaliacoes_experiencia enable row level security;

drop policy if exists "authenticated_rw_avaliacoes_experiencia" on public.peopleflow_avaliacoes_experiencia;
create policy "authenticated_rw_avaliacoes_experiencia"
  on public.peopleflow_avaliacoes_experiencia
  for all
  to authenticated
  using (true)
  with check (true);

-- Dispensa da avaliação de experiência — cobre a transição para quem já foi
-- avaliado fora do sistema (outra ferramenta/papel) antes deste módulo
-- existir: em vez de fabricar uma nota/decisão que nunca existiu de verdade,
-- o colaborador é simplesmente excluído da lista de pendências, com o motivo
-- registrado (ver pendenciasAvaliacaoExperiencia() em
-- src/domain/avaliacaoExperiencia.ts).
create table if not exists public.peopleflow_avaliacoes_experiencia_dispensas (
  colaborador_nome text primary key,
  motivo text not null default '',
  dispensado_por text not null,
  dispensado_em timestamptz not null default now()
);

comment on table public.peopleflow_avaliacoes_experiencia_dispensas is
  'Colaboradores dispensados da avaliação de experiência (já avaliados fora do sistema antes da implantação do módulo) — não aparecem na lista de pendências.';

alter table public.peopleflow_avaliacoes_experiencia_dispensas enable row level security;

drop policy if exists "authenticated_rw_avaliacoes_experiencia_dispensas" on public.peopleflow_avaliacoes_experiencia_dispensas;
create policy "authenticated_rw_avaliacoes_experiencia_dispensas"
  on public.peopleflow_avaliacoes_experiencia_dispensas
  for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 8) Gestão de Desempenho (Avaliação de Desempenho — AVD) — etapa 1
-- ─────────────────────────────────────────────────────────────────────────
-- Só estrutura nesta etapa: configuração de pesos, catálogo de competências
-- comportamentais (corporativo, vale pra todos os cargos), KPIs por cargo
-- (carga inicial a partir de planilha real do RH) e o esqueleto de
-- Avaliação/PDI — sem regras de cálculo, fluxo de aprovação, autoavaliação,
-- Matriz 9 Box ou dashboards ainda (ver README > "Gestão de Desempenho").

-- Config singleton: sempre uma linha só, id fixo 'default'. Peso dos dois
-- blocos que compõem a nota final da avaliação — editável pelo RH, soma
-- validada no cliente (não há CHECK aqui, mesmo padrão do resto do schema:
-- validação de negócio fica em TypeScript, não em constraint de banco).
create table if not exists public.peopleflow_config_avaliacao_desempenho (
  id text primary key default 'default',
  peso_kpis numeric not null default 60,
  peso_comportamental numeric not null default 40,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_config_avaliacao_desempenho is
  'Configuração geral da Avaliação de Desempenho (pesos dos blocos) — linha única, id sempre ''default''. Ver ConfigAvaliacaoDesempenho em src/types/domain.ts.';

alter table public.peopleflow_config_avaliacao_desempenho enable row level security;

drop policy if exists "authenticated_rw_config_avaliacao_desempenho" on public.peopleflow_config_avaliacao_desempenho;
create policy "authenticated_rw_config_avaliacao_desempenho"
  on public.peopleflow_config_avaliacao_desempenho
  for all
  to authenticated
  using (true)
  with check (true);

-- Catálogo corporativo de competências comportamentais — as mesmas para
-- todos os cargos da empresa (diferente dos KPIs, que são por cargo).
-- `afirmacoes` fica vazio na carga inicial (etapa 1); a escala de avaliação
-- (1 a 5) é fixa/igual pra todo mundo e por isso não vira coluna aqui — vira
-- constante em domain/avaliacaoDesempenho.ts, mesmo padrão do ESCALA
-- hardcoded em AvaliacaoExperienciaDrawer.tsx.
create table if not exists public.peopleflow_competencias_comportamentais (
  id text primary key,
  nome text not null,
  descricao text,
  afirmacoes jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_competencias_comportamentais is
  'Catálogo corporativo de competências comportamentais da Avaliação de Desempenho, comum a todos os cargos. Ver CompetenciaComportamental em src/types/domain.ts.';
comment on column public.peopleflow_competencias_comportamentais.afirmacoes is 'Array de string — afirmações avaliativas da competência (preenchidas depois da carga inicial).';

alter table public.peopleflow_competencias_comportamentais enable row level security;

drop policy if exists "authenticated_rw_competencias_comportamentais" on public.peopleflow_competencias_comportamentais;
create policy "authenticated_rw_competencias_comportamentais"
  on public.peopleflow_competencias_comportamentais
  for all
  to authenticated
  using (true)
  with check (true);

-- KPIs (Competências Técnicas) por cargo — tabela filha, cargo_nome sem FK
-- (mesmo padrão de peopleflow_descricoes_cargo_historico: consultada por
-- cargo_nome, não carregada por chave própria). Vem exclusivamente dos KPIs
-- definidos pra cada cargo (nunca das competências da Descrição de Cargo, e
-- nunca competências técnicas genéricas — ver README).
create table if not exists public.peopleflow_kpis_cargo (
  id bigint generated always as identity primary key,
  cargo_nome text not null,
  nome_indicador text not null,
  meta numeric,
  unidade_medida text,
  sentido_meta text not null,
  peso numeric,
  observacao text,
  ordem integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_kpis_cargo is
  'KPIs (Competências Técnicas) por cargo da Avaliação de Desempenho — cargo_nome referencia colaboradores.cargo. Ver KpiCargo em src/types/domain.ts.';
comment on column public.peopleflow_kpis_cargo.sentido_meta is '''Maior é Melhor'' ou ''Menor é Melhor'' — direção em que o resultado deve ir pra bater a meta.';

alter table public.peopleflow_kpis_cargo enable row level security;

drop policy if exists "authenticated_rw_kpis_cargo" on public.peopleflow_kpis_cargo;
create policy "authenticated_rw_kpis_cargo"
  on public.peopleflow_kpis_cargo
  for all
  to authenticated
  using (true)
  with check (true);

-- Avaliação de Desempenho — estrutura só, nesta etapa (sem cálculo de nota,
-- fluxo de aprovação ou autoavaliação ainda). `resultados_comportamentais`/
-- `resultados_kpis` são arrays embutidos (mesmo padrão de
-- peopleflow_avaliacoes_experiencia.respostas): snapshot do que foi avaliado
-- contra o catálogo/KPIs vigentes na época, sempre lido/escrito como uma
-- unidade com a avaliação.
create table if not exists public.peopleflow_avaliacoes_desempenho (
  id text primary key,
  colaborador_nome text not null,
  ciclo text not null,
  status text not null default 'Rascunho',
  resultados_comportamentais jsonb not null default '[]'::jsonb,
  resultados_kpis jsonb not null default '[]'::jsonb,
  comentario_comportamental text not null default '',
  comentario_tecnico text not null default '',
  comentario_geral text not null default '',
  avaliado_por text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_avaliacoes_desempenho is
  'Avaliação de Desempenho (AVD) por colaborador/ciclo — estrutura só nesta etapa, sem regra de cálculo/aprovação ainda. Ver AvaliacaoDesempenho em src/types/domain.ts.';
comment on column public.peopleflow_avaliacoes_desempenho.resultados_comportamentais is 'Array de { competenciaId, nota } — nota de 1 a 5 por competência comportamental.';
comment on column public.peopleflow_avaliacoes_desempenho.resultados_kpis is 'Array de { kpiId, resultado } — resultado numérico obtido em cada KPI do cargo.';
comment on column public.peopleflow_avaliacoes_desempenho.ciclo is 'Identificador do ciclo de avaliação, ex.: ''S1_2026''.';

alter table public.peopleflow_avaliacoes_desempenho enable row level security;

drop policy if exists "authenticated_rw_avaliacoes_desempenho" on public.peopleflow_avaliacoes_desempenho;
create policy "authenticated_rw_avaliacoes_desempenho"
  on public.peopleflow_avaliacoes_desempenho
  for all
  to authenticated
  using (true)
  with check (true);

-- PDI (Plano de Desenvolvimento Individual) — estrutura inicial, sem regra
-- automática de geração (isso é etapa futura: competência com baixo
-- desempenho gerando ação de desenvolvimento sozinha).
create table if not exists public.peopleflow_pdi (
  id bigint generated always as identity primary key,
  colaborador_nome text not null,
  avaliacao_id text,
  origem text,
  acao text not null,
  prazo date,
  status text not null default 'Pendente',
  responsavel text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_pdi is
  'Plano de Desenvolvimento Individual — estrutura inicial, sem geração automática ainda. avaliacao_id referencia peopleflow_avaliacoes_desempenho.id (sem FK), pode ficar nulo. Ver Pdi em src/types/domain.ts.';
comment on column public.peopleflow_pdi.origem is 'Texto livre indicando qual competência/KPI motivou a ação (ex.: nome da competência) — sem regra automática nesta etapa.';

alter table public.peopleflow_pdi enable row level security;

drop policy if exists "authenticated_rw_pdi" on public.peopleflow_pdi;
create policy "authenticated_rw_pdi"
  on public.peopleflow_pdi
  for all
  to authenticated
  using (true)
  with check (true);
