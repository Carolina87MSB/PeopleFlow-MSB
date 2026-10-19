# Publicação — desligamentos globais (sequência definitiva)

Cada passo só começa depois de a validação do anterior estar "OK" **e** da autorização expressa do RH. Nenhum passo foi executado em produção
até aqui. Scripts com ids/uuids reais ficam em `supabase/publicacao_desligamentos_*.local.sql` (ignorados pelo git; repositório público).

| # | Onde | O que | Arquivo | Autorização |
|---|---|---|---|---|
| 0 | Local | `git tag pre-desligamentos-globais` em `main` (ponto de retorno do código) | — | sim |
| 1 | SQL Editor | Backup lógico em schema próprio + manifesto (linhas/hash) | `publicacao_desligamentos_00_backup.local.sql` | sim |
| 2 | Painel Supabase | Export CSV de `colaboradores` e `peopleflow_movimentacoes` (cópia fora do banco) | — | sim |
| 3 | SQL Editor | Migration (regra central, histórico de rescisões, guardas, RLS) + validação | `desligamentos_historico_e_situacao.sql` → `_validacao.sql` | sim |
| 4 | SQL Editor | Carga das 24 rescisões (idempotente, aborta se totais divergirem) + validação | `rescisoes_historico_2026-10-19.local.sql` | sim |
| 5 | SQL Editor | Retirada lógica de 3 desligados da turma TRN-2026-0001 | `publicacao_desligamentos_01_turma_trn0001.local.sql` | sim |
| 6 | SQL Editor | Revogação do acesso `peopleflow` de 3 desligados (SST e ativos intactos) | `publicacao_desligamentos_02_acessos_peopleflow.local.sql` | sim |
| 7 | Git | Merge de `feature/desligamentos-globais` em `main` + `git push` (Vercel publica sozinho) | — | sim |
| 8 | SQL Editor | Validação final (somente leitura, 20 verificações) | `publicacao_desligamentos_03_validacao.local.sql` | — |
| 9 | Portal (RH) | Validação funcional logada (roteiro abaixo) | — | — |
| 10 | SQL Editor | Opcional: adoção da regra central na view de conformidade | `desligamentos_adocao_conformidade.sql` | sim |

O código tolera a migration ausente (a leitura do histórico devolve vazio), por isso a ordem banco → código é segura; o inverso também é.

## Reversão (por passo)
- 7 (código): `git revert -m 1 <merge>` + push, ou `git reset` ao tag do passo 0 numa branch de retorno. As tabelas novas ficam sem uso.
- 6 (acessos): `publicacao_desligamentos_02_acessos_peopleflow_rollback.local.sql` (restaura do backup, mesmos valores).
- 5 (turma): `publicacao_desligamentos_01_turma_trn0001_rollback.local.sql` (devolve os participantes; registra auditoria).
- 4/3 (histórico/migration): `desligamentos_historico_e_situacao_rollback.sql` — recusa se houver linhas no histórico, salvo `v_permitir_perda := true` **depois** do backup.
- 10: `desligamentos_adocao_conformidade_rollback.sql` (usa a definição guardada no backup).
- Tudo: o schema `backup_desligamentos_20261019` guarda o estado anterior das tabelas afetadas.

## Roteiro de validação funcional (perfil RH, ambiente real)
1. **Dashboard Executivo** (01/01–19/10/2026, cadastro de 19/10 às 12:38): Admissões 27 · Desligamentos 22 · Conversões 2 · Rescisões contratuais 24 · Turnover 40,50% · HC 58→63 (média 60,5); nenhum valor financeiro; Marcelo e Ítalo seguem no quadro. (A simulação anterior — 26 / 62 / 40,00% — foi feita antes do registro de uma admissão de 05/10 no cadastro; novas admissões ou saídas no cadastro mudam estes números.)
2. **Desligados**: lista os 7 já no cadastro; card de pendências com **5 itens** — 3 fechamentos financeiros sem lançamento (colaboradores 24, 40 e 59; os outros 4 já têm fechamento), 1 divergência de data da MP do colaborador 24 e 1 PDI em andamento do colaborador 40; somente leitura. Depois do encerramento do PDI (ver `pdi_encerramento_PUBLICACAO.md`) passam a ser 4.
3. **Colaboradores**: nenhum desligado aparece como ativo; Marcelo/Ítalo ativos.
4. **MPs / Aprovadas**: M-2026-009 e as MPs de efetivação inalteradas; M-2026-027 com a data original.
5. **Desenvolvimento → TRN-2026-0001**: 60 inscritos; os 3 retirados constam como histórico.
6. **Avaliação de Desempenho / PDI**: PDI do colaborador desligado segue "Em andamento", sem novas sugestões na triagem ("Gerar sugestões" ignora PDIs de desligados).
7. **Acesso**: login de um dos 3 desligados é recusado no PeopleFlow; login no SST permanece como estava; um colaborador ativo qualquer entra normalmente.
