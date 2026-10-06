# Fase 7 — Fundação da triagem PDI → Necessidade de Desenvolvimento (Etapa 1A)

**Status:** preparado para revisão. Nada foi executado no banco real; sem commit, push ou deploy. Testado só em réplica em memória (Postgres com as Fases 1–6 reais): 95 verificações.

Arquivos: `desenvolvimento_fase7_triagem_pdi.sql` (migration), `..._validacao.sql`, `..._rollback.sql` e este documento.

---

## A. Arquitetura final

**Princípio:** o **item do PDI** é a unidade de ANÁLISE; a **ação** é evidência de origem; a **Necessidade** só nasce da validação do RH.

As três tabelas propostas no diagnóstico se mantêm, depois de inspecionar o legado. Alternativas descartadas:

| Alternativa | Por que não |
|---|---|
| 2 tabelas, ações como `jsonb` dentro da sugestão | perde a unicidade "uma ação em uma só sugestão ativa" e a integridade relacional |
| Colunas novas em `peopleflow_dev_necessidades` | altera a tabela da Base; não representa sugestão antes da validação; não permite 1 item → N sugestões |
| Reaproveitar `peopleflow_dev_pdi_sugestoes_dispensadas` | a chave é a ação (uma decisão por ação); não expressa sugestão com várias ações nem separação |

| Objeto | Papel |
|---|---|
| `peopleflow_dev_pdi_interpretacoes` | **execução**: quem pediu, quando, tipo (`regra_local` ou `ia`), provedor/modelo/versão do prompt (IA) ou versão da regra (local), hash do conteúdo, itens analisados, tokens, status, erro técnico. Sem dado pessoal. Nesta etapa fica vazia. |
| `peopleflow_dev_pdi_sugestoes` | **sugestão** de Necessidade por item (1 item → N). Guarda texto sugerido, tema, categoria sugerida, estado, texto final aprovado, quem/quando decidiu, necessidade criada e a **fotografia do item** (competência/KPI, tipo, objetivo, hash). |
| `peopleflow_dev_pdi_sugestao_acoes` | **ações de origem** da sugestão (1 → N): `pdi_acao_id` + fotografia do texto + hash. |
| view `peopleflow_dev_v_pdi_sugestoes` | sugestão + "origem alterada?" **calculado na leitura** (nunca gravado). |
| view `peopleflow_dev_v_pdi_acoes_triagem` | destino de cada ação atual do PDI (`sem_decisao`, `sugestao_pendente`, `confirmada`, `mantida_no_pdi`). |

## B. Diagrama

```
AVD → competência/KPI → PDI (peopleflow_pdi)
                          └─ ITEM (peopleflow_pdi_itens: competência/KPI + objetivo)   ← unidade de ANÁLISE
                               └─ AÇÕES (peopleflow_pdi_acoes)                          ← evidências (texto nunca alterado)

   execução (regra local | IA)  ──┐
   RH ("separar ações")  ─────────┼──▶ SUGESTÃO(ões) do item  (estado: pendente)
                                  │        └─ ações de origem (A1, A2 …)  [fotografia do texto + hash]
                                  │
              RH decide (somente pelo servidor, perfil RH):
                 ├─ Validar / Editar e validar ─▶ cria NECESSIDADE na Base (origem 'pdi')   estado: validada
                 │        peopleflow_dev_necessidades.pdi_acao_id = ação PRINCIPAL (ponteiro legado)
                 ├─ Manter somente no PDI ──────▶ nenhuma necessidade                       estado: mantida_no_pdi
                 └─ Separar ações / refazer ────▶ sugestão antiga vira 'substituida', ações liberadas,
                                                  novas sugestões 'rh' (derivada_de_id)

   Base de Necessidades ─▶ motor atual da LNT (sem alteração) ─▶ RH consolida ─▶ LNT
```

## C a E. DDL, RLS, triggers, constraints, índices

O DDL completo está em `desenvolvimento_fase7_triagem_pdi.sql`. Resumo das regras:

**Estados da sugestão:** `pendente → validada | mantida_no_pdi | substituida`; `mantida_no_pdi → substituida` (base para um "Reconsiderar" auditável, **não implementado**); `validada` e `substituida` são terminais. "Desatualizada" e "editada/validada" são **derivados** (view), não estados gravados (ver G).

**Constraints principais**
- coerência por estado (pendente sem necessidade/texto final/decisão; validada com necessidade + texto final + decisão; mantida com decisão; substituída com decisão);
- `origem_sugestao ∈ {regra_local, ia, rh, legado}`; `regra_local`/`ia` exigem execução; `rh`/`legado` não;
- texto sugerido e final ≤ 500 (cabe na descrição da necessidade **sem truncar**), categoria no vocabulário existente;
- execução `ia` exige provedor + modelo + versão do prompt; `regra_local` exige versão da regra e proíbe provedor/modelo;
- hashes no formato md5.

**Índices únicos**
- `peopleflow_dev_pdi_sugacao_ativa_uidx` — **uma ação não pode estar em duas sugestões ativas** (parcial `where ativa`); sugestão substituída libera a ação;
- `peopleflow_dev_pdi_sug_necessidade_uidx` — uma necessidade pertence a uma só sugestão;
- `(sugestao_id, pdi_acao_id)` único.

**Triggers (12 nas tabelas novas):** `updated_at`; sem exclusão/truncate; `guarda` de cada tabela; `propaga` (substituir sugestão ⇒ `ativa=false` nas ações).
- O **banco** preenche a fotografia do item e o texto da ação a partir do PDI atual (não confia no cliente) e gera o hash da ação (coluna gerada).
- Ação de origem só entra em sugestão **pendente**, do **mesmo item**; `ativa` só muda por trigger.
- Ao validar: a necessidade precisa ser `origem='pdi'`, do mesmo PDI/item, e a ação que ela referencia **tem de estar entre as ações de origem** da sugestão.

**Guardas opcionais nas tabelas legadas** (`v_guardas_legado`, padrão `true`) — única mudança em tabela existente (3 triggers, nenhuma coluna/política/índice/dado):
1. `UPDATE OF` colunas de vínculo PDI em `peopleflow_dev_necessidades`: só recusa se o valor **mudar** e a necessidade estiver vinculada a uma sugestão (editar redação/status/prioridade continua livre — testado);
2. `INSERT` em necessidades (`origem='pdi'`): recusa decidir de novo ação já `validada`/`mantida_no_pdi` na triagem;
3. `INSERT` em sugestões dispensadas: idem.
Com `false`, a migration fica 100% aditiva e esses cuidados passam a depender só do servidor (Etapa 1B).

**Decisão da revisão:** os **3 guardas ficam ATIVOS** (`v_guardas_legado = true` na versão proposta; `false` não será usado). Os dois guardas de `INSERT` (necessidades e sugestões dispensadas) usam **`errcode = '23505'`** (unique_violation) de propósito: é o código que as ações atuais do servidor (`pdi_sugestao_aceitar` e `pdi_sugestao_dispensar`) já tratam como "ação já decidida" (resposta 409 com a mensagem própria de cada uma). Com outro código, a tentativa de decidir de novo uma ação já decidida (duplo clique, tela desatualizada, chamada direta) viraria erro 500 técnico. Verificado numa réplica: o roteiro de 17 passos do fluxo atual dá o mesmo resultado sem e com a Fase 7 (17/17).

**RLS (explícita, sem política ampla):** cada tabela só tem `SELECT … to authenticated using (meu_perfil() = 'RH')`. `anon`: nada. `authenticated`: só `SELECT`. Escrita só `service_role`. As views usam `security_invoker` e **ainda** filtram por RH. Gestor, Diretoria e Colaborador: sem acesso (testado: RH lê; Gestor, usuário alheio e anon não; nem o RH grava direto pelo navegador).

## F. Auditoria

Usa `peopleflow_dev_auditoria` (servidor, imutável). Nada de estrutura paralela. Eventos previstos para a Etapa 1B (entidade = tabela, `entidade_id` = id):

| Evento | Detalhe |
|---|---|
| `pdi_interpretacao_solicitada` / `_concluida` / `_falhou` | execução, tipo, versão, nº de itens, hash do conteúdo, tokens, erro |
| `pdi_sugestao_gerada` | execução, item, ações, texto sugerido, categoria |
| `pdi_sugestao_validada` | texto sugerido × texto final (editou?), ações, necessidade criada |
| `pdi_sugestao_mantida_no_pdi` | ações, observação |
| `pdi_sugestao_separada` / `_substituida` | sugestão de origem, novas sugestões, motivo |

Responde: quem pediu, quando, versão do prompt/modelo, o que foi sugerido, quais ações originaram, se o RH editou, texto final, quem aprovou, qual necessidade foi criada. "Se a origem mudou depois" responde-se comparando a fotografia com o PDI (view), a qualquer momento. A migration **não** grava na auditoria: os eventos originais das decisões antigas (`necessidade_do_pdi`, `sugestao_pdi_dispensada`) já estão lá.

## G. Fotografia, hash e desatualização

- **Normalização:** só espaços/tabs/quebras repetidos viram um espaço e as pontas são aparadas (propositalmente só ASCII, igual em qualquer cliente). `hash = md5(normalizado)`.
- **Por ação:** `acao_texto` (cópia completa) + `hash_texto` (gerado). **Por item:** `hash_origem` = md5(competência + objetivo + `id:hash` de **todas** as ações do item). Mudam se o objetivo mudar ou se uma ação for editada, incluída ou removida; **não** mudam com status/prazo/responsável.
- **Detecção (view, ao vivo):** `acoes_alteradas`, `acoes_removidas`, `origem_alterada`, `contexto_do_item_alterado`, `origem_alterada_apos_decisao`, `estado_exibicao` (`desatualizada` quando pendente + origem alterada; `editada_validada`).
- **Nunca** atualiza em silêncio, **nunca** apaga a sugestão anterior, **nunca** altera necessidade já validada. Depois de validada, mudança do PDI é **evento posterior** (`origem_alterada_apos_decisao`). Refazer = nova sugestão + a antiga vira `substituida`.
- **Por que derivado e não gravado:** um estado gravado exigiria trigger nas tabelas do PDI. O PDI é salvo apagando e regravando itens/ações (`salvarPdi`), então esse trigger arriscaria o fluxo principal da AVD/PDI. Ver derivado também evita estado velho.

## H. Compatibilidade com a Base e fonte de verdade

**Verificado no legado**
- `peopleflow_dev_nec_dedup_uidx` (parcial: `status in (sugerida, validada, planejada)` e origem automática) usa `(origem, colaborador, pdi_item_id, pdi_acao_id…)`: continua válido porque a necessidade carrega **uma** ação (a principal);
- `origem='pdi'` exige `pdi_id` (check da Fase 1); `pdi_acao_id` é referência fraca sem FK (comentário da Fase 4);
- `pdiSugestaoAceitar` trata `23505` como 409; `acoesPdiJaTratadas`/`triagemPdi` leem `necessidades.pdi_acao_id` e `dispensadas`;
- dispensadas: PK = ação, FK `pdi_id`, sem exclusão; RLS só RH; auditoria `sugestao_pdi_dispensada`;
- `necessidade_editar` não altera colunas `pdi_*`; `necessidade_status` permite cancelar e reabrir.

**Regra definitiva (fonte de verdade)**

| Pergunta | Fonte de verdade |
|---|---|
| Quais ações originaram esta necessidade? Qual texto foi aprovado? | `peopleflow_dev_pdi_sugestao_acoes` + `peopleflow_dev_pdi_sugestoes` (`texto_final`) |
| Qual o destino de uma ação (aguardando / confirmada / mantida)? | `sugestao_acoes (ativa)` → `sugestoes.estado` (view `v_pdi_acoes_triagem`) |
| Texto vivo da necessidade | `peopleflow_dev_necessidades.descricao` (a RH pode editá-lo depois; `texto_final` é o histórico do que foi aprovado) |
| `necessidades.pdi_acao_id` | **ponteiro legado = ação principal** (menor `ordem`, depois `id`); **sempre ∈ ações de origem** da sugestão (trigger) |
| Tabelas legadas (dispensadas; `necessidades.pdi_acao_id`) | histórico e índice de duplicidade; depois da Etapa 1B **não são mais lidas** para triagem |

Assim não há como a Base dizer "veio de A1" e a nova estrutura "A1+A2" sem regra: A1 é a principal, A1+A2 é o conjunto, e o banco garante A1 ∈ {A1, A2}.

**Efeito que a Etapa 1B precisa tratar:** com sugestão de várias ações, a ação não principal não aparece em `necessidades.pdi_acao_id`; a leitura da tela antiga (`triagemPdi`) a mostraria como "aguardando". Por isso a 1B troca a leitura para a view `v_pdi_acoes_triagem`. Nenhuma sugestão multiação existe antes da 1B (a migration só cria sugestões de 1 ação, do legado).

### Transição Etapa 1A → Etapa 1B (passo a passo)

1. **Migration 1A:** cria a nova estrutura (3 tabelas, 2 views, funções, guardas) e **espelha o legado** (decisões antigas viram sugestões `legado`). O legado não é alterado.
2. **A aplicação antiga continua operacional**, lendo e gravando só no legado (`necessidades.pdi_acao_id` e sugestões dispensadas). A nova estrutura ainda não é lida nem escrita pelo app; os 3 guardas só recusam decidir de novo uma ação já decidida (com a mesma resposta 409 de hoje).
3. **Imediatamente antes do deploy da 1B:** executar de novo o backfill idempotente — `select * from public.peopleflow_dev_pdi_backfill_legado();` — para espelhar qualquer decisão tomada pela tela antiga desde a migration (repetir não duplica nada).
4. **Validar V7 e V8** (`..._validacao.sql`): V7 = nenhuma decisão do legado sem espelho (0 linhas); V8 = coerência com a Base (0 linhas em a, b, c e d). Só publicar a 1B com ambas zeradas.
5. **Deploy único da 1B:** as leituras da triagem passam a usar a nova estrutura (views `v_pdi_acoes_triagem` e `v_pdi_sugestoes`), em vez de `acoesPdiJaTratadas`/`triagemPdi`; e as ações antigas (`pdi_sugestao_aceitar`, `pdi_sugestao_dispensar`) passam a **delegar ao novo fluxo** (uma sugestão de 1 ação), que decide, vincula e audita.
6. **Depois da 1B:** as estruturas legadas (tabela de sugestões dispensadas e `necessidades.pdi_acao_id`) permanecem como **histórico e compatibilidade** (índice de duplicidade, ponteiro da ação principal), mas **deixam de ser lidas** para a triagem. A nova estrutura é a fonte de verdade.
7. **Janela residual:** pode existir uma pequena janela entre o **último backfill** (passo 3) e o **deploy** (passo 5) em que alguém decida uma ação pela tela antiga. Essa decisão ficaria só no legado. **V7 detecta** (aparece como decisão sem espelho) e **um novo backfill repara** (idempotente), repetindo V7 e V8 até zerar; os guardas impedem que a mesma ação seja decidida por dois caminhos nesse intervalo. Para encurtar a janela, executar os passos 3 a 5 em sequência, sem pausa.
8. **Reversão:** o rollback remove só a estrutura nova e os 3 guardas e é permitido sem perda enquanto existirem apenas linhas `legado`; depois da 1B no ar, as decisões novas vivem só na estrutura nova (ver cabeçalho do rollback).

## I. As 3 necessidades reais já confirmadas

Não são tocadas. Para cada uma, a migration cria **1 sugestão `legado` validada**, com 1 ação de origem (a que ela já referencia):
- `texto_sugerido` e `texto_final` = descrição aprovada; `decidido_por/em` = `validada_por/validada_em`; categoria = a escolhida;
- fotografia do item (competência, tipo, objetivo) copiada do PDI de hoje, e do texto da ação: se a ação ainda tem o texto confirmado, o texto completo atual; se **mudou** ou **foi removida**, o texto aprovado — assim a mudança aparece como "origem alterada" em vez de ser escondida.
- Dados reais lidos hoje (só leitura): as 3 têm pdi_id, item e ação existentes, item confere com a ação, texto igual, 1 ação por item e todas `validada`.

## J. As 2 ações reais "mantidas somente no PDI"

Intactas. Para cada uma: **1 sugestão `legado` mantida_no_pdi** com a ação de origem, `motivo_decisao` = observação original (texto padrão ou do RH), `decidido_por/em` = `dispensada_por/em`. Hoje as duas ações existem, o `pdi_id` confere, e os itens delas têm 2 ações. A outra ação de cada item continua sem decisão e poderá ser interpretada normalmente.

## K. Backfill (função `peopleflow_dev_pdi_backfill_legado()`, executada pela própria migration)

| | |
|---|---|
| **O que** | 1 sugestão `legado` + 1 ação de origem por decisão antiga (necessidade com origem PDI; ação mantida somente no PDI) |
| **Como** | cada sugestão nasce `pendente`, recebe a ação e só então vai a `validada`/`mantida_no_pdi` — o **mesmo caminho** que o app usará (os guardas rodam) |
| **Por quê** | uma única fonte de verdade para a triagem, sem leitura dupla permanente das tabelas legadas |
| **Quantidade esperada (hoje)** | 3 validadas + 2 mantidas = **5 sugestões** e **5 ações de origem**; 0 execuções |
| **Não espelhável** | necessidade sem item, ou ação mantida cuja ação não existe mais no PDI: **contadas e avisadas**, ficam só no legado, nada se perde |
| **Conflito** | a mesma ação confirmada **e** mantida: a migration **aborta** sem gravar nada |
| **Idempotente** | repetir não duplica (devolve "já espelhadas"). Serve para refazer o espelho se houver decisão pela tela antiga entre a migration e a Etapa 1B |
| **Como validar** | `..._validacao.sql` V6, V7, V8, V10; POST-FLIGHT compara com o legado |
| **Como reverter** | `..._rollback.sql`: as linhas `legado` são só espelho, então a reversão é permitida sem perda; recusa se houver execuções, sugestões novas ou legado substituído |

A migration só escreve nas tabelas **novas**. O POST-FLIGHT prova, por hash, que necessidades, sugestões dispensadas, PDI (cabeçalho, itens e ações), auditoria e treinamentos não mudaram, e que políticas e colunas existentes são as mesmas.

## L e M. Validação e rollback

`desenvolvimento_fase7_triagem_pdi_validacao.sql` (V1–V13, uma consulta por vez, sem nomes de pessoas) e `desenvolvimento_fase7_triagem_pdi_rollback.sql` (remove tabelas, views, funções e os 3 guardas; confere que nada existente mudou).

## N. Riscos identificados

| # | Risco | Mitigação |
|---|---|---|
| R1 | Decisão pela tela **antiga** entre a migration e a Etapa 1B fica só no legado | rodar `select * from peopleflow_dev_pdi_backfill_legado();` antes de publicar a 1B; V7 detecta |
| R2 | Dois caminhos de escrita (ação antiga × nova) decidindo a mesma ação | guardas opcionais nas tabelas legadas; na 1B a ação antiga passa a delegar para o novo caminho; V8(d) detecta |
| R3 | REST sem transação: validar = criar necessidade (1) + vincular (2) | se o passo 2 falhar, a necessidade existe e a sugestão segue pendente; retentar vincula de forma idempotente (o `23505` do índice de duplicidade localiza a necessidade). Pior caso: uma necessidade sem vínculo, detectável |
| R4 | Separar ações: substituir (1) → criar novas (2, 3) | se falhar no meio, a original fica `substituida` e as ações voltam à fila: nada se perde, só é refeito |
| R5 | Necessidade validada depois **cancelada** na Base | a ação continua "decidida" (igual ao comportamento atual); reabrir a necessidade é pela Base. Decisão a confirmar |
| R6 | PDI regravado: ação removida e recriada com id novo | a ação antiga aparece como "removida"; a nova entra na fila como sem decisão |
| R7 | Postgres < 15 não aceita `security_invoker` | PRE-FLIGHT verifica e explica antes de gravar |
| R8 | Tabelas do PDI têm RLS `using(true)` (qualquer autenticado lê/escreve) | **achado preexistente, não alterado**; as tabelas novas não ampliam o acesso (RH apenas) |
| R9 | Guardas nas tabelas legadas são a única mudança fora do acréscimo | opcionais (`v_guardas_legado`) e restritos (só disparam nos casos descritos; edição normal testada) |
| R10 | Migration roda uma vez e não é idempotente | PRE-FLIGHT recusa a segunda execução; só o backfill é repetível |

## O. Arquivos da implementação posterior (Etapa 1B)

- `api/_lib/desenvolvimentoAcoes.ts`: novas ações (`pdi_item_gerar_sugestao_local`, `pdi_sugestao_validar`, `pdi_sugestao_manter_no_pdi`, `pdi_sugestao_separar`); `pdi_sugestao_aceitar`/`_dispensar` passam a delegar ao novo caminho; checagem de ação já decidida pela nova estrutura; auditoria;
- `src/features/desenvolvimento/devRepository.ts`: tipos e leituras das views (substitui `triagemPdi`); `AcaoGravacao` com as ações novas;
- `src/features/desenvolvimento/SugestoesPdiAba.tsx` (e novos componentes de item/ações/separação);
- `src/features/desenvolvimento/pdiClassificacao.ts` (indícios continuam como apoio);
- regra local de sugestão por item (módulo puro, testável);
- `lntSugestoes.ts`: **nenhuma mudança** (o motor da LNT continua o único).

## P. Próxima etapa (IA), sem implementar agora

1. Aprovação de provedor, contrato (sem retenção/treino), posição de LGPD e orçamento;
2. server action RH-only: anonimizar (chaves opacas por item/ação; trocar nomes do cadastro por `[pessoa]`), chamar o modelo **sem ferramentas**, validar o retorno (só ids enviados) e gravar sugestões `origem='ia'` em uma execução `tipo='ia'` (provedor, modelo, versão do prompt, hash, tokens);
3. janela para o RH ver o envio exato antes da primeira execução; piloto com 5 a 10 itens e conjunto de referência;
4. depois, rodada completa. A tabela de execuções e os estados já comportam tudo isso, sem nova migration.

## UX futura (só desenho)

```
COLABORADOR · Competência/KPI: Comunicação   (como veio do PDI; não é alterado)
Necessidade sugerida: “Fortalecer a comunicação profissional…”        [sugestão automática]
Baseada em 2 ações do PDI [ver ações]      (texto original das ações, com selo "origem alterada" se mudou)
[Validar necessidade] [Editar e validar] [Separar ações] [Manter somente no PDI]
```

A tela continua com **Aguardando análise · Confirmadas como necessidade · Mantidas somente no PDI**; a fila passa a ser por item (com contagem de itens e de ações).

**Coexistência dos estados antigos e novos**

| Visão (já em produção) | Origem depois da Fase 7 |
|---|---|
| Aguardando análise | ações em `sem_decisao` ou `sugestao_pendente` (view de destino) |
| Confirmadas como necessidade | ações em sugestões `validada` (inclui as 3 do legado, espelhadas) |
| Mantidas somente no PDI | ações em sugestões `mantida_no_pdi` (inclui as 2 do legado) |

Durante a transição, "Confirmar necessidade" por ação isolada vira uma sugestão de **1 ação** no novo caminho, então os dois fluxos geram o mesmo tipo de registro.

## DÍVIDA TÉCNICA / SEGURANÇA — fora do escopo da Fase 7 (PENDÊNCIA CRÍTICA)

> **Não pertence à Fase 7. Não será corrigida nesta migration.** Registrada aqui só para não se perder.

**Achado:** as tabelas do PDI — `peopleflow_pdi`, `peopleflow_pdi_itens`, `peopleflow_pdi_acoes` e `peopleflow_pdi_biblioteca` — têm política de RLS `for all to authenticated using (true) with check (true)`. Na prática, **qualquer usuário autenticado** (Gestor, Colaborador, qualquer conta do portal) consegue **ler e escrever** (inserir, alterar, apagar) PDIs, itens e ações diretamente pelo cliente do Supabase; hoje quem restringe é só a aplicação.

| | |
|---|---|
| **Onde foi identificado** | no schema do repositório (`supabase/schema.sql`: `authenticated_rw_pdi`, `_itens`, `_acoes`, `_biblioteca`) — nenhuma migration posterior no repositório altera essas políticas |
| **Estado em produção** | **ainda precisa ser confirmado** consultando `pg_policies` no Supabase (não foi verificado) |
| **Escopo** | **fora da Fase 7**; as tabelas novas da Fase 7 são só leitura e só do RH e **não dependem** dessas políticas |
| **Correção** | **não será feita nesta migration**; deve ser tratada depois, em **frente própria** |
| **Por que frente própria** | a correção pode afetar o fluxo atual de gravação de PDI/AVD **pelo navegador**: `salvarPdi` apaga e regrava itens e ações direto do cliente. Uma nova RLS por perfil (RH, Gestor da equipe, o próprio colaborador, escrita preferencialmente pelo servidor) exige redesenho e teste completo da AVD e do PDI |

## Decisões pedidas na revisão

1. Manter os 3 guardas nas tabelas legadas (`v_guardas_legado = true`) ou migration 100% aditiva (`false`)?
2. Necessidade validada e depois cancelada: a ação continua "decidida" (como hoje)?
3. Nomes finais dos estados: `pendente`, `validada`, `mantida_no_pdi`, `substituida` (consistentes com o domínio atual: "validada" já é status da Base; "mantida somente no PDI" é a linguagem da tela).
4. Backfill por espelhamento (recomendado) em vez de leitura dupla das tabelas legadas.
5. Limite de 500 caracteres no texto sugerido/final (alinhado ao que a Base já truncava).
6. Exigência de Postgres 15+ (para views `security_invoker`) — confirmar a versão do projeto antes de rodar (o PRE-FLIGHT já checa).
