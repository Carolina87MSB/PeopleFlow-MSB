# Habilitação de Responsáveis por Treinamentos — Etapa 1 (banco)

**Situação:** PROPOSTA preparada e testada em réplica local. **Nada foi executado em produção.** Aguarda validação e autorização expressa.

## O que a Etapa 1 entrega

| Arquivo | Função |
|---|---|
| `supabase/desenvolvimento_habilitacao_responsaveis_prechecagem.sql` | Somente leitura. Rodar antes: confirma o ponto de partida e guarda contagens. |
| `supabase/desenvolvimento_habilitacao_responsaveis.sql` | A migration (transacional e idempotente). |
| `supabase/desenvolvimento_habilitacao_responsaveis_validacao.sql` | Somente leitura. Rodar depois: cada linha deve dar `ok = true`; as contagens devem coincidir com a pré-checagem. |
| `supabase/desenvolvimento_habilitacao_responsaveis_rollback.sql` | Reversão. |
| `tests/treinamentos/teste_habilitacao_banco.ts` | 12 testes (`npm run test:treinamentos-habilitacao`, também em `npm test`). |

## O que a migration faz

1. **Habilitações** (`peopleflow_dev_responsaveis_gestao`, tabela hoje vazia em produção):
   - ganha `situacao` (`indicada` → `habilitada` | `recusada`; `habilitada` → `revogada`), `origem` (`indicacao_gestor` | `rh_direto`), `departamento` (área na habilitação), `habilitado_em/por`, `recusado_em/por/motivo`;
   - `ativo` continua existindo e passa a ser derivado (`ativo = situação 'habilitada'`), por isso **o código que está em produção hoje (Gestor indica/revoga) segue funcionando sem alteração**;
   - uma habilitação ativa por colaborador (vinculada a uma única gestão) e uma indicação pendente por par gestor × colaborador;
   - motivo obrigatório para recusar e revogar; identidade (colaborador, gestão, indicação, origem) imutável; registros recusados/revogados são históricos; sem exclusão (já existia).
2. **Transferências de responsabilidade** (`peopleflow_dev_transferencias_responsabilidade`, nova): histórico imutável (RH lê; só o servidor grava; motivo e tipo obrigatórios). Quem registrou o treinamento continua em `solicitado_por_colaborador_id`.
3. **Leitura (RLS)** — separa quem **administra** de quem só **ensina**:
   - responsável designado = `responsavel_colaborador_id` (o instrutor deixa de contar como responsável);
   - perfil `Responsavel` só vê o que está sob a sua responsabilidade **e enquanto a habilitação estiver ativa** (revogou, perdeu na hora);
   - instrutor lê o treinamento e a turma (somente leitura), **nunca evidências nem vínculos com necessidades**.

## Impacto nas permissões existentes (matriz real, antes × depois)

Cenário de teste: Hugo (Responsável habilitado pela gestora Bia), Fabio (instrutor), Bia (Gestora), Gil (Gestor de outra área), RH. Treinamentos: A (Hugo responsável, Fabio instrutor), B (Bia responsável, Hugo instrutor), C (Bia, sem instrutor), D (Gil responsável, Bia instrutora).

| Quem | Lê (treinamentos / evidências / turma / vínculos) ANTES | DEPOIS |
|---|---|---|
| RH | ABCD / ABD / ABCD / AD | **igual** |
| Gestora Bia | ABCD / ABD / ABCD / AD | ABCD / **AB** / ABCD / **A** — em D ela só é instrutora: lê treinamento e turma, não evidências nem vínculos |
| Hugo (Responsável habilitado) | ABC / AB / ABC / — | **AB / A / AB** / — — perde C (gestão de outra pessoa); em B só como instrutor (sem evidências) |
| Fabio (só instrutor) | A / A / A / — | A / **—** / A / — — evidências deixam de ser lidas |
| Gil (Gestor de outra área) | D / D / D / D | **igual** |

Outras consequências:
- **Revogação passa a valer na hora na leitura:** Hugo, revogado, vê só B (instrutor); o RH continua vendo tudo; o registro da revogação e o treinamento (responsável e quem registrou) permanecem intactos.
- **Responsável designado que NÃO é habilitado** (perfil Responsavel sem habilitação ativa) deixa de ver o treinamento que lhe foi designado (aparece no teste existente "22. RLS" do fluxo). Em produção hoje: **nenhum caso** (8 treinamentos, todos com responsável = quem registrou, e nenhuma conta do módulo com perfil Responsavel). Na Etapa 2 a API passa a só aceitar habilitados (ou RH/Gestor) como responsáveis.
- **Código de produção atual:** a suíte de operação (88 verificações, código real do servidor) passa integralmente com a migration aplicada. A suíte de fluxo tem 3 diferenças esperadas: a de leitura acima e 2 do teste de reversão da Fase 5, que exige desfazer esta migration antes (reversões são feitas em ordem inversa).
- **Uma habilitação ativa por colaborador:** um mesmo colaborador deixa de poder ser habilitado por duas gestões ao mesmo tempo (decisão de "vinculada à área/gestão"). Hoje não há nenhuma habilitação.

## Testes previstos e executados (todos em réplica local, dados fictícios)

1. Dados no modelo anterior (código de produção) → migration **não altera nenhum dado** (hash de treinamentos, participantes, evidências, auditoria, necessidades, contas, escopo, QR, avaliações, notas) e converte as habilitações (ativa → habilitada; revogada → revogada).
2. Idempotência (reaplicar não muda dados nem estrutura).
3. Matriz de leitura antes × depois (tabela acima).
4. Reversão devolve **exatamente** o estado anterior (funções, políticas, colunas, índices, constraints, dados e comportamento de leitura), é repetível e permite reaplicar.
5. Reversão **recusada** com transferência registrada e com indicação pendente/recusada (nada é alterado).
6. Código atual continua funcionando (indicar/revogar pelo Gestor; 409 em duplicidade; motivo obrigatório).
7. Fluxo novo: indicada → habilitada | recusada, habilitada → revogada, motivos obrigatórios, transições inválidas recusadas, identidade imutável, sem exclusão/truncate, uma habilitação ativa por colaborador.
8. Revogação encerra a visão administrativa na hora, preservando o histórico.
9. Transferências: só o RH lê; navegador não grava; imutáveis; motivo, tipo e origem ≠ destino validados.
10. Permissões do banco: `anon` sem acesso; `authenticated` só lê (políticas); funções novas executáveis só por `authenticated`/`service_role`; habilitações continuam só do servidor.

Suítes existentes seguem verdes sem a migration: fluxo 96/96 e operação 88/88.

## Como seria aplicada (só com autorização)

1. SQL Editor → `..._prechecagem.sql` (somente leitura) e guardar o resultado.
2. SQL Editor → `desenvolvimento_habilitacao_responsaveis.sql` (uma transação; em caso de erro nada é aplicado).
3. SQL Editor → `..._validacao.sql`: todas as linhas `ok = true`; contagens iguais às da pré-checagem.
4. Se necessário: `..._rollback.sql` (recusa-se se já houver indicação pendente, recusa ou transferência).

## O que NÃO faz (fica para as próximas etapas)

API (indicar → RH habilita/recusa/revoga, transferir pendentes, conclusão e acompanhamento da reação pelo habilitado e pelo Gestor, regras de instrutor nas ações), interface (tela do RH, "Responsáveis da gestão"), acesso específico para quem tem menos de seis meses de empresa e rotinas de revisão por desligamento/mudança de área.
