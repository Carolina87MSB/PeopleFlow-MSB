# Publicação coordenada — habilitação de responsáveis, ausências/reposições e conferência (Portal de Treinamentos)

**Estado:** preparada, **nada executado em produção**. Cada etapa em produção exige autorização expressa e separada.
**Branch:** `feature/habilitacao-responsaveis-etapa1` (base `d9e0792` = `origin/main` atual, sem divergência: o merge é direto, sem conflitos).
**Quem faz o quê:** quem roda SQL no Supabase SQL Editor é a Carolina; quem faz merge/push/deploy só age depois da autorização dela.

## 1. O que vai (e o que não vai)
- Só arquivos do Portal de Treinamentos e do que ele toca: `api/desenvolvimento.ts`, `api/_lib/desenvolvimentoAcoes.ts`, telas em `src/features/desenvolvimento/`, o acesso específico "Treinamentos" (`AppShell`, `Sidebar`, `useConta`, `types/domain.ts`), `src/domain/gravacao.ts` (uma função nova de exibição), 4 scripts SQL + backup, testes, demonstração local (`tests/demo`, não vai para o build) e documentação.
- Nenhuma função nova de API na Vercel (continuam 11). Nenhuma variável de ambiente nova. Nenhum arquivo fora de `api/ src/ supabase/ tests/ docs/`. A planilha `Simulacao_Saneamento_Competencias_Comportamentais.xlsx` da raiz **não** faz parte do branch e não deve ser commitada.

## 2. Verificações já feitas (em réplica local; produção não foi tocada)
| Verificação | Resultado |
|---|---|
| Compatibilidade da migration com o **código atualmente publicado** (`d9e0792`), incluindo a nova política de evidências | Suíte de operação do código publicado: 88/88 com a migration aplicada. Suíte de fluxo: 94/96; as 2 diferenças são os testes de *rollback da Fase 5*, que passam a exigir reverter antes a migration nova (ordem de reversão, esperado). |
| Dados existentes preservados (treinamentos, participantes, presenças, evidências, listas de presença, auditoria, necessidades, contas, escopo, QR, avaliações de reação) | Fotografia com hash antes × depois: **idêntica**; colunas novas nascem vazias; idempotente (aplicar 2 vezes não muda nada). |
| Reversão | Devolve funções, políticas (inclusive `dev_evidencias_leitura`), colunas, índices e constraints **exatamente** ao estado anterior; recusa-se se já houver transferência/ausência encaminhada (registros de rastreabilidade). |
| Efeito da nova política de leitura de evidências | Matriz real por papel, antes × depois: RH e gestão dona do treinamento **sem perda**; Responsável só o que administra (como já documentado); **único efeito novo**: o Gestor de *outra* área (só um liderado na turma) deixa de ler o material **da turma** (lista, ata, materiais), mantendo o comprovante individual do liderado. Com o código atual no ar, a tela desse gestor apenas lista menos evidências. |
| PDF da lista de presença — campo **Local** | A geração do PDF **não foi alterada** neste branch. Testado com registros com URL: link do SharePoint → "Ambiente virtual — SharePoint"; sala/endereço e link curto de reunião → como cadastrado; valor gravado nunca muda. **Limitação já existente na versão publicada:** um link de reunião muito longo (não-SharePoint, ~90+ caracteres) sai **cortado** no PDF. A pré-checagem (linha C-36) conta quantos registros têm URL longa. Correção possível (opcional, fora deste branch): imprimir "Microsoft Teams"/"Link online (site)" nesses casos, como já ocorre no cabeçalho. |
| Suítes completas, build, `tsc` da API, lint | Sem falhas (ver relatório da execução). |

## 3. Backup e plano de recuperação
**Antes da migration (autorização própria):**
1. Em Supabase > Database > Backups, confirmar que existe backup automático recente (anotar data/hora). *(Só a Carolina enxerga isso.)*
2. Rodar `supabase/desenvolvimento_habilitacao_responsaveis_backup.sql`: cria o schema isolado `backup_pre_habilitacao` com cópia de **todas** as tabelas `peopleflow_dev_*` e o registro das definições (funções, políticas, constraints, índices, gatilhos) que a migration altera; não altera nada existente; recusa-se a sobrescrever. Guardar o resultado final (tabelas × linhas × hash).
3. O Storage (PDFs e anexos) **não** é tocado pela migration: não entra no backup.

**Recuperação, por situação:**
| Situação | Ação |
|---|---|
| Erro durante a migration | Ela é uma transação: nada é aplicado. Corrigir e repetir. |
| Migration aplicada, validação com `ok = false` ou comportamento estranho, **antes do deploy** | O código atual segue funcionando (compatível). Rodar `…_rollback.sql` (devolve ao estado anterior; não há dados novos ainda) e conferir com a pré-checagem. |
| Problema **depois do deploy** | 1º reverter o código: `git revert -m 1 <merge>` e push (deploy automático do estado anterior). A migration **permanece** (compatível com o código antigo). **Não** rodar o rollback SQL se já houver habilitações, transferências ou ausências encaminhadas: ele recusa por desenho (rastreabilidade). |
| Corrupção de dados (não esperada: a migration não altera dados existentes) | Comparar a tabela com o schema de backup (hash) e restaurar seletivamente a partir de `backup_pre_habilitacao`, caso a caso, com revisão antes. |
| Descarte do backup | Só após a homologação final, com autorização: `drop schema backup_pre_habilitacao cascade;` |

## 4. Pré-checagem (somente leitura)
Arquivo: `supabase/desenvolvimento_habilitacao_responsaveis_prechecagem.sql` — **uma consulta só**; colar a tabela inteira de volta. Situações: `OK`, `INFO`, `ATENÇÃO` (não impede, mas muda o que será exibido) e `BLOQUEIA` (não aplicar). Grupos: A) estado e dependências (fase 5c, funções-base, política atual de evidências, gravação e avaliação de reação aplicadas?); B) habilitações e perfis; C) dados que a nova interface vai exibir (ausências, registros incompletos, URLs no Local); D) fotografia de contagens.
**Execução em produção:** não realizada por mim (não tenho acesso ao banco; a execução é da Carolina). Rodei o mesmo arquivo na réplica local com dados fictícios: executa sem erro, em uma consulta, sem alterar nada. Resultado real: **pendente**.

## 5. Sequência exata
Pré-requisitos: janela de baixo uso; RH avisado de que, ao entrar no ar, **gestores deixam de registrar treinamento até serem habilitados pelo RH** (decisão do modelo) — ter em mãos os e-mails das lideranças para habilitar logo em seguida quem precisa registrar.

| # | Passo | Quem | Critério para seguir |
|---|---|---|---|
| 0 | Autorização expressa da Carolina para iniciar (e para cada passo abaixo, se preferir separadamente) | Carolina | — |
| 1 | Confirmar backup automático recente no Supabase | Carolina | existe e é de hoje |
| 2 | Pré-checagem (§4) — enviar o resultado | Carolina → Claude | nenhuma linha `BLOQUEIA`; linhas `ATENÇÃO` entendidas |
| 3 | Backup lógico (§3) — enviar a conferência | Carolina | todas as tabelas copiadas; linhas = pré-checagem |
| 4 | **Migration** `desenvolvimento_habilitacao_responsaveis.sql` | Carolina | executa sem erro |
| 5 | **Validação** `…_validacao.sql` — enviar | Carolina → Claude | todas as linhas `verificação` com `ok = true`; contagens = pré-checagem; transferências = 0 |
| 6 | Teste com o código **ainda antigo** no ar: RH abre Treinamentos (agenda e concluídos), abre um treinamento concluído e a lista de presença; um gestor abre a agenda; um colaborador abre "Meus treinamentos" | Carolina | sem erro e com os mesmos números de antes |
| 7 | Merge `--no-ff` do branch em `main` e push (deploy automático da Vercel) | Claude, **só com autorização** | build da Vercel "Ready" |
| 8 | Testes pós-deploy (§6) | Carolina (+ Claude conferindo) | todos OK |
| 9 | RH habilita as pessoas reais conforme os e-mails das lideranças | Carolina | habilitações aparecem em "Habilitados" |
| 10 | Piloto com treinamento marcado "Treinamento de homologação/teste" (roteiro em `docs/habilitacao-responsaveis-roteiro-homologacao.md`) | Carolina | roteiro sem ✗ nos itens 2.3, 6.x, 7.1 |

**Ordem inegociável:** migration **antes** do deploy (o código novo depende das colunas e da tabela novas). A migration sozinha é segura com o código antigo.

## 6. Testes de validação pós-deploy (sem alterar dados reais)
1. **RH:** Treinamentos → botão "Habilitações" abre (lista vazia); aba **Pendências** abre e mostra as ausências históricas (confere com C-32 da pré-checagem) e os registros incompletos (C-33/C-34/C-35); agenda e concluídos com a mesma quantidade de antes.
2. **RH:** abrir um treinamento concluído real → seções Participantes (resumo "N presentes (… por …) · N ausentes · N pendentes"), Avaliação de reação, Evidências (a lista de presença abre em PDF), "Histórico de ações".
3. **Gestor sem habilitação:** agenda da sua área (sem "Registrar treinamento" e sem "Só os que conduzo"; botão "Habilitados na minha área"); abre um treinamento da área em somente consulta.
4. **Colaborador comum:** "Meus treinamentos" abre; avaliação de reação pendente continua respondível.
5. **Console/Rede** (navegador): nenhuma chamada a `/api/desenvolvimento` com 5xx nas telas acima.
6. **Pendências do RH × pré-checagem:** os números batem; qualquer diferença é investigada antes do passo 9.

## 7. Critérios para interromper
- **Antes do deploy:** pré-checagem com `BLOQUEIA`; backup incompleto ou com contagem diferente; migration com erro; validação com qualquer `ok = false` ou contagem diferente da pré-checagem; teste 6 do passo (código antigo) com erro ou número diferente → **parar, não fazer merge**; se a migration já foi aplicada, decidir com a Carolina entre manter (compatível) ou rodar o rollback SQL.
- **Durante/depois do deploy:** build da Vercel falhando (o deploy anterior continua no ar: nada a reverter); qualquer 5xx persistente em `/api/desenvolvimento`; RH sem acesso ao módulo; Gestor sem enxergar a própria área; "Meus treinamentos" quebrado; PDF da lista de presença não abrindo; números de Pendências incoerentes com a pré-checagem → **reverter o código** (`git revert -m 1`, push), manter a migration e investigar.
- **Nunca** executar o rollback SQL com dados novos (habilitações, transferências, ausências encaminhadas) sem decisão expressa: ele recusa por desenho.
