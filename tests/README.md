# Testes — triagem do PDI por item (Fase 7 / 1B) e análise com IA (Fase 8)

Pacote separado do app (não entra no build da Vercel). Usa uma réplica em memória do banco (PGlite) montada com as
migrations reais de `supabase/` (Fases 1–6, Fase 7 e Fase 8A). **Nada conecta ao Supabase de produção e nenhum teste chama a IA
de verdade** (o provedor é um cliente falso, e o cliente real do SDK roda com `fetch` simulado). Os dados são fictícios.

```bash
cd tests
npm ci
npm test            # tudo, em sequência
```

| Script | O que cobre |
|---|---|
| `npm run test:visoes` | Regra local e montagem das visões por item (legado, "a definir", necessidade sem vínculo, análise da IA). Sem banco. |
| `npm run test:1b` / `test:1b-ajustes` | Ações do servidor da triagem (gerar, confirmar, manter, separar, regenerar, ações antigas), falhas injetadas, recuperação e concorrência. |
| `npm run test:8a` | Fase 8A: migration, validação oficial, rollback, reaplicação, constraints, imutabilidade, trava por item e fechamento coerente da interpretação. |
| `npm run test:ia-nucleo` | Núcleo semântico (puro): entrada anônima, sanitização, prompt/schema versionados e validação rigorosa da saída. |
| `npm run test:ia-cliente` | Cliente real da Anthropic (SDK) com `fetch` simulado: requisição, leitura da resposta e tradução de falhas. Sem rede, sem chave. |
| `npm run test:ia` | Ação `pdi_ia_analisar` de ponta a ponta no servidor real, com provedor falso: 4 resultados, respostas inválidas, falhas, stale, concorrência, execução presa, privacidade, permissões e legado/LNT intactos. |

Para rodar a suíte da 1B com a 8A aplicada por cima: `APLICAR_8A=1 npm run test:1b` (e `test:1b-ajustes`).

Apoio em `pdi-triagem/`: `base.mjs` (réplica e dados de teste), `shim.mjs` (cliente estilo supabase-js sobre o PGlite),
`hooks.mjs`/`register.mjs`/`stub-*.mjs` (carregam o código do servidor sem a sessão real do Supabase).
