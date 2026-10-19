# PDI "Encerrado" — publicação (encerramento por desligamento)

Nada disto foi executado em produção até a autorização do RH. Cada passo só começa depois da validação do anterior.

| # | Onde | O que | Arquivo |
|---|---|---|---|
| 1 | SQL Editor | Backup lógico das 3 tabelas do PDI (schema próprio, conferido por hash) | `publicacao_pdi_encerramento_00_backup.local.sql` |
| 2 | SQL Editor | Migration (3 colunas, CHECK, triggers de imutabilidade) | `pdi_encerramento.sql` |
| 3 | SQL Editor | Validação (somente leitura) — tudo "OK" | `pdi_encerramento_validacao.sql` |
| 4 | Git | Merge de `feature/pdi-encerramento` em `main` + `git push` (Vercel publica) | — |
| 5 | Portal (RH) | Abrir o PDI do colaborador desligado → **Encerrar por desligamento** → confirmar o motivo | — |
| 6 | SQL Editor | Validação final: PDI idêntico ao backup, exceto status e campos de encerramento | `publicacao_pdi_encerramento_03_validacao.local.sql` |

O código novo tolera a migration ausente apenas para leitura; o botão de encerramento só funciona depois do passo 2.

## Regras
- "Encerrado" ≠ "Concluído": itens, ações, evidências, sugestões e histórico ficam exatamente como estavam; nenhuma ação é concluída ou cancelada.
- Só o RH encerra, só PDI aberto, só de colaborador que o cadastro prova ter saído (sem homônimo ativo). Motivo obrigatório; data e responsável gravados pelo servidor; auditoria em `peopleflow_dev_auditoria` (`pdi_encerrado`).
- O PDI encerrado é imutável (trigger no banco): nem o RH reabre pela tela. Reverter só pelo SQL de reversão, com autorização.
- Dashboards de desempenho (RH, Diretoria e Gestor) mostram a contagem "PDIs encerrados" separada; o relatório de pendências dos desligados deixa de listar o PDI encerrado.

## Reversão
- Código: `git revert -m 1 <merge>`.
- Banco: `pdi_encerramento_rollback.sql` — recusa se houver PDI encerrado, salvo `v_permitir_perda := true` depois de backup (os PDIs voltam a "Em andamento"; itens e ações nunca são alterados).
