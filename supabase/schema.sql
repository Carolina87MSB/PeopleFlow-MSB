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

-- Trilha de reabertura (RH reprova → RH restaura para nova análise) e de
-- edição pontual de campos de `dados` (ex.: corrigir Salário/Data prevista
-- antes de reanalisar) — ver EventoHistoricoMovimentacao em
-- src/types/domain.ts e reabrirParaRH()/editarDadosMovimentacao() em
-- src/domain/workflow.ts. Nunca sobrescrito, só anexado.
alter table public.peopleflow_movimentacoes
  add column if not exists historico jsonb not null default '[]'::jsonb;

comment on column public.peopleflow_movimentacoes.historico is 'Array de { data, hora, autor, acao, detalhe } — reaberturas e edições pós-criação, nunca apagado.';

-- Carta de Movimentação de Pessoal — integrada ao mesmo registro de
-- movimentação (nunca uma tabela/fluxo separado), só pra PRO/TRF/SAL já
-- aprovadas. Ver CartaMovimentacao em src/types/domain.ts e
-- src/domain/cartaMovimentacao.ts (podeEmitirCarta/emitirCarta/darCiencia/
-- marcarEntregue). null = carta ainda não emitida.
alter table public.peopleflow_movimentacoes
  add column if not exists carta_movimentacao jsonb;

comment on column public.peopleflow_movimentacoes.carta_movimentacao is 'CartaMovimentacao — { emitidaEm, emitidaPor, descricaoAlteracao, assinaturaGestor, finalizadaEm, entregueAoColaborador, entregueEm, entreguePor }. A única ciência registrada no sistema é a do gestor responsável (nome/cargo/data/status), nunca aprovação — a aprovação já aconteceu no fluxo de Etapas antes da carta existir.';

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

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Gestão de Desempenho — etapa 2 (funcionamento da AVD)
-- ─────────────────────────────────────────────────────────────────────────
-- Ciclo de avaliação de desempenho, aberto pelo RH. Ao abrir um ciclo, o
-- sistema gera automaticamente 1 linha em peopleflow_avaliacoes_desempenho
-- por colaborador ativo, com o conjunto de competências comportamentais e
-- KPIs do cargo já "travado" no momento da criação (ver comentário na coluna
-- ciclo_id abaixo, e ResultadoComportamental/ResultadoKpi em
-- src/types/domain.ts).
create table if not exists public.peopleflow_ciclos_avaliacao_desempenho (
  id text primary key,
  nome text not null,
  periodo_referencia text not null,
  data_inicio date not null,
  data_encerramento date not null,
  criado_por text,
  criado_em timestamptz not null default now()
);

comment on table public.peopleflow_ciclos_avaliacao_desempenho is
  'Ciclo de Avaliação de Desempenho (AVD) aberto pelo RH — ao criar, gera automaticamente 1 avaliação por colaborador ativo. Ver CicloAvaliacaoDesempenho em src/types/domain.ts.';

alter table public.peopleflow_ciclos_avaliacao_desempenho enable row level security;

drop policy if exists "authenticated_rw_ciclos_avaliacao_desempenho" on public.peopleflow_ciclos_avaliacao_desempenho;
create policy "authenticated_rw_ciclos_avaliacao_desempenho"
  on public.peopleflow_ciclos_avaliacao_desempenho
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.peopleflow_avaliacoes_desempenho
  add column if not exists ciclo_id text;

comment on column public.peopleflow_avaliacoes_desempenho.ciclo_id is 'Referencia peopleflow_ciclos_avaliacao_desempenho.id (sem FK) — a coluna ciclo (texto) continua guardando o nome do ciclo, pra exibição sem join.';
comment on column public.peopleflow_avaliacoes_desempenho.resultados_comportamentais is 'Array de { competenciaId, notasAfirmacoes: (number|null)[] } — o conjunto de competências (e quantas afirmações cada uma tinha) fica travado no momento da criação da avaliação, não é recalculado depois.';
comment on column public.peopleflow_avaliacoes_desempenho.resultados_kpis is 'Array de { kpiId, resultado: number|null } — o conjunto de KPIs (do cargo do colaborador no momento da criação) fica travado, o gestor não pode incluir indicador manualmente.';

-- ─────────────────────────────────────────────────────────────────────────
-- 10) Gestão de Desempenho — complementação da etapa 2
-- ─────────────────────────────────────────────────────────────────────────
-- Status do ciclo: só ciclo "Aberto" aceita edição das suas avaliações —
-- "Encerrado" trava todas elas de uma vez (ver podeEditarAvaliacaoDesempenho()
-- em usePortalData.ts). Não existe reabertura de ciclo nesta etapa.
alter table public.peopleflow_ciclos_avaliacao_desempenho
  add column if not exists status text not null default 'Aberto';

comment on column public.peopleflow_ciclos_avaliacao_desempenho.status is '''Aberto'' ou ''Encerrado'' — encerrar trava a edição de todas as avaliações do ciclo, mesmo as "Em andamento". Sem reabertura nesta etapa.';

-- cargo/departamento/gestor_avaliador: snapshot da estrutura organizacional
-- no momento em que o ciclo gerou a avaliação (mesmo espírito de "travar no
-- momento da criação" já usado pra competências/KPIs) — preserva o dado
-- histórico mesmo que o colaborador seja promovido/transferido depois.
-- gestor_avaliador em branco = colaborador sem gestor cadastrado na hora da
-- geração; a avaliação só aparece pro RH tratar (nenhum gestor bate com
-- string vazia em podeEditarAvaliacaoDesempenho()).
alter table public.peopleflow_avaliacoes_desempenho
  add column if not exists cargo text,
  add column if not exists departamento text,
  add column if not exists gestor_avaliador text,
  add column if not exists concluido_por text,
  add column if not exists concluido_em timestamptz,
  add column if not exists nota_final numeric,
  add column if not exists media_tecnica numeric,
  add column if not exists media_comportamental numeric;

comment on column public.peopleflow_avaliacoes_desempenho.gestor_avaliador is 'Snapshot de colaboradores.gestor no momento da criação — vazio significa colaborador sem gestor definido, avaliação só visível/tratável pelo RH.';
comment on column public.peopleflow_avaliacoes_desempenho.concluido_por is 'Quem clicou em "Concluir avaliação" — só preenchido quando status = Concluída.';
comment on column public.peopleflow_avaliacoes_desempenho.nota_final is 'Nota final calculada (ver domain/avaliacaoDesempenho.ts) — recalculada e regravada a cada save, não só na conclusão. Junto com media_tecnica/media_comportamental, é a base do histórico por colaborador/ciclo (comparativo entre ciclos, Matriz 9 Box etc. ficam pra etapas futuras).';

-- Auditoria básica — append-only (nenhuma policy de update/delete é
-- necessária, RLS libera só select/insert na prática pelo app).
create table if not exists public.peopleflow_log_avaliacao_desempenho (
  id bigint generated always as identity primary key,
  ciclo_id text,
  avaliacao_id text,
  acao text not null,
  detalhe text,
  usuario text not null,
  criado_em timestamptz not null default now()
);

comment on table public.peopleflow_log_avaliacao_desempenho is
  'Auditoria básica da AVD (criação de ciclo, geração de avaliações, início, salvamentos, conclusão) — gravação best-effort, nunca bloqueia a ação principal. Ver registrarLogAvaliacaoDesempenho() em src/repositories/logAvaliacaoDesempenhoRepository.ts.';
comment on column public.peopleflow_log_avaliacao_desempenho.acao is 'Ex.: CICLO_CRIADO, AVALIACOES_GERADAS, AVALIACAO_INICIADA, AVALIACAO_SALVA, AVALIACAO_CONCLUIDA.';

alter table public.peopleflow_log_avaliacao_desempenho enable row level security;

drop policy if exists "authenticated_rw_log_avaliacao_desempenho" on public.peopleflow_log_avaliacao_desempenho;
create policy "authenticated_rw_log_avaliacao_desempenho"
  on public.peopleflow_log_avaliacao_desempenho
  for all
  to authenticated
  using (true)
  with check (true);

-- =====================================================================
-- 11) Gestão de Desempenho — snapshot completo da avaliação (botão "Abrir
-- ciclo"): além do CONJUNTO de competências/KPIs (já travado desde a etapa
-- 2), agora também se congela o TEXTO de cada um dentro dos próprios jsonb
-- resultados_comportamentais/resultados_kpis — nome/descrição/afirmações da
-- competência, nome/descrição/meta/unidade/sentido/peso do KPI. Não precisa
-- de coluna nova (já são jsonb), só documentar o novo formato.
-- =====================================================================

comment on column public.peopleflow_avaliacoes_desempenho.resultados_comportamentais is
  'Array de { competenciaId, competenciaNome, competenciaDescricao, afirmacoes: string[], notasAfirmacoes: (number|null)[] } — nome/descrição/afirmações da competência ficam congelados no momento da criação (snapshot), não refletem edições futuras em peopleflow_competencias_comportamentais.';
comment on column public.peopleflow_avaliacoes_desempenho.resultados_kpis is
  'Array de { kpiId, kpiNome, kpiDescricao, meta, unidadeMedida, sentidoMeta, peso, resultado } — nome/descrição/meta/unidade/sentido/peso do KPI ficam congelados no momento da criação (snapshot), não refletem edições futuras em peopleflow_kpis_cargo.';

-- =====================================================================
-- 12) Gestão de Desempenho — Etapa 2.1: múltiplos tipos de avaliação
-- (Gestor/Autoavaliação/Liderança) no mesmo ciclo, elegibilidade por tempo
-- de empresa e catálogo de competências de Liderança.
-- =====================================================================

alter table public.peopleflow_avaliacoes_desempenho
  add column if not exists tipo text not null default 'GESTOR',
  add column if not exists avaliado text;

comment on column public.peopleflow_avaliacoes_desempenho.tipo is
  '''GESTOR'' (nota oficial da AVD, gestor avalia o liderado) | ''AUTOAVALIACAO'' (mesma estrutura, nota armazenada à parte, nunca compõe a oficial) | ''LIDERANCA'' (só competências de liderança, sem KPI — gerada só se o colaborador tiver gestor).';
comment on column public.peopleflow_avaliacoes_desempenho.avaliado is
  'Quem está sendo avaliado nesta ficha — igual a colaborador_nome em GESTOR/AUTOAVALIACAO; em LIDERANCA é o gestor cujo estilo de liderança está sendo avaliado (colaborador_nome continua sendo o liderado "dono" do conjunto de até 3 fichas do ciclo).';

alter table public.peopleflow_competencias_comportamentais
  add column if not exists categoria text not null default 'Comportamental';

comment on column public.peopleflow_competencias_comportamentais.categoria is
  '''Comportamental'' (catálogo corporativo, usado nas avaliações GESTOR/AUTOAVALIACAO) ou ''Lideranca'' (catálogo exclusivo da avaliação LIDERANCA) — mesma tabela, só filtrada por categoria na hora de gerar o snapshot do ciclo.';

-- =====================================================================
-- 13) Gestão de Desempenho — Etapa 3: Plano de Desenvolvimento Individual
-- (PDI). Gerado automaticamente quando uma avaliação GESTOR é concluída,
-- identificando competências/KPIs abaixo da nota mínima configurável.
-- `peopleflow_pdi` (existente desde a etapa 1, nunca teve dado real) vira o
-- cabeçalho do plano; `acao`/`prazo`/`responsavel`/`origem` (antigas, uma
-- linha = uma "ação" solta) ficam sem uso, mantidas por não serem
-- destrutivas.
-- =====================================================================

alter table public.peopleflow_pdi
  add column if not exists ciclo_id text,
  add column if not exists ciclo text,
  add column if not exists gestor_responsavel text,
  add column if not exists comentarios text,
  add column if not exists concluido_por text,
  add column if not exists concluido_em timestamptz;

-- `acao` era NOT NULL sem default (fazia sentido quando cada linha era uma
-- ação solta) — o novo cabeçalho de plano nunca preenche essa coluna, então
-- precisa parar de exigir valor. `status` também troca de significado: era
-- o status de uma ação solta ("Pendente"), passa a ser o status do PLANO
-- INTEIRO ("Não iniciado" | "Em andamento" | "Concluído").
alter table public.peopleflow_pdi alter column acao drop not null;
alter table public.peopleflow_pdi alter column status set default 'Não iniciado';

comment on table public.peopleflow_pdi is
  'Plano de Desenvolvimento Individual — cabeçalho do plano (etapa 3). Gerado automaticamente na conclusão de uma avaliação GESTOR, vinculado ao mesmo ciclo. ciclo_id referencia peopleflow_ciclos_avaliacao_desempenho.id (sem FK). gestor_responsavel é snapshot do gestor_avaliador da avaliação que originou o plano (mesma lógica de congelamento da AVD) — autoridade de edição usa este campo OU o gestor atual do colaborador (união). Colunas acao/prazo/responsavel/origem são da etapa 1 (uma linha = uma ação solta) e ficam sem uso — os itens/ações de verdade vivem em peopleflow_pdi_itens/peopleflow_pdi_acoes. Ver Pdi em src/types/domain.ts.';
comment on column public.peopleflow_pdi.status is '''Não iniciado'' | ''Em andamento'' | ''Concluído'' — status do plano inteiro, não de uma ação (ver peopleflow_pdi_acoes.status pra isso).';
comment on column public.peopleflow_pdi.gestor_responsavel is 'Snapshot de avaliacoes_desempenho.gestor_avaliador no momento da geração do PDI — não recalculado se o colaborador trocar de gestor depois.';

create table if not exists public.peopleflow_pdi_itens (
  id text primary key,
  pdi_id bigint not null,
  competencia_id text,
  competencia_nome text not null,
  tipo_competencia text not null,
  nota_obtida numeric,
  origem_manual boolean not null default false,
  objetivo_desenvolvimento text not null default '',
  responsavel text not null default '',
  data_inicio date,
  data_prevista_conclusao date,
  status text not null default 'Não iniciada',
  observacoes text not null default '',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_pdi_itens is
  'Um item de desenvolvimento (1 competência comportamental ou KPI) dentro de um PDI — pdi_id referencia peopleflow_pdi.id (sem FK). id gerado no cliente (gerarIdPdiItem()), não bigint identity, pra poder montar a árvore toda antes de inserir.';
comment on column public.peopleflow_pdi_itens.tipo_competencia is '''Comportamental'' | ''Tecnica''.';
comment on column public.peopleflow_pdi_itens.origem_manual is 'true = gestor incluiu manualmente; false = sugerido automaticamente por nota abaixo do limite configurado (config_avaliacao_desempenho.nota_minima_pdi).';
comment on column public.peopleflow_pdi_itens.status is '''Não iniciada'' | ''Em andamento'' | ''Concluída'' | ''Cancelada''.';

create table if not exists public.peopleflow_pdi_acoes (
  id text primary key,
  item_id text not null,
  descricao text not null,
  responsavel text not null default '',
  prazo date,
  status text not null default 'Não iniciada',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_pdi_acoes is
  'Uma ação de desenvolvimento dentro de um item do PDI — item_id referencia peopleflow_pdi_itens.id (sem FK). Sem limite de quantidade por item.';

create table if not exists public.peopleflow_pdi_biblioteca (
  chave text not null,
  tipo_competencia text not null,
  objetivo_sugerido text not null default '',
  acoes_sugeridas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (chave, tipo_competencia)
);

comment on table public.peopleflow_pdi_biblioteca is
  'Biblioteca de modelos de objetivo/ações por competência, mantida pelo RH — consultada na geração automática do PDI. chave é o id estável de peopleflow_competencias_comportamentais (tipo_competencia=''Comportamental'') ou o nome do KPI (tipo_competencia=''Tecnica'', sem id estável entre cargos). Sem modelo cadastrado, a geração usa um objetivo genérico e nenhuma ação pré-sugerida.';
comment on column public.peopleflow_pdi_biblioteca.acoes_sugeridas is 'Array de strings (descrição da ação) — sem responsável/prazo, que são só por instância.';

alter table public.peopleflow_pdi_itens enable row level security;
drop policy if exists "authenticated_rw_pdi_itens" on public.peopleflow_pdi_itens;
create policy "authenticated_rw_pdi_itens"
  on public.peopleflow_pdi_itens
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.peopleflow_pdi_acoes enable row level security;
drop policy if exists "authenticated_rw_pdi_acoes" on public.peopleflow_pdi_acoes;
create policy "authenticated_rw_pdi_acoes"
  on public.peopleflow_pdi_acoes
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.peopleflow_pdi_biblioteca enable row level security;
drop policy if exists "authenticated_rw_pdi_biblioteca" on public.peopleflow_pdi_biblioteca;
create policy "authenticated_rw_pdi_biblioteca"
  on public.peopleflow_pdi_biblioteca
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.peopleflow_config_avaliacao_desempenho
  add column if not exists nota_minima_pdi numeric not null default 3;

comment on column public.peopleflow_config_avaliacao_desempenho.nota_minima_pdi is
  'Nota mínima (escala 1-5) — competências/KPIs com nota abaixo deste valor são sugeridos automaticamente pro PDI na conclusão da avaliação GESTOR. Editável pelo RH na aba Configuração.';

-- =====================================================================
-- 14) Gestão de Desempenho — Etapa 4: Avaliação de Potencial. Módulo
-- independente da AVD (não altera nota_final nem o PDI), gerado
-- automaticamente junto com o ciclo de AVD, 5 perguntas fixas de escala
-- 1-5, nota = média simples. Usada só pra alimentar a futura Matriz 9 Box
-- (não implementada nesta etapa) — a nota já fica disponível pra consumo
-- futuro por outros módulos.
-- =====================================================================

create table if not exists public.peopleflow_avaliacoes_potencial (
  id text primary key,
  ciclo_id text not null,
  ciclo text not null,
  colaborador_nome text not null,
  cargo text,
  departamento text,
  gestor_avaliador text,
  respostas jsonb not null default '[]'::jsonb,
  comentario text not null default '',
  status text not null default 'Não iniciada',
  nota_potencial numeric,
  concluido_por text,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.peopleflow_avaliacoes_potencial is
  'Avaliação de Potencial — independente da AVD, gerada automaticamente junto com o ciclo (1 por colaborador elegível, mesma regra de elegibilidade de peopleflow_avaliacoes_desempenho). ciclo_id referencia peopleflow_ciclos_avaliacao_desempenho.id (sem FK). gestor_avaliador é snapshot de colaborador.gestor no momento da geração. Nunca altera nota_final/media_* da AVD nem o PDI — só alimenta a futura Matriz 9 Box. Ver AvaliacaoPotencial em src/types/domain.ts.';
comment on column public.peopleflow_avaliacoes_potencial.respostas is
  'Array de { perguntaId, pergunta, nota } — pergunta é snapshot do texto no momento da geração (mesma lógica de snapshot da AVD), não reflete mudanças futuras nas 5 perguntas fixas (ver PERGUNTAS_POTENCIAL em src/domain/avaliacaoPotencial.ts).';
comment on column public.peopleflow_avaliacoes_potencial.status is
  '''Não iniciada'' | ''Em andamento'' | ''Concluída'' — mesmo domínio de peopleflow_avaliacoes_desempenho.status.';
comment on column public.peopleflow_avaliacoes_potencial.nota_potencial is
  'Média simples das respostas já dadas, recalculada a cada gravação (calcularNotaPotencial()) — nunca calculada em outro lugar.';

alter table public.peopleflow_avaliacoes_potencial enable row level security;
drop policy if exists "authenticated_rw_avaliacoes_potencial" on public.peopleflow_avaliacoes_potencial;
create policy "authenticated_rw_avaliacoes_potencial"
  on public.peopleflow_avaliacoes_potencial
  for all
  to authenticated
  using (true)
  with check (true);

-- =====================================================================
-- 15) Gestão de Desempenho — Etapa 5: Matriz 9 Box. NÃO cria tabela nova —
-- a matriz é uma view puramente derivada de peopleflow_avaliacoes_desempenho
-- (tipo GESTOR, status Concluída) + peopleflow_avaliacoes_potencial (status
-- Concluída), nunca persistida, sem edição manual de posição. Só precisa de
-- 4 limiares configuráveis pelo RH + reforço de unicidade nas 2 tabelas de
-- origem (o join da matriz depende de no máximo 1 ficha Concluída por
-- colaborador/ciclo em cada uma).
-- =====================================================================

alter table public.peopleflow_config_avaliacao_desempenho
  add column if not exists matriz_desempenho_limite_medio numeric not null default 3,
  add column if not exists matriz_desempenho_limite_alto numeric not null default 4,
  add column if not exists matriz_potencial_limite_medio numeric not null default 3,
  add column if not exists matriz_potencial_limite_alto numeric not null default 4;

comment on column public.peopleflow_config_avaliacao_desempenho.matriz_desempenho_limite_medio is
  'Nota mínima (escala 1-5) pra classificar Desempenho como "Médio" na Matriz 9 Box — abaixo disso é "Baixo". Editável pelo RH na aba Configuração.';
comment on column public.peopleflow_config_avaliacao_desempenho.matriz_desempenho_limite_alto is
  'Nota mínima (escala 1-5) pra classificar Desempenho como "Alto" na Matriz 9 Box. Editável pelo RH na aba Configuração.';
comment on column public.peopleflow_config_avaliacao_desempenho.matriz_potencial_limite_medio is
  'Nota mínima (escala 1-5) pra classificar Potencial como "Médio" na Matriz 9 Box — abaixo disso é "Baixo". Editável pelo RH na aba Configuração.';
comment on column public.peopleflow_config_avaliacao_desempenho.matriz_potencial_limite_alto is
  'Nota mínima (escala 1-5) pra classificar Potencial como "Alto" na Matriz 9 Box. Editável pelo RH na aba Configuração.';

-- Reforço de unicidade — a checagem "select antes de inserir" já existente em
-- criarCicloComAvaliacoes()/criarAvaliacoesPotencial() protege contra
-- duplicidade no caminho normal, mas não é uma garantia de banco. O join da
-- Matriz 9 Box (1 ficha GESTOR Concluída + 1 ficha de Potencial Concluída
-- por colaborador/ciclo, escolhida via Map) depende dessa unicidade de
-- verdade. Se esta migração falhar, já existe uma duplicidade real nos
-- dados — investigar manualmente antes de tentar de novo, não ignorar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avaliacoes_desempenho_ciclo_tipo_colaborador_key') then
    alter table public.peopleflow_avaliacoes_desempenho
      add constraint avaliacoes_desempenho_ciclo_tipo_colaborador_key unique (ciclo_id, tipo, colaborador_nome);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'avaliacoes_potencial_ciclo_colaborador_key') then
    alter table public.peopleflow_avaliacoes_potencial
      add constraint avaliacoes_potencial_ciclo_colaborador_key unique (ciclo_id, colaborador_nome);
  end if;
end $$;

-- =====================================================================
-- 16) Gestão de Desempenho — Etapa 6: Comitê de Calibração. RH (que
-- representa o Comitê — não é perfil novo) revisa a AVD (ficha GESTOR) e a
-- Avaliação de Potencial já concluídas pelo gestor e, se necessário, ajusta
-- a média comportamental e/ou a nota de potencial antes de virarem Nota
-- Oficial. `status` (AVD/Potencial) NÃO muda de significado — continua
-- "Não iniciada"/"Em andamento"/"Concluída", indicando só se o gestor
-- terminou de preencher. `status_calibracao`, campo novo e independente,
-- carrega o fluxo de calibração em cima disso: "Não iniciada" (default,
-- irrelevante pra AUTOAVALIACAO/LIDERANCA, que nunca saem daqui) →
-- "Aguardando Calibração" (as 2 fichas do par concluídas pelo gestor) →
-- "Homologada" (RH decidiu). A nota original do gestor (notaFinal/
-- notaPotencial) NUNCA é sobrescrita — nota_final_oficial/nota_oficial são
-- campos à parte, preservando o histórico completo (nota inicial, nota
-- oficial, quem/quando calibrou e homologou) sem precisar de tabela nova.
-- =====================================================================

alter table public.peopleflow_avaliacoes_desempenho
  add column if not exists status_calibracao text not null default 'Não iniciada',
  add column if not exists media_comportamental_calibrada numeric,
  add column if not exists nota_final_oficial numeric,
  add column if not exists justificativa_calibracao text not null default '',
  add column if not exists calibrado_por text,
  add column if not exists calibrado_em timestamptz,
  add column if not exists homologado_por text,
  add column if not exists homologado_em timestamptz;

comment on column public.peopleflow_avaliacoes_desempenho.status_calibracao is
  '''Não iniciada'' | ''Aguardando Calibração'' | ''Homologada'' — fluxo de calibração do Comitê (RH), independente de `status`. Só avança pra além de "Não iniciada" em fichas tipo GESTOR (nunca AUTOAVALIACAO/LIDERANCA), e só quando a ficha de Potencial irmã (mesmo ciclo/colaborador) também estiver "Concluída".';
comment on column public.peopleflow_avaliacoes_desempenho.media_comportamental_calibrada is
  'Override do RH pra media_comportamental — null significa "sem calibração, mantém o valor original do gestor". Média técnica (KPIs) nunca é calibrável.';
comment on column public.peopleflow_avaliacoes_desempenho.nota_final_oficial is
  'Nota Oficial da AVD — calculada na homologação (calcularNotaOficialAvd()), usando media_comportamental_calibrada quando presente, senão a média original. É esta nota, nunca notaFinal do gestor, que a Matriz 9 Box e demais módulos devem consumir.';

alter table public.peopleflow_avaliacoes_potencial
  add column if not exists status_calibracao text not null default 'Não iniciada',
  add column if not exists nota_potencial_calibrada numeric,
  add column if not exists nota_oficial numeric,
  add column if not exists justificativa_calibracao text not null default '',
  add column if not exists calibrado_por text,
  add column if not exists calibrado_em timestamptz,
  add column if not exists homologado_por text,
  add column if not exists homologado_em timestamptz;

comment on column public.peopleflow_avaliacoes_potencial.status_calibracao is
  '''Não iniciada'' | ''Aguardando Calibração'' | ''Homologada'' — mesmo fluxo/mesma regra da AVD (avança junto com a ficha GESTOR irmã do mesmo ciclo/colaborador).';
comment on column public.peopleflow_avaliacoes_potencial.nota_potencial_calibrada is
  'Override do RH pra nota_potencial — null significa "sem calibração, mantém o valor original".';
comment on column public.peopleflow_avaliacoes_potencial.nota_oficial is
  'Nota Oficial de Potencial — calculada na homologação (calcularNotaOficialPotencial()). É esta nota, nunca nota_potencial do gestor, que a Matriz 9 Box e demais módulos devem consumir.';

-- =====================================================================
-- 17) Gestão de Desempenho — Etapa 8: Dashboards e Relatórios. NÃO cria
-- tabela nova — os 3 dashboards (RH/Gestor/Diretoria) são puramente
-- derivados dos dados já existentes. A única adição real é o rastreio da
-- "devolutiva" (conversa de feedback gestor→colaborador pós-avaliação),
-- que não tinha nenhum registro até aqui: 3 colunas na ficha AVD, só
-- relevantes pra ficha tipo GESTOR já Homologada pelo Comitê de
-- Calibração (dar feedback baseado numa nota que ainda pode ser
-- recalibrada não faz sentido).
-- =====================================================================

alter table public.peopleflow_avaliacoes_desempenho
  add column if not exists devolutiva_realizada boolean not null default false,
  add column if not exists devolutiva_por text,
  add column if not exists devolutiva_em timestamptz;

comment on column public.peopleflow_avaliacoes_desempenho.devolutiva_realizada is
  'Marca se a conversa de feedback (devolutiva) pós-homologação já aconteceu — só uma ação disponível pra ficha tipo GESTOR com status_calibracao = ''Homologada''. Sem "desmarcar" no fluxo atual.';
comment on column public.peopleflow_avaliacoes_desempenho.devolutiva_por is
  'Nome de quem marcou a devolutiva como realizada (RH ou o gestor_avaliador da ficha).';
comment on column public.peopleflow_avaliacoes_desempenho.devolutiva_em is
  'Timestamp de quando a devolutiva foi marcada como realizada.';

-- =====================================================================
-- 18) Dashboard Executivo de RH (People Analytics) — evolução do Dashboard
-- Gerencial. Linha única (id='default'), mesmo padrão de
-- peopleflow_config_avaliacao_desempenho. headcount_planejado é o ÚNICO
-- indicador parametrizado manualmente pelo RH em todo o Dashboard Executivo
-- — todos os outros (Headcount Real, Aderência, Turnover, Admissões,
-- Desligamentos, Tempo Médio de Empresa etc.) são calculados a partir de
-- dados já existentes (colaboradores.admissao_iso/desligado/data_desligamento).
-- =====================================================================

create table if not exists public.peopleflow_config_dashboard (
  id text primary key default 'default',
  headcount_planejado numeric,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.peopleflow_config_dashboard is
  'Configuração do Dashboard Executivo de RH — linha única. Ver ConfigDashboard em src/types/domain.ts.';
comment on column public.peopleflow_config_dashboard.headcount_planejado is
  'Quantidade de colaboradores planejada pela empresa — único valor manual do Dashboard Executivo, usado pra calcular "Aderência ao Planejamento" (Headcount Real ÷ Headcount Planejado). null = ainda não definido pelo RH.';

alter table public.peopleflow_config_dashboard enable row level security;

drop policy if exists "authenticated_rw_config_dashboard" on public.peopleflow_config_dashboard;
create policy "authenticated_rw_config_dashboard"
  on public.peopleflow_config_dashboard
  for all
  to authenticated
  using (true)
  with check (true);

-- =====================================================================
-- 19) Gestão de Desempenho — correção da regra de elegibilidade da AVD. A
-- elegibilidade deixa de ser "6 meses completos de empresa até a data de
-- encerramento do ciclo" (cálculo relativo, que dependia de quando o ciclo
-- fechava e podia incluir por engano quem foi admitido depois do período
-- avaliado) e passa a ser uma data de corte de admissão explícita, definida
-- pelo RH na abertura do ciclo: colaborador com admissão em ou antes dessa
-- data é elegível, depois dela não é — ver
-- elegivelParaCicloAvaliacaoDesempenho() em src/domain/avaliacaoDesempenho.ts.
-- Coluna nullable só porque ciclos já existentes antes desta etapa não têm
-- valor (nenhuma ficha antiga é recalculada); todo ciclo novo sempre grava,
-- o formulário de abertura exige o campo.
-- =====================================================================

alter table public.peopleflow_ciclos_avaliacao_desempenho add column if not exists data_corte_admissao date;

comment on column public.peopleflow_ciclos_avaliacao_desempenho.data_corte_admissao is
  'Data de corte de admissão deste ciclo — colaborador com admissão em ou antes desta data é elegível, depois dela não é. Substitui o cálculo de "6 meses completos de empresa", que dependia de quando o ciclo fechava.';

-- =====================================================================
-- 20) Descrição de Cargo — edição por Gestor (escopo) + bloco "Aprovações".
-- Gestor passa a poder editar, nos cargos sob sua liderança (ver
-- cargoSobLiderancaDe() em src/domain/hierarquia.ts), os grupos "Sumário do
-- cargo", "Principais responsabilidades", "Requisitos do cargo" e
-- "Competências e requisitos desejáveis" — "Dados do formulário
-- (auditoria)", "Informações do cargo" e "EPIs" continuam RH-only. O
-- histórico de edições (peopleflow_descricoes_cargo_historico, já existente)
-- é reaproveitado sem mudança de estrutura. Estas 4 colunas novas guardam o
-- registro de quem elaborou/revisou e quem aprovou o documento, cada um com
-- sua data — nunca texto livre. (O mecanismo de gravação foi corrigido na
-- seção 21 abaixo: a princípio estas colunas eram preenchidas por botões
-- "Marcar"/"Aprovar" soltos, sem relação com a edição em si — agora são
-- preenchidas automaticamente pelo próprio fluxo de edição/aprovação.)
-- =====================================================================

alter table public.peopleflow_descricoes_cargo
  add column if not exists elaborado_por text,
  add column if not exists elaborado_em timestamptz,
  add column if not exists aprovado_por text,
  add column if not exists aprovado_em timestamptz;

comment on column public.peopleflow_descricoes_cargo.elaborado_por is
  'Nome de quem elaborou/revisou o conteúdo (gestor ou analista de RH) — gravado ao clicar em "Marcar elaboração/revisão", nunca texto livre.';
comment on column public.peopleflow_descricoes_cargo.aprovado_por is
  'Nome de quem aprovou o documento (RH ou Diretoria) — gravado ao clicar em "Aprovar", nunca texto livre.';

-- =====================================================================
-- 21) Descrição de Cargo — corrige o fluxo pra revisão/aprovação de fato.
-- Correção da seção 20: até aqui, a edição de um Gestor gravava direto nas
-- colunas oficiais (sumario/responsabilidades/etc.) — na prática, "aprovado
-- automaticamente" só por ele editar, o que não é o esperado pelo RH/
-- Diretoria. Agora:
--   • Gestor edita um dos 4 grupos liberados → grava em `pendente` (jsonb,
--     só com os campos propostos), `status` vira 'Em revisão' — as colunas
--     oficiais NÃO mudam até alguém aprovar.
--   • RH/Diretoria edita → grava direto nas colunas oficiais (like antes),
--     `status` vira 'Aprovada', `aprovado_por/em` = o próprio editor (RH/
--     Diretoria é a autoridade de aprovação, não precisa de uma segunda
--     aprovação pra sua própria edição).
--   • RH/Diretoria aprova uma proposta pendente → aplica `pendente` nas
--     colunas oficiais, `status` vira 'Aprovada', limpa `pendente`.
--   • RH/Diretoria rejeita → descarta `pendente` (nunca chega a virar
--     oficial), `status` vira 'Rejeitada'; o Gestor pode propor de novo.
-- `elaborado_por/em` seguem preenchidos automaticamente a cada edição
-- (proposta ou direta) — nunca mais por um botão solto. Ver
-- src/domain/descricaoCargo.ts e src/store/usePortalData.ts.
-- `perfil` na tabela de histórico registra quem editou como Gestor/RH/
-- Diretoria no momento da ação (pedido explícito de rastreabilidade).
-- =====================================================================

alter table public.peopleflow_descricoes_cargo
  add column if not exists status text not null default 'Aprovada',
  add column if not exists pendente jsonb;

alter table public.peopleflow_descricoes_cargo_historico
  add column if not exists perfil text;

comment on column public.peopleflow_descricoes_cargo.status is
  '''Aprovada'' | ''Em revisão'' | ''Rejeitada'' — controla se o conteúdo oficial (sumario/responsabilidades/etc.) reflete a última proposta ou se há uma em `pendente` aguardando decisão do RH/Diretoria.';
comment on column public.peopleflow_descricoes_cargo.pendente is
  'Proposta de alteração de um Gestor, aguardando aprovação — objeto {campo: novoValor} só com os campos de conteúdo dos 4 grupos liberados (nunca os de auditoria/EPIs). Nunca é o valor lido fora da tela de revisão; null quando não há revisão em aberto.';
comment on column public.peopleflow_descricoes_cargo_historico.perfil is
  'Perfil de quem editou (Gestor/RH/Diretoria) no momento da ação — snapshot, não recalculado.';

-- ─────────────────────────────────────────────────────────────────────────
-- 22) Matriz 9 Box — exceção pontual de escopo pra Gestor. Por padrão, um
-- Gestor só vê na Matriz 9 Box quem tem `colaboradores.gestor = seu nome`
-- (reporte direto no organograma) — ver colaboradoresParaMatriz9Box em
-- usePortalData.ts. Alguns Gestores avaliam pessoas fora da própria árvore
-- (ex.: reassumiram fichas de Avaliação de Potencial de outro gestor) e
-- precisam ver a matriz da empresa inteira, sem virar RH/Diretoria (que
-- ganhariam acesso a cadastros/configuração/calibração também). Coluna
-- booleana pontual, ligada manualmente pelo RH via SQL quando necessário —
-- não tem tela própria por ser uma exceção rara, não um fluxo recorrente.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.colaboradores
  add column if not exists matriz9box_visao_completa boolean not null default false;

comment on column public.colaboradores.matriz9box_visao_completa is
  'PeopleFlow: true libera a um Gestor ver a Matriz 9 Box da empresa inteira, não só quem tem gestor = seu nome. Sem efeito pra perfil RH/Diretoria (que já veem tudo) nem Colaborador (que nunca vê a aba). Ligado manualmente pelo RH via SQL.';

-- ─────────────────────────────────────────────────────────────────────────
-- 23) Custo Mensal Folha — parâmetros de encargos patronais. Linha única
-- (id='default'), mesmo padrão de peopleflow_config_dashboard. Revisão desta
-- seção: a versão original (array genérico `componentes`) foi substituída
-- por colunas nomeadas antes de qualquer ambiente rodar o script — os
-- percentuais abaixo vieram da análise da Folha de Pagamento 07/2026 +
-- DARF eSocial/Previdenciário da MSB (fornecidos pelo RH), nunca inventados
-- pelo código. `rat` é o GIILRAT efetivamente recolhido identificado no
-- documento — o FAP real da MSB não foi comprovado, `rat_observacao`
-- registra essa ressalva (nunca entra no cálculo). `fgts_celetista`/
-- `fgts_aprendiz` distintos porque o percentual de FGTS depende do vínculo
-- (ver ehAprendiz() em domain/salario.ts). Ver custoMensalFolha() em
-- domain/salario.ts pra fórmula exata (encargos diretos + provisões +
-- encargos sobre as provisões).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.peopleflow_config_encargos_folha (
  id text primary key default 'default',
  inss_patronal numeric not null default 20.00,
  rat numeric not null default 1.00,
  rat_observacao text not null default 'Parâmetro provisório — confirmar FAP vigente da MSB com Financeiro/DP.',
  terceiros numeric not null default 5.80,
  fgts_celetista numeric not null default 8.00,
  fgts_aprendiz numeric not null default 2.00,
  provisao_decimo_terceiro numeric not null default 8.3333,
  provisao_ferias numeric not null default 8.3333,
  provisao_terco_ferias numeric not null default 2.7778,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.peopleflow_config_encargos_folha
  add column if not exists inss_patronal numeric not null default 20.00,
  add column if not exists rat numeric not null default 1.00,
  add column if not exists rat_observacao text not null default 'Parâmetro provisório — confirmar FAP vigente da MSB com Financeiro/DP.',
  add column if not exists terceiros numeric not null default 5.80,
  add column if not exists fgts_celetista numeric not null default 8.00,
  add column if not exists fgts_aprendiz numeric not null default 2.00,
  add column if not exists provisao_decimo_terceiro numeric not null default 8.3333,
  add column if not exists provisao_ferias numeric not null default 8.3333,
  add column if not exists provisao_terco_ferias numeric not null default 2.7778;

comment on table public.peopleflow_config_encargos_folha is
  'Parâmetros de encargos patronais do Custo Mensal Folha (tela de Colaboradores) — linha única. Ver ConfigEncargosFolha em src/types/domain.ts.';
comment on column public.peopleflow_config_encargos_folha.rat is
  'GIILRAT efetivo identificado na documentação da MSB (1,00%) — NÃO confirmado como o FAP real (ver rat_observacao). Nunca multiplicar por um FAP adicional sem confirmação do Financeiro/DP.';

alter table public.peopleflow_config_encargos_folha enable row level security;

drop policy if exists "authenticated_rw_config_encargos_folha" on public.peopleflow_config_encargos_folha;
create policy "authenticated_rw_config_encargos_folha"
  on public.peopleflow_config_encargos_folha
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.peopleflow_config_encargos_folha (id)
values ('default')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 24) Salário base — fallback de planilha. `salarioVigente()` (domain/
-- salario.ts) prioriza o salário derivado de movimentação de pessoal
-- (PRO/SAL aprovada); só usa esta tabela quando o colaborador não tem
-- nenhuma movimentação com salário reconhecível. Snapshot pontual importado
-- de planilha fornecida pelo RH (Colaborador x Salário.xlsx) — não é uma
-- segunda fonte "oficial" nem substitui a Movimentação de Pessoal como
-- mecanismo de reajuste; existe só pra preencher a lacuna dos colaboradores
-- que nunca tiveram uma Promoção/Reajuste Salarial registrada no portal.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.peopleflow_salarios_base (
  colaborador_nome text primary key,
  salario numeric not null,
  importado_em timestamptz not null default now(),
  importado_por text
);

comment on table public.peopleflow_salarios_base is
  'Fallback de salário importado de planilha (RH) — só usado quando o colaborador não tem salário derivável de movimentação de pessoal. Ver SalarioBase em src/types/domain.ts e salarioVigente() em src/domain/salario.ts.';
comment on column public.peopleflow_salarios_base.colaborador_nome is
  'Nome exatamente como veio da planilha de origem — comparado por norm() (sem acento/case) no momento do lookup, nunca recasado nesta tabela.';

alter table public.peopleflow_salarios_base enable row level security;

drop policy if exists "authenticated_rw_salarios_base" on public.peopleflow_salarios_base;
create policy "authenticated_rw_salarios_base"
  on public.peopleflow_salarios_base
  for all
  to authenticated
  using (true)
  with check (true);
