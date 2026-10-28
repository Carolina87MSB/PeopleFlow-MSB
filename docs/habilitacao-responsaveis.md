# Habilitação de Responsáveis por Treinamentos — modelo implementado

**Situação:** implementado e testado em ambiente local (branch `feature/habilitacao-responsaveis-etapa1`). **Nada foi publicado**: nenhuma migration/SQL foi executada em produção, nenhum dado real foi alterado, não há push, merge nem deploy. Este documento substitui `habilitacao-responsaveis-etapa1.md`.

Roteiro prático para o RH: [habilitacao-responsaveis-roteiro-homologacao.md](habilitacao-responsaveis-roteiro-homologacao.md).

## O modelo (regras aprovadas)

| Papel | O que pode |
|---|---|
| **RH** | Habilita e revoga diretamente no portal (**Treinamentos → Habilitações**), com a referência da solicitação da liderança; vê e administra todos os treinamentos; transfere responsabilidade de pendentes; retifica o concluído (com histórico); acompanha pendências, reação (geral) e eficácia. |
| **Responsável principal e instrutor interno HABILITADOS** | Administram **o treinamento a que estão vinculados** (e só ele): editar (conforme o estado), turma, iniciar, realização, QR, lista de presença, presenças, justificar ausências, programar reposições, evidências, gravação, acompanhar a Avaliação de Reação (a partir de 3 respostas) e **concluir a sessão** (interno e externo), depois da conferência. |
| **Instrutor interno sem habilitação** | Nenhum poder administrativo (nem acesso ao módulo). Segue com "Meus treinamentos" como qualquer colaborador. |
| **Instrutor externo** | Só um nome no registro; sem login nem acesso ao PeopleFlow. |
| **Gestor (liderança)** | **Acompanha** os treinamentos da sua área (responsáveis, participantes, pendências, reação): somente leitura. Não habilita, não aprova, não conclui como etapa. Se também for responsável/instrutor **habilitado**, administra aquele treinamento. |
| **Demais colaboradores** | Só as próprias participações e avaliações ("Meus treinamentos"). |

Habilitação: permanente até revogar, vinculada à gestão/área, uma por colaborador, sem aprovação por treinamento, **sem acesso a outros módulos** (perfil restrito aos Treinamentos: Necessidades, Requisitos, Habilidades, AVD, PDI, salários ficam recusados no servidor). Quem tem menos de seis meses de empresa e ainda não tem conta recebe, ao ser habilitado, **somente** o acesso ao PeopleFlow (nunca o do SST), com confirmação explícita; no portal esse acesso mostra apenas "Meus treinamentos" (e a Gestão de Treinamentos, se habilitado).

## Ausências, justificativas e reposições (sessão ≠ regularização individual)

- Ausente: **justificativa** + **encaminhamento** (reposição, com data prevista opcional; ou **dispensa** — só o RH, com justificativa). A presença original não é alterada.
- A **conferência** antes de concluir mostra o que impede (presença pendente, ausente sem justificativa/encaminhamento, dados/documento, data de realização, evidência/certificado em treinamento externo) e o que **permanece pendente depois** (reposições, avaliações de reação, eficácia). Reposição individual registrada e encaminhada **não impede** a conclusão.
- Concluir registra **quem, quando e o perfil** (auditoria) e **não** encerra a pendência individual, a Avaliação de Reação nem a eficácia.
- A pendência segue **vinculada ao treinamento original**: reposição programada (novo treinamento da mesma cadeia) → ao realizá-la, regulariza; o original **não** é reaberto nem alterado. Retirar um ausente da turma é **bloqueado** (nem o RH): usa-se a dispensa.
- Aba **Pendências** (RH: tudo; liderança: da área; habilitado: do que administra): reposições (sem encaminhamento / a programar / programada), eficácia pendente, **treinamentos sem responsável habilitado** (RH, com ação de transferir) e registros incompletos/inconsistentes (RH). Treinamentos de teste ficam fora, salvo se o RH marcar "Incluir treinamentos de teste".

## Revogação e transferência

- Revogar (RH, com motivo): poderes encerram **na hora** (consulta ao vivo no servidor e no banco; a sessão do módulo cai); o concluído e as evidências ficam intactos; a pessoa continua com "Meus treinamentos". O histórico de habilitações (quem habilitou/revogou, quando, motivo) é mantido.
- Transferência (RH): só treinamentos **pendentes**, motivo e tipo obrigatórios (revogação, desligamento, mudança de responsabilidade, outro), só para habilitado ou integrante do RH; histórico **imutável**; quem registrou e o instrutor não mudam. Desligados e responsáveis sem habilitação aparecem em Pendências.

## Arquivos

**Banco** (não executados em produção): `supabase/desenvolvimento_habilitacao_responsaveis.sql` (migration), `..._rollback.sql`, `..._prechecagem.sql` e `..._validacao.sql` (somente leitura).
**API:** `api/_lib/desenvolvimentoAcoes.ts` (permissões por habilitação, habilitar/revogar/listar/opções, transferir, ausências, conferência, pendências, reação ampliada, bloqueios) e `api/desenvolvimento.ts` (sessão: só a habilitação abre o módulo a quem não é RH/Gestor). Continuam **11** funções serverless.
**Interface:** `Habilitacoes.tsx` (nova; substitui `ResponsaveisGestao.tsx`), `PendenciasAba.tsx`, `ConclusaoEAusencias.tsx`, `TreinamentoPage.tsx`, `TreinamentosPage.tsx`, `TreinamentoForm.tsx`, `DesenvolvimentoLayout.tsx`, `contexto.ts`, `devRepository.ts`, `useConta.ts`, `AppShell.tsx`, `Sidebar.tsx`, `types/domain.ts`.
**Testes:** `tests/treinamentos/teste_habilitacao_banco.ts` (16), `teste_habilitacao_fluxo.ts` (20), `teste_fluxo.ts` (96) e `teste_operacao.ts` (88) adaptados ao modelo, `fakeSupabase.ts` (contas de acesso).

## O que a migration faz (e não faz)

1. `peopleflow_dev_responsaveis_gestao` = habilitações: `situacao` (habilitada | revogada), `departamento`, `referencia`, `habilitado_em/por`; `ativo` passa a derivado (**o código hoje publicado continua funcionando**); uma habilitação ativa por colaborador; identidade imutável; revogada é histórico.
2. `peopleflow_dev_transferencias_responsabilidade` (nova, imutável, só o RH lê).
3. `peopleflow_dev_participantes`: 8 colunas novas de ausência (vazias para todo registro existente), 3 verificações.
4. Leitura (RLS): perfil Responsavel lê **só** o que é responsável/instrutor **e enquanto habilitado**; RH e Gestor sem perda.
Não altera treinamentos, presenças, avaliações, evidências, auditoria nem dados existentes (testado por hash).

## Testes executados (réplica PGlite, código real; dados fictícios)

- `npm test` completo: todas as suítes verdes (fluxo 96, operação 88, habilitação-banco 16, habilitação-fluxo 20, menu 59, demais suítes anteriores).
- **Compatibilidade com o código hoje publicado:** suíte de operação do código atual (de `main`) com a migration nova aplicada: **88/88**; a de fluxo: 94/96 — as 2 diferenças são os testes de reversão da Fase 5, que exigem desfazer esta migration antes (ordem inversa).
- Cenários: RH, gestor, responsável habilitado, instrutor interno habilitado, instrutor externo, instrutor sem habilitação, participante; conclusão com todos presentes e com ausentes justificados + reposição pendente; reposição → regularização; dispensa; reação (0/1/2/3 respostas, anonimato); revogação; transferência (válida e inválidas); desligamento; isolamento entre áreas/responsáveis (turma, evidências, eficácia) no servidor **e** no banco; sem exclusão física; migration idempotente, reversível e com pré-checagem/validação.
- Telas conferidas com dados fictícios no navegador (desktop e 375 px, sem estouro horizontal); `tsc`, build e oxlint sem erros.

## Riscos e pontos de atenção

1. **Gestores sem habilitação deixam de registrar/administrar** (passam a acompanhar). Se algum Gestor deve operar, o RH o habilita (como qualquer colaborador). Hoje há 8 treinamentos, todos registrados pelo RH.
2. **Ausências já existentes** em treinamentos oficiais concluídos aparecem em Pendências como "Sem encaminhamento" (somente leitura; nada é alterado). A pré-checagem informa quantas.
3. **Justificativas de ausência** podem conter dado sensível: a tela orienta ("afastamento/licença") e elas ficam visíveis a quem administra, à liderança da área e ao RH.
4. **Responsável/instrutor sem habilitação perde a leitura** do treinamento (hoje: nenhum caso em produção).
5. **Ordem de publicação é obrigatória** (migration antes do código; ver abaixo): o código novo exige as colunas novas.
6. Revogar remove a cópia derivada da sessão do módulo/escopo da pessoa (não é histórico) para encerrar os poderes na hora.
7. **Acesso específico a Treinamentos:** a restrição é de navegação e do servidor; o acesso técnico aos dados de cadastro que o portal carrega segue a mesma política de qualquer conta PeopleFlow (como as contas de AVD hoje). Vale conferir com TI se isso é aceitável para contas de quem tem menos de seis meses.
8. "Inconsistências" lista também treinamentos concluídos antes da Lista de Presença automática (somente leitura).

## Plano de publicação coordenada (só com a sua autorização, em etapas com pausa)

0. **Antes:** validação visual/funcional pelo RH com o roteiro; congelar a `main`; `npm test` e build verdes.
1. **Pré-checagem** (somente leitura) em produção: `..._prechecagem.sql`. Guardar o resultado.
2. **Migration** (SQL Editor, uma transação): `desenvolvimento_habilitacao_responsaveis.sql`. É compatível com o código atual: nada muda para os usuários.
3. **Validação** (somente leitura): `..._validacao.sql` — todas as linhas `ok = true`; contagens iguais às da pré-checagem.
4. **Código:** push da branch → merge na `main` → deploy da Vercel. Verificar rotas e bundle; conferir o login do RH e de um Gestor.
5. **Habilitações:** o RH habilita, pelo portal, quem as lideranças informaram por e-mail (ex.: gestores que continuarão operando).
6. **Piloto** com treinamento marcado como **homologação/teste** (fora dos indicadores) seguindo o roteiro.
7. **Reversão (se necessário), em ordem inversa:** primeiro o código (revert do merge/deploy anterior), depois `..._rollback.sql` (recusa-se se já houver transferência ou ausência encaminhada — registros que nunca são apagados).
