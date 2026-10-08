# Testes — triagem do PDI (Fase 7, fundação 8A e triagem temática local)

Pacote separado do app (não entra no build da Vercel). Usa uma réplica em memória do banco (PGlite) montada com as
migrations reais de `supabase/` (Fases 1–6 e a Fase 7). **Nada conecta ao Supabase de produção.**

```bash
cd tests
npm ci
npm test            # todos os abaixo, em sequência
```

| Script | O que cobre |
|---|---|
| `npm run test:visoes` | Regra local (puras) e montagem das visões por item: Aguardando / Confirmadas / Mantidas, legado, "a definir", necessidade sem vínculo. Não precisa de banco. |
| `npm run test:1b` | Ações do servidor (`api/_lib/pdiTriagemAcoes.ts`) de ponta a ponta na réplica: gerar, confirmar, manter, separar, regenerar, ações antigas, permissões, auditoria. |
| `npm run test:1b-ajustes` | Falhas injetadas (quedas entre writes, auditoria, limpeza), recuperação de necessidade sem vínculo e concorrência. |
| `npm run test:8a` | Fundação de dados 8A (colunas, guardas, rollback) na réplica. |
| `npm run test:temas` | Triagem temática local: catálogo e regras de agrupamento, visão por temas (sem duplicar item/decisão), contagens únicas, volume (≥ 2.000 ações), ausência de rede/IA e controle de acesso RH. Não precisa de banco. |

Apoio em `pdi-triagem/`: `base.mjs` (réplica e dados de teste), `shim.mjs` (cliente estilo supabase-js sobre o PGlite),
`hooks.mjs`/`register.mjs`/`stub-*.mjs` (carregam o código do servidor sem a sessão real do Supabase).
Os dados são fictícios.
