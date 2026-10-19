# Integração financeira dos desligamentos — publicação

Nada disto roda em produção sem a autorização expressa do RH para cada etapa. Scripts com ids/valores reais ficam em `supabase/publicacao_financeiro_*.local.sql` (ignorados pelo git; repositório público).

## Resumo do que muda
- **Rescisão** = líquido da folha, validado pelo RH (individual ou em lote). Divergência com um lançamento existente e líquido R$ 0,00 só saem por decisão/confirmação expressa. A validação do líquido independe da GRRF.
- **GRRF** = total efetivamente recolhido, registrado pelo RH com depósito e multa separados e a fonte documental. Nada é calculado nem presumido a partir do saldo FGTS ou de percentuais.
- **Lançamento manual** (desligamento futuro, sem folha importada): salvar apenas LANÇA o valor. Ele só passa a valer depois da **validação expressa do RH, por componente**, com fonte documental, responsável e data. Alterar um valor já validado desfaz a validação daquele componente. GRRF "não aplicável" = R$ 0,00 resolvido, com justificativa registrada; um 0 lançado, sozinho, é GRRF pendente.
- **Pendências financeiras** = pessoas únicas (cadastro e histórico da folha) com rescisão ou GRRF ainda não validadas; quem tem os dois pendentes conta uma vez. A Conferência mostra os dois componentes separadamente.
- **Cadastro do desligado e Dashboard são alimentados pela mesma validação** (sem digitação duplicada). Dashboard: só valores validados, por mês efetivo, com cobertura e total parcial identificado; cada pessoa uma vez (cadastro × histórico); conversões de estágio nunca entram.
- **Acesso:** valores individuais e gravações só pelo servidor e só para o RH; a Diretoria recebe apenas totais mensais; o Gestor vê só quantidades. **(Substituído na Etapa 4: por decisão do RH, por ora só o RH vê qualquer informação financeira.)** O acesso direto do navegador à tabela `peopleflow_desligamentos` é fechado em migration separada, depois do deploy.
- Sem nova Serverless Function: as ações `financeiro_*` rodam dentro de `api/desenvolvimento.ts` (a pasta `api/` segue com 11 arquivos; limite de 12 no plano Hobby da Vercel).

## Sequência
| # | Onde | O que | Arquivo |
|---|---|---|---|
| 0 | Local | Tag de retorno do código | `git tag pre-financeiro-desligamentos` |
| 1 | SQL Editor | Backup lógico (fechamentos, histórico, rubricas, cadastro) | `publicacao_financeiro_00_backup.local.sql` |
| 2 | SQL Editor | Migration aditiva (validação por componente, trilha, colunas de origem) + validação | `desligamentos_financeiro.sql` → `desligamentos_financeiro_validacao.sql` |
| 3 | Git | Merge de `feature/financeiro-desligamentos` em `main` + push (Vercel publica) | — |
| 4 | Portal (RH) | Conferência financeira: validar líquidos, registrar GRRF, decidir divergências | — |
| 5 | SQL Editor | Validação do estado real (comparação com o backup) | `publicacao_financeiro_03_validacao.local.sql` |
| 6 | SQL Editor | Fechamento do acesso direto à tabela de fechamentos (só depois de 3–5 aprovados) | `desligamentos_financeiro_fechar_acesso.sql` |
| 7 | SQL Editor | Validação final (checagem 13 passa a verdadeira) | `publicacao_financeiro_03_validacao.local.sql` |

O código novo tolera a migration ausente apenas em leitura (a tela avisa "migration pendente" e fica sem gravação).

## Reversão
- Código: `git revert -m 1 <merge>`.
- Fechamento do acesso: `desligamentos_financeiro_fechar_acesso_rollback.sql`.
- Migration: `desligamentos_financeiro_rollback.sql` — recusa se houver validações/trilha; com `v_permitir_perda := true` (após backup) remove as estruturas e **nunca** altera os valores importados nem os fechamentos originais.
- Backup: schema `backup_financeiro_20261019` + JSON fora do banco.

## Roteiro de homologação (RH)
1. Desligados → aba **Conferência financeira**: 22 desligamentos (as 2 conversões de estágio para CLT aparecem à parte, sem custo).
2. Validar em lote os sem divergência (19 linhas); decidir a divergência (valor lançado × líquido da folha) e conferir os dois líquidos R$ 0,00 antes de validar.
3. Registrar a GRRF por guia/demonstrativo (depósito, multa, total); confirmar a modalidade da rescisão que não a informa no relatório.
4. Dashboard Executivo: quadro "Custos de Rescisão por mês" com Rescisão, GRRF, Total, cobertura e `*` nos totais parciais.
5. Gaveta de cada desligado: valores vindos da folha (sem digitar de novo).

## Etapa 2 — Lançamento simples (diálogo único)
Substitui o fluxo em duas etapas (lançar → validar com fonte documental) e o registro de GRRF com depósito/multa/fonte por **um único diálogo "Lançar e confirmar valores"**:
- **Valor da Rescisão** = líquido a pagar ao colaborador. **Valor da GRRF** = total da guia de FGTS rescisório a pagar pela empresa. Sem anexos, TRCT, guia, fonte documental nem depósito/multa separados.
- A **confirmação expressa do RH salva e valida numa única operação** (usuário, data e trilha automáticos). A origem fica registrada internamente como `informado_rh` ("Informado e confirmado pelo RH") — não é apresentada como conferência de documento.
- GRRF pode ficar **pendente** (sem valor disponível) ou **não aplicável** (R$ 0,00 resolvido, com justificativa obrigatória). Um 0 informado como valor não resolve a GRRF.
- **Alterar valor já confirmado** exige novo motivo e nova confirmação; o valor, o responsável, a data e a origem anteriores ficam na trilha (`peopleflow_fechamentos_log`, somente inserção).
- Desligamento com folha: a Rescisão é o líquido da folha (imutável); o diálogo pode confirmá-lo junto. Divergência com lançamento anterior e líquido R$ 0,00 seguem exigindo decisão/conferência expressa; a modalidade ausente segue sendo exigida para a GRRF.
- Dashboard: reflete automaticamente os valores confirmados, sem duplicidade, com totais parciais marcados (`*`) e cobertura "x de y".
- As ações antigas (`financeiro_grrf_registrar`, `financeiro_fechamento_salvar`, `financeiro_fechamento_validar`) permanecem no servidor por compatibilidade e testes, mas a interface não as usa mais.

| # | Onde | O que | Arquivo |
|---|---|---|---|
| 8 | Local | Tag de retorno do código | `git tag pre-financeiro-lancamento-simples` |
| 9 | SQL Editor | Migration aditiva: amplia as origens aceitas (`informado_rh`) em `peopleflow_desligamentos_validacao_chk` e `peopleflow_rubricas_grrf_chk`. **Nenhuma linha é alterada**; responsável, data e consistência seguem exigidos | `desligamentos_financeiro_lancamento_simples.sql` |
| 10 | SQL Editor | Validação (somente leitura): constraints ampliadas e validadas, 24 rubricas, ≥ 19 líquidos validados, 7 fechamentos, trilha intacta | `desligamentos_financeiro_lancamento_simples_validacao.sql` |
| 11 | Git | Merge de `feature/financeiro-lancamento-simples` em `main` + push (Vercel publica). **A migration (9) precisa estar aplicada antes** | — |
| 12 | Portal (RH) | Homologação: abrir um desligado → "Lançar e confirmar valores"; conferir Dashboard | — |

Reversão: código `git revert -m 1 <merge>`; migration `desligamentos_financeiro_lancamento_simples_rollback.sql` (recusa se já houver valores com origem `informado_rh`, para não perder a rastreabilidade).
Se o código for publicado **antes** da migration, o banco recusa a gravação com a origem nova (constraint) — nada é gravado pela metade; por isso a ordem 9 → 11.
A migration de fechamento do acesso direto à tabela (passo 6) continua separada e **não** faz parte desta etapa.

## Etapa 3 — Fechamento do acesso direto (final)
Depois da homologação do RH. Remove o acesso do **navegador** (anon/authenticated) à tabela `peopleflow_desligamentos`; o servidor (service_role) continua com acesso total.
- **RH:** continua vendo e registrando (Conferência financeira e diálogo "Lançar e confirmar valores"), tudo pelo servidor.
- **Diretoria:** só os totais mensais agregados (servidor); listar individual, validar e gravar → 403.
- **Gestor:** nenhum valor financeiro (listar, agregado e gravar → 403); só quantidades, que não vêm desta tabela.
- **Nenhum código do navegador usa a tabela** (teste estático em `tests/financeiro/teste_dominio.ts`); só `api/_lib/financeiroDesligamentos.ts` a acessa. Contadores e alertas de pendência financeira são só do RH.
- A migration **não altera nenhuma linha, coluna, constraint ou trigger**; é atômica e se desfaz sozinha se a verificação final não confirmar o fechamento. Exige o lançamento simples já aplicado.
- `supabase/schema.sql` (instalações novas) já nasce fechado.

| # | Onde | O que | Arquivo |
|---|---|---|---|
| 13 | Local | Tag de retorno do código | `git tag pre-financeiro-fechar-acesso` |
| 14 | SQL Editor | Pré-checagem (somente leitura): acesso atual, objetos dependentes (esperado: nenhum), contagens | `desligamentos_financeiro_fechar_acesso_prechecagem.sql` |
| 15 | SQL Editor | Migration de fechamento do acesso direto | `desligamentos_financeiro_fechar_acesso.sql` |
| 16 | SQL Editor | Validação final (somente leitura) | `desligamentos_financeiro_fechar_acesso_validacao.sql` e `publicacao_financeiro_03_validacao.local.sql` (13 verificações) |
| 17 | Portal | Teste rápido por perfil (RH vê e registra; Diretoria só o quadro agregado; Gestor sem valores) | — |
| 18 | Git | Merge de `feature/financeiro-fechar-acesso` em `main` + push (só testes, documentação e `schema.sql`: nenhuma mudança de comportamento do portal; o código já no ar não usa a tabela) | — |

Reversão: `desligamentos_financeiro_fechar_acesso_rollback.sql` (recria a política e os privilégios anteriores; não toca nos dados).

## Etapa 4 — Informação financeira só para o RH (temporário)
Decisão do RH: **por enquanto somente o RH** visualiza informações financeiras de desligamentos — individuais **e agregadas**. A liberação para Diretoria e/ou Gestores será decidida depois pelo RH.
- **Servidor:** `financeiro_agregado` passou a exigir o RH (como as demais ações). Diretoria, Gestor, colaborador e conta desligada recebem 403 em **todas** as ações `financeiro_*`, sem dados (teste percorre as 9 ações).
- **Interface:** o Dashboard só busca e mostra valores para o RH (Diretoria/Gestor veem apenas a quantidade de desligamentos); a lista e a gaveta de Desligados escondem o status e o fechamento financeiro de quem não é RH. A coluna "Total" do quadro passou a "Custo Total".
- **Sem mudança de dados:** nenhuma migration, nenhum valor alterado, nenhuma validação automática. Conferência financeira e lançamento simplificado do RH inalterados.
- **Para liberar depois:** basta trocar `exigirRH` por uma regra de perfil em `agregado` (e `veValoresFinanceiros` no Dashboard) — nada no banco.
- **Atenção ao período:** o Dashboard abre com os **últimos 30 dias**; para ver todos os meses (19 líquidos = R$ 89.311,10), ajustar o período (ex.: 01/01/2026 até hoje).

Publicação: só código (merge + push). Reversão: `git revert -m 1 <merge>`.
