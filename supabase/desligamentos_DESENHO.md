# Desligamentos — situação funcional central e histórico de rescisões (desenho e execução)

## O que existe agora

| Peça | Onde | Papel |
|---|---|---|
| Regra única de situação funcional | `src/domain/situacaoFuncional.ts` (TS) e `peopleflow_situacao_funcional_em` / `peopleflow_ativo_em` (SQL) | Decide ativo / desligado / ainda não iniciado / fora do quadro numa data de referência. Paridade TS × SQL testada em 1.200+ combinações |
| Escopos | `quadro`, `operacional`, `acesso` | Cada módulo escolhe o escopo da sua finalidade (indicadores, listas e seletores, quem pode entrar) — a regra é a mesma, o filtro não |
| Histórico de rescisões | `peopleflow_rescisoes_historico` (+ `..._rubricas`, só servidor) | Completa os indicadores com quem saiu e nunca teve cadastro; registra as conversões de estágio para CLT; **não** cria cadastro em `colaboradores` |
| Efetivação do desligamento | `api/_lib/desligamentos.ts`, chamada na aprovação da MP e pelo cron diário | Já entregue em 15550d5 (hoje/passado = na hora; futuro = no dia) |
| Pendências de desligados | `src/domain/pendenciasDesligados.ts` + `api/_lib/pendenciasDesligados.ts` + card em Desligados (RH) | Só lista; nada é encerrado sozinho |

## Regras da situação funcional (resumo)
- **Desligado com data futura** continua ativo até o dia. **Desligado sem data** é desligado de hoje em diante (em datas passadas conta como ativo e vira alerta de qualidade).
- **Afiliada** fica fora do `quadro` e do `operacional`; entra no `acesso` (é quem usa o portal).
- **Admissão** ausente/futura só bloqueia no `quadro`; no `operacional` o pré-cadastro de quem vai entrar precisa aparecer (ex.: integração).
- Datas aceitas: ISO, `dd/mmm/aaaa` e `dd/mm/aaaa` (normalizadas antes de comparar).

## Efetivações de estágio para CLT (Marcelo e Ítalo)
- A conversão é uma linha `natureza = 'conversao_estagio_clt'` **ligada ao cadastro** (`colaborador_id` obrigatório). Não é saída, não é nova admissão de pessoa.
- A classificação fica **na camada de indicadores**: o histórico é só lido. Nenhuma MP, data do cadastro, cargo, salário ou documento é alterado (testado: só `desligamentos.ts` escreve em MPs, e apenas `sincronizado_em` de **Desligamento aprovado**).
- Continuidade do vínculo: para headcount/tempo de empresa vale o início do estágio (`admissaoEfetivaPorId`); o cadastro mantém as próprias datas.

## Ordem de execução em produção (cada passo só depois da sua confirmação)
1. **Backup lógico** das tabelas `colaboradores` e `peopleflow_movimentacoes` (export CSV pelo painel do Supabase) e do estado do código (`git tag` antes do deploy).
2. SQL Editor: `supabase/desligamentos_historico_e_situacao.sql` → depois `supabase/desligamentos_historico_e_situacao_validacao.sql` (tudo "OK").
3. SQL Editor: `supabase/rescisoes_historico_2026-10-19.local.sql` (carga local, não versionada; confere totais e aborta se algo divergir) → rodar a validação de novo.
4. Deploy do código (merge da branch + push). Antes da migration o portal funciona igual (a leitura do histórico devolve vazio sem a tabela).
5. Opcional, depois de validar: `supabase/desligamentos_adocao_conformidade.sql` (guardado: aborta se a definição da view for diferente do esperado).
6. Validação funcional logada (RH): Dashboard Executivo, Desligados (card de pendências), Colaboradores.

## Reversão
- Código: `git revert` do merge (as tabelas novas ficam sem uso; o código anterior ignora o histórico).
- Banco: `desligamentos_adocao_conformidade_rollback.sql` (se aplicado) e `desligamentos_historico_e_situacao_rollback.sql` — recusa se o histórico tiver registros, salvo `v_permitir_perda := true` depois de backup.

## Dados reais
O repositório é público: as 24 rescisões e as rubricas ficam **somente** no arquivo `supabase/rescisoes_historico_2026-10-19.local.sql` (ignorado pelo git). Rubricas financeiras ficam em tabela só-servidor e **não alimentam nenhum indicador** até o RH validar a natureza de cada rubrica (`natureza_validada`).
