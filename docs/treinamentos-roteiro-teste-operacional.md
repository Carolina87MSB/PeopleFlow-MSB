# Roteiro de teste operacional — treinamento real de POP

**Situação: NÃO EXECUTADO.** Nenhuma etapa abaixo foi realizada presencialmente. Marque cada item somente depois de executá-lo de verdade, anotando data, quem executou e observações. Os testes automatizados (`cd tests && npm test`) cobrem as regras do servidor, mas **não substituem** este roteiro: celular, câmera, rede da fábrica, login por e-mail e PDF impresso só se validam na prática.

Não escreva nomes de colaboradores neste arquivo (o repositório é público). Use a coluna "Observações" apenas em cópia local.

## 0. Antes de começar

| # | Verificação | Feito |
|---|---|---|
| 0.1 | Escolher um POP real e vigente na Lista Mestra (código, título e revisão conferidos com o documento oficial). | ☐ |
| 0.2 | Definir as pessoas: **1 gestor**, **1 responsável designado** (será o responsável/instrutor), **3 a 5 participantes** (pelo menos 1 que será ausente). | ☐ |
| 0.3 | Todos os que usarão QR Code têm conta no PeopleFlow (e-mail corporativo + acesso ao módulo). Quem não tem conta confirma por registro manual do responsável. | ☐ |
| 0.4 | O gestor e o responsável designado conseguem entrar no portal. O designado só passa a ver "Treinamentos que conduzo" depois de ser designado em um treinamento planejado. | ☐ |
| 0.5 | **Ensaio opcional:** repetir o roteiro uma vez com o treinamento marcado como "homologação/teste" (só o RH marca). Ele não conta como capacitação oficial, não entra em conformidade nem no histórico dos colaboradores. | ☐ |
| 0.6 | Para o teste oficial, avisar que o registro **não pode ser apagado** (o sistema não tem exclusão; só cancelamento com justificativa). | ☐ |

## 1. Planejamento (Gestor)

| # | Ação | Resultado esperado | Feito |
|---|---|---|---|
| 1.1 | Gestor: Desenvolvimento → Treinamentos → **Registrar treinamento**. Tipo "Novo POP" (ou "Revisão de POP" / "Instrução de Trabalho"), modalidade **Interno**, documento da Lista Mestra. | O título passa a ser o título oficial do documento, em caixa alta. Aparece código e **revisão** do documento. | ☐ |
| 1.2 | Informar data prevista (hoje ou futura), carga horária, responsável e instrutor (o responsável designado). Deixar "Exige avaliação de eficácia" marcado ou não, conforme a decisão do RH. | Treinamento nasce **Planejado**. Não pede certificado. | ☐ |
| 1.3 | Selecionar os participantes (incluindo o que será ausente). | Turma montada; todos com presença **Pendente**. | ☐ |
| 1.4 | Conferir como RH: o treinamento aparece na agenda, com os participantes. | RH enxerga tudo. | ☐ |

## 2. Realização (Responsável designado)

| # | Ação | Resultado esperado | Feito |
|---|---|---|---|
| 2.1 | Responsável designado entra no portal. | Aparece "Treinamentos que conduzo" no menu; ele vê **somente** este treinamento (sem Habilidades, Necessidades, financeiro nem RH). | ☐ |
| 2.2 | Abrir o treinamento e **Iniciar realização**. | Status Em andamento. Se o documento foi revisado após o planejamento, a revisão é atualizada para a vigente e isso fica na auditoria. | ☐ |
| 2.3 | Gerar o **QR Code** e projetá-lo/mostrá-lo. | QR válido por até 12 h; só quem conduz gera. | ☐ |
| 2.4 | Pelo menos 2 participantes leem o QR no celular, entram com e-mail corporativo e confirmam. | "Presença confirmada"; no treinamento aparece método **QR**. | ☐ |
| 2.5 | Um participante sem conta/celular: o responsável registra **presença manual**, com justificativa (ex.: "sem acesso ao portal; confirmado na sala"). | Presença **Manual** com a justificativa gravada. | ☐ |
| 2.6 | O participante que faltou: o responsável registra **ausente** com motivo. | Ausência registrada com motivo. | ☐ |
| 2.7 | Ajustar data/carga realizadas, se diferirem do planejado, e anexar uma evidência (foto da sala, material, ata). | Evidência listada; arquivo abre por link temporário. | ☐ |
| 2.8 | Tentar, como responsável designado, **concluir** o treinamento. | Bloqueado: só o RH conclui. | ☐ |

## 3. Conclusão e Lista de Presença (RH)

| # | Ação | Resultado esperado | Feito |
|---|---|---|---|
| 3.0 | Antes de concluir, RH confere na tela a **data de realização**: se ninguém a informou, vale o dia em que a realização foi iniciada (horário de Brasília); a data final planejada nunca é usada. Se foi outro dia, "Alterar dados da realização". | Data conferida e coerente com o dia real. | ☐ |
| 3.1 | RH confere presentes/ausentes e **conclui**. | Status Concluído; o QR é encerrado. | ☐ |
| 3.2 | Abrir a **Lista de Presença** (PDF) gerada. | PDF com código e título do POP, **revisão treinada**, data, carga, responsável/instrutor, turma com presente/ausente e método (QR/manual). | ☐ |
| 3.3 | Retificar uma presença como RH (com justificativa). | Nova versão da lista; a anterior fica "substituída", nunca apagada. | ☐ |
| 3.4 | Como gestor e como responsável, tentar alterar presença ou anexar evidência depois de concluído. | Bloqueado: só o RH. | ☐ |
| 3.5 | Se exigir eficácia: gestor do participante (ou RH) registra o resultado. | Resultado gravado; responsável designado não consegue avaliar. | ☐ |

## 4. Faltante, histórico e rastreabilidade

| # | Ação | Resultado esperado | Feito |
|---|---|---|---|
| 4.1 | Gestor ou RH: agendar a **reposição** para o participante ausente. | Novo treinamento ligado ao original; o original continua Concluído. | ☐ |
| 4.2 | Cada participante: abrir **Meus treinamentos** (menu, ou o link na tela de presença). | Vê só os próprios treinamentos: POP, revisão, data, carga e situação (Realizado / Ausente / Agendado). | ☐ |
| 4.3 | RH/Gestor: histórico por colaborador (Habilidades e Requisitos → Por colaborador). | Mostra o POP com a revisão efetivamente treinada. | ☐ |
| 4.4 | Depois de uma nova revisão do documento na Lista Mestra, reabrir o treinamento concluído. | Continua mostrando a revisão que foi treinada. | ☐ |
| 4.5 | RH confere a auditoria do treinamento (planejado, iniciado, QR, presenças, conclusão, lista). | Todas as etapas registradas, com quem e quando. | ☐ |

## 5. Registro do resultado

Ao terminar, registre localmente: data da execução, quem participou, o que funcionou, o que falhou e o que precisa de ajuste. Itens que falharem **não** devem ser marcados; abra o ajuste antes de usar oficialmente.

## Permissões esperadas (resumo)

| Ação | RH | Gestor que registrou | Responsável designado | Responsável indicado pela gestão (não designado) | Colaborador |
|---|---|---|---|---|---|
| Registrar/editar/cancelar (antes do início) | Sim | Sim | Não | Sim, nos da gestão que o indicou | Não |
| Montar a turma | Sim | Sim | Sim | Sim, nos da gestão | Não |
| Iniciar, QR, presença manual, evidências (até concluir) | Sim | Sim | Sim | Não | Não |
| Concluir, retificar presença, anexar após conclusão, lista de presença | Sim | Não | Não | Não | Não |
| Avaliar eficácia | Sim | Só liderados | Não | Não | Não |
| Confirmar a própria presença (QR) / ver o próprio histórico | Sim | Sim | Sim | Sim | Sim |
