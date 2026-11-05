# Gestor autorizado automaticamente e solicitação de habilitação (Portal de Treinamentos)

**Estado:** implementado e testado localmente no branch `feature/gestor-autorizado-solicitacao-habilitacao`. Nada executado em produção.
**Substitui** a regra anterior "o Gestor só acompanha, a menos que o RH o habilite".

## Regras
1. **Gestor autorizado pelo perfil.** Todo Gestor do PeopleFlow (quem é gestor imediato de alguém) registra e administra os treinamentos da **sua área**, sem habilitação do RH. Administrar = editar/cancelar antes do início, montar a turma, iniciar, presença, QR, evidências, conferir e concluir, reposição.
2. **Área do Gestor** (escopo de liderança cadastrado, em todos os níveis): o treinamento que **ele ou alguém do seu escopo registrou**, **ou** cujo **responsável principal** está no seu escopo — inclusive registrado pelo RH. O instrutor, sozinho, não traz a área.
3. **Outra área:** o Gestor com liderado na turma só **acompanha** (só os próprios liderados; sem poderes; sem a lista/ata/materiais da turma) — como já era.
4. **Responsável principal** precisa ser do RH, gestor ou colaborador habilitado. Colaborador comum só passa a poder ser responsável depois da habilitação.
5. **Solicitar habilitação (Gestor → RH):** em *Treinamentos → Habilitações da equipe → Solicitar habilitação* (colaborador da equipe + justificativa). Fica **Pendente** até a decisão; uma pendente por colaborador; não vale antes da aprovação. Não se solicita para si mesmo, para quem já é habilitado, do RH ou gestor, nem para fora da equipe.
6. **Decisão do RH:** em *Treinamentos → Pendências → Solicitações de habilitação pendentes*: **Aprovar** (justificativa opcional) ou **Rejeitar** (justificativa obrigatória). Fica registrado quem decidiu, quando e por quê, visível ao RH e ao gestor solicitante. Aprovar cria a habilitação (gestão = o gestor solicitante; referência "Solicitação nº N…") com a mesma rotina da concessão direta; se a pessoa ainda não tem acesso ao portal, o RH marca "Criar acesso (somente Treinamentos)". A concessão direta pelo RH, a **revogação** e o **histórico** continuam como estavam.
7. **E-mail:** ao registrar a solicitação, o servidor avisa cada pessoa do RH com conta no módulo (hoje 2), pelo envio já existente (Gmail/nodemailer, log com chave única por solicitação e destinatário). A mensagem traz colaborador, gestor, área, justificativa e o link para *Pendências*. O log guarda só o id da solicitação (a justificativa fica na tabela de solicitações). Se o e-mail falhar, o pedido continua registrado, o gestor é avisado e o RH o vê em Pendências.

## Banco (`supabase/desenvolvimento_solicitacao_habilitacao.sql`)
- Tabela `peopleflow_dev_habilitacao_solicitacoes`: identidade imutável, única transição *pendente → decidida*, sem exclusão/truncate, uma pendente por colaborador; o RH lê tudo, o solicitante lê as próprias; o navegador não grava.
- `peopleflow_dev_gere_treinamento`: o Gestor passa a **ler** também os treinamentos com o responsável principal no escopo (necessário para a regra 2; o servidor aplica a mesma regra nas gravações).
- Não altera dados existentes. Reversão (`…_rollback.sql`) devolve a função exatamente ao estado anterior; recusa-se se houver solicitação registrada. Pré-checagem e validação são uma consulta só cada.

## Plano de publicação (cada etapa só com autorização)
1. **Backup externo atualizado** (opcional se nada relevante mudou desde 04/11): `scripts/backup/fazer-backup.ps1` (a restauração continua não testada).
2. **Pré-checagem** (`…_prechecagem.sql`, somente leitura): nenhum `BLOQUEIA`; guardar as contagens.
3. **Migration** (`…solicitacao_habilitacao.sql`) e **validação** (`…_validacao.sql`): todas as verificações com `ok = true`; contagens iguais (auditoria pode subir).
4. **Teste com o código antigo ainda no ar:** RH e gestor abrem Treinamentos/agenda/um treinamento; mesmos números de antes.
5. **Merge `--no-ff` em `main` + push** (deploy automático); acompanhar o deploy.
6. **Homologação em produção** (checklist abaixo).
- **Ordem inegociável:** migration antes do deploy. Reversão do código: `git revert -m 1 <merge>` + push; a migration permanece (compatível com o código anterior). Rollback SQL só sem solicitações registradas.

## Checklist de homologação em produção
1. **Gestor:** *Registrar treinamento* aparece sem habilitação; registrar (teste marcado só pelo RH) e administrar um treinamento da própria área; não administrar o de outra área.
2. **Área pelo responsável:** treinamento registrado pelo RH com responsável da equipe do gestor → o gestor lê e administra.
3. **Solicitação:** o gestor abre *Habilitações da equipe → Solicitar habilitação*; o pedido aparece em *Minhas solicitações* como Pendente; pedido duplicado é recusado.
4. **E-mail:** o RH recebe o aviso com colaborador, gestor, área, justificativa e link; o link abre Pendências.
5. **Decisão:** o RH rejeita (justificativa obrigatória) e aprova; o gestor vê o resultado; o colaborador aprovado entra como Responsável (só Treinamentos).
6. **Revogação** e **histórico de habilitações** continuam funcionando.
7. Isolamento: gestor de outra área não vê nem administra; colaborador sem habilitação não abre o módulo.
