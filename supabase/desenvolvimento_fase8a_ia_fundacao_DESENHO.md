# Fase 8A — Fundação de dados da interpretação semântica com IA

**Status:** preparado para revisão. Nada foi executado no banco real; sem commit, push ou deploy. Sem IA, sem SDK, sem prompt: só estrutura.

Arquivos: `desenvolvimento_fase8a_ia_fundacao.sql` (migration), `..._validacao.sql`, `..._rollback.sql` e este documento. Os arquivos da Fase 7 não foram alterados.

## A. Modelo

```
INTERPRETAÇÃO  (peopleflow_dev_pdi_interpretacoes)   = a análise de UM item do PDI
  ├─ resultado_interpretacao   (necessidade_identificada | multiplas_necessidades | evidencia_insuficiente | somente_acao_pdi)
  ├─ observacao_interpretacao
  └─ 0, 1 ou N SUGESTÕES        (peopleflow_dev_pdi_sugestoes)   = uma possível Necessidade de Desenvolvimento
        ├─ confianca (alta | media | baixa)
        ├─ justificativa_interpretacao
        └─ ações de origem      (peopleflow_dev_pdi_sugestao_acoes)  — conjunto exclusivo
```

Nenhuma tabela nova. Resultado e observação **não** se repetem nas N sugestões: ficam na interpretação e a view `peopleflow_dev_v_pdi_sugestoes` os traz por junção.

### Por que cada coluna ficou onde ficou

| Coluna | Tabela | Motivo |
|---|---|---|
| `pdi_item_id` | interpretações | Hoje a tabela é uma EXECUÇÃO (a regra local analisa vários itens por vez) e não identifica o item. Sem isso não há resultado "do item" nem trava por item. IA = 1 item por interpretação; regra local continua em lote (item nulo). Sem chave estrangeira: salvar o PDI apaga e recria itens. |
| `resultado_interpretacao`, `observacao_interpretacao` | interpretações | São do item como um todo, não de uma necessidade. |
| `confianca`, `justificativa_interpretacao` | sugestões | Cada necessidade sugerida tem a sua. |

## B. Sem necessidade: a sugestão "neutra"

Para `evidencia_insuficiente` e `somente_acao_pdi` (e para as ações do item que não sustentam nenhuma necessidade), a interpretação continua rastreável com **uma sugestão neutra**: origem `ia`, **sem confiança e sem justificativa**, texto "A definir pelo RH". É um artefato técnico da triagem — mantém a cobertura das ações, tira o item do lote e usa o fluxo atual da tela.

**"A definir pelo RH" não é uma necessidade identificada pela IA.** O resultado semântico verdadeiro está na interpretação. No banco, a diferença é objetiva: sugestão IA com confiança = necessidade sugerida; sem confiança = neutra. Máximo de 1 neutra por interpretação (índice único parcial).

## C. A trava de concorrência

`peopleflow_dev_pdi_interp_ia_andamento_uidx` = índice único parcial em **`pdi_item_id` WHERE `tipo = 'ia'` AND `status = 'em_andamento'`**: no máximo uma interpretação IA em andamento por item. A regra local não participa (item nulo). Ao concluir ou falhar, a trava é liberada. Uma execução que travou em `em_andamento` precisa ser encerrada como `falhou` pelo servidor (prazo máximo — Etapa 8C).

## D. O que o banco garante ao CONCLUIR uma interpretação IA

- `resultado_interpretacao` obrigatório (e só nas concluídas); `itens_analisados = 1`; `sugestoes_geradas` = sugestões gravadas;
- `necessidade_identificada` → exatamente 1 sugestão com necessidade; `multiplas_necessidades` → 2 ou mais; `evidencia_insuficiente` / `somente_acao_pdi` → nenhuma com necessidade e exatamente 1 neutra; no máximo 1 neutra sempre;
- **cobertura integral:** toda ação em aberto do item precisa estar coberta por uma sugestão ativa (necessidade sugerida OU "sem necessidade");
- uma ação nunca está em duas sugestões ativas (índice único já existente da Fase 7);
- a sugestão IA é do mesmo item da sua interpretação; item, confiança e justificativa são imutáveis; resultado/observação só mudam enquanto a interpretação está `em_andamento` (depois de encerrada ela é imutável, regra da Fase 7).

Legado e regra local continuam exatamente como estão: as colunas novas são nulas para eles e as constraints só permitem preenchê-las em IA.

## E. Objetos alterados

Colunas (5), constraints (8), índices únicos parciais (2), funções de guarda `peopleflow_dev_pdi_interpretacoes_guarda()` e `peopleflow_dev_pdi_sugestoes_guarda()` (substituídas por CREATE OR REPLACE, mantendo tudo o que a Fase 7 garantia), e a view `peopleflow_dev_v_pdi_sugestoes` (mesmas colunas + 4 no final: `confianca`, `justificativa_interpretacao`, `resultado_interpretacao`, `observacao_interpretacao`; `security_invoker` e permissões mantidos). Nenhum trigger criado ou removido. RLS e permissões das tabelas: inalteradas.

## F. Reversão

Remove só o da 8A e restaura as duas funções e a view exatamente como a Fase 7 as criou. **Recusa** se existir qualquer dado de IA (interpretação IA, sugestão IA ou coluna da 8A preenchida); com backup, `v_permitir_perda = true` libera (as colunas são apagadas; as linhas de IA ficam sem resultado/confiança/justificativa).

## G. Privacidade (desenho para a 8B/8C)

A 8A não chama nada externo. O payload futuro conterá somente: referência anônima do item, tipo Competência/KPI, nome da Competência/KPI, objetivo, referências anônimas das ações e textos sanitizados das ações. Nunca: nome do colaborador, departamento, cargo, gestor, nota, salário, e-mail, CPF ou ids internos reais. A sanitização de texto livre (8B) é **redução de exposição, não garantia de anonimização**.
