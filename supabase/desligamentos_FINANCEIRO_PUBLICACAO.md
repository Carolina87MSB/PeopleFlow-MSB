# Integração financeira dos desligamentos — publicação

Nada disto roda em produção sem a autorização expressa do RH para cada etapa. Scripts com ids/valores reais ficam em `supabase/publicacao_financeiro_*.local.sql` (ignorados pelo git; repositório público).

## Resumo do que muda
- **Rescisão** = líquido da folha, validado pelo RH (individual ou em lote). Divergência com um lançamento existente e líquido R$ 0,00 só saem por decisão/confirmação expressa. A validação do líquido independe da GRRF.
- **GRRF** = total efetivamente recolhido, registrado pelo RH com depósito e multa separados e a fonte documental. Nada é calculado nem presumido a partir do saldo FGTS ou de percentuais.
- **Lançamento manual** (desligamento futuro, sem folha importada): salvar apenas LANÇA o valor. Ele só passa a valer depois da **validação expressa do RH, por componente**, com fonte documental, responsável e data. Alterar um valor já validado desfaz a validação daquele componente. GRRF "não aplicável" = R$ 0,00 resolvido, com justificativa registrada; um 0 lançado, sozinho, é GRRF pendente.
- **Pendências financeiras** = pessoas únicas (cadastro e histórico da folha) com rescisão ou GRRF ainda não validadas; quem tem os dois pendentes conta uma vez. A Conferência mostra os dois componentes separadamente.
- **Cadastro do desligado e Dashboard são alimentados pela mesma validação** (sem digitação duplicada). Dashboard: só valores validados, por mês efetivo, com cobertura e total parcial identificado; cada pessoa uma vez (cadastro × histórico); conversões de estágio nunca entram.
- **Acesso:** valores individuais e gravações só pelo servidor e só para o RH; a Diretoria recebe apenas totais mensais; o Gestor vê só quantidades. O acesso direto do navegador à tabela `peopleflow_desligamentos` é fechado em migration separada, depois do deploy.
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
