# Portal PeopleFlow · MSB

Portal interno de RH da MSB para gestão de **movimentações de pessoal** (admissão, promoção, transferência, alteração salarial, mudança de função, desligamento e criação de cargo), com fluxo de aprovação em etapas (Gestor → RH/Diretoria → CEO, conforme o tipo), visão de dashboard, cadastros (colaboradores, departamentos, cargos), trilha de auditoria e fechamento financeiro de desligamentos (rescisão, GRRF).

Reconstruído a partir de um protótipo visual (`Portal PeopleFlow MSB.zip`, formato proprietário de prototipagem) como uma aplicação real em **React 19 + TypeScript + Vite**, com arquitetura em camadas e **Supabase** como backend — o **mesmo projeto Supabase do [Portal SST MSB](https://github.com/Carolina87MSB/Portal-SST-MSB)**, deploy na **Vercel**.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) 20+ e um projeto Supabase já configurado para o Portal SST (mesmo `.env.local` dele funciona aqui).

1. **Rode o schema deste portal**: abra _SQL Editor_ no painel do MESMO projeto Supabase usado pelo SST, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute. Isso:
   - adiciona colunas novas à tabela `colaboradores` já existente do SST — `vinculo` (CLT/PJ/Estágio), `depto_code`, `nivel`, `gestor`, `admissao` (organograma) e `desligado`/`data_desligamento`/`motivo_desligamento`/`desligado_by` (essas últimas também gravadas pelo próprio Portal SST ao desligar alguém — ver `api/desligar-colaborador.ts` dele) — **não remove nem altera nada que o SST já usa** (a coluna antiga `matricula` continua existindo, só não é mais lida/gravada pelo app);
   - cria três tabelas exclusivas deste portal: `peopleflow_movimentacoes`, `peopleflow_cargos_custom` e `peopleflow_desligamentos` (fechamento financeiro), com RLS liberando leitura/escrita para qualquer usuário autenticado.
2. **Provisione a primeira conta (a sua, do RH)**: diferente do SST (só RH tem conta), aqui **todo Gestor, Diretor e RH que for usar o portal precisa de uma conta no Supabase Auth**. Para a primeiríssima conta (RH, que vai gerenciar as demais pela tela `/acessos` do próprio app — ver abaixo), crie manualmente em _Authentication → Users → Add user_. As contas seguintes não precisam mais do painel do Supabase.
3. **Configure o ambiente local**:
   ```bash
   cd portal-peopleflow
   cp .env.example .env.local
   # preencha com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY do MESMO projeto do SST
   npm install
   ```
4. **Popule os campos do PeopleFlow para os colaboradores reais** (opcional, mas necessário para o organograma/hierarquia funcionar corretamente — sem isso, vínculo/gestor/nível/admissão aparecem como "—" para todo mundo): crie um `src/data/colaboradores.local.json` (gitignored) no formato de [`src/data/colaboradores.example.json`](src/data/colaboradores.example.json) — só precisa de `{ nome, vinculo, deptoCode, nivel, gestor, admissao }`, o `nome` tem que bater exatamente com o `nome` já cadastrado no SST — e rode:
   ```bash
   npm run seed:supabase src/data/colaboradores.local.json
   ```
   Esse script só faz `UPDATE` (nunca `INSERT`) — colaboradores são cadastrados pelo SST, o PeopleFlow só completa os campos que faltam.
5. **Rode o app**:
   ```bash
   npm run dev      # http://localhost:5173
   npm run build    # build de produção em dist/
   npm run lint     # oxlint
   ```

## Deploy na Vercel

1. Importe o repositório na Vercel (framework detectado automaticamente: Vite).
2. Em _Settings → Environment Variables_, adicione:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` — os **mesmos valores já usados no deploy do SST** (mesmo projeto Supabase). Lembre do prefixo `VITE_` (Vite, não Next.js).
   - `SUPABASE_SERVICE_ROLE_KEY` — **sem** prefixo `VITE_` (fica só no servidor, nunca chega ao navegador). Usada pelas Serverless Functions em `api/*.ts` para a tela de administração de acessos.
   - `GMAIL_USER` e `GMAIL_APP_PASSWORD` — opcionais, ativam as notificações de movimentação por e-mail (ver seção abaixo). Sem elas, o fluxo de aprovação funciona normalmente, só não envia e-mail.
3. Em Supabase → _Authentication → URL Configuration_, adicione a URL da Vercel deste projeto (diferente da URL do SST) na lista de _Redirect URLs_ permitidas — senão o link mágico do e-mail quebra em produção.

## Acesso

Login por **link mágico** (e-mail corporativo `@msbbrasil.com`, sem senha) via Supabase Auth — ver `src/auth/AuthContext.tsx`. Só entram e-mails com conta previamente criada no Supabase (`shouldCreateUser: false`); não há cadastro aberto. Depois de autenticado, o app cruza o e-mail com a tabela `colaboradores` (`buildAccess()` em `src/domain/hierarquia.ts`) para descobrir nome/cargo/perfil — se o e-mail não corresponder a NENHUM colaborador cadastrado (nome diferente do que o app deriva o e-mail), a tela mostra um aviso pedindo para falar com o RH (ver `AppShell.tsx`).

Três perfis, com visão e permissões diferentes (ver `src/domain/permissoes.ts`):
- **RH** — acesso completo: todos os colaboradores, todas as movimentações, cadastros de departamentos/cargos, e a tela de **Acessos** (`/acessos`).
- **Gestor** — pode solicitar movimentações e aprovar a etapa "Gestor Solicitante" para toda sua equipe (hierarquia direta e indireta, via `descendants()` — esse escopo mais amplo vale para `movimentacoesVisiveis` e para o seletor de colaborador em "Nova movimentação"). Na tela **Colaboradores** (`/colaboradores`), porém, o escopo é mais estrito: só vê quem tem ele como **gestor imediato** (reporte direto, sem descer mais níveis) — e sem os botões de edição (Admissão, descrição de cargo), exclusivos do RH.
- **Diretoria** — vê a mesma base de colaboradores que o RH em `/colaboradores` (sem escopo), mas sem nenhum botão de edição — RH é quem edita. Nas movimentações, continua vendo só o que ela mesma solicitou ou precisa aprovar.

`colaboradoresListagem` (fonte de `/colaboradores`, com a regra por perfil acima) é diferente de `colaboradoresVisiveis` (escopo de hierarquia completa do Gestor, usado no resto do app) — ver `usePortalData.ts`.

### Exceção de aprovação para o CEO

Daniel (CEO) e Yuri (Diretor Industrial) têm o mesmo perfil "Diretoria", mas **só o CEO** tem uma regra especial: toda movimentação que ele solicitar pula as etapas "Gestor Solicitante" e "Diretor Industrial" (e a etapa "CEO" da matriz de Novo Cargo, que seria ele aprovando a própria solicitação) e vai direto para o RH — em qualquer tipo de movimentação. Yuri, com o mesmo perfil, continua seguindo a matriz normal.

A checagem é por **cargo** (`ehCEO()` em `src/domain/hierarquia.ts`, cargo começando com "CEO"), não por perfil nem por nome fixo — se um dia outra pessoa assumir o cargo de CEO, a regra passa a valer para ela automaticamente, sem precisar mexer no código. Implementado em `montarEtapas()` (`src/domain/workflow.ts`), que agora recebe quem está solicitando para decidir a matriz de etapas.

### Tela de administração de acessos (`/acessos`, RH-only)

Depois que a primeira conta do RH estiver provisionada manualmente (passo 2 acima), o próprio RH consegue liberar o acesso de qualquer Gestor/Diretor direto pelo app, sem entrar no painel do Supabase: a tela lista todo colaborador cadastrado com o e-mail derivado do nome e um status "Provisionado"/"Sem acesso", com um botão "Liberar acesso" por linha.

Isso funciona via duas Vercel Serverless Functions (`api/listar-acessos.ts`, `api/provisionar-acesso.ts`) que rodam só no servidor: confirmam que quem chamou é RH autenticado e então usam a `SUPABASE_SERVICE_ROLE_KEY` para criar a conta no Supabase Auth — essa chave nunca é enviada ao navegador. **Essas duas functions só funcionam em produção (Vercel) ou com `vercel dev`** — `npm run dev` (Vite puro) não executa `/api/*`, então localmente a tela mostra erro de carregamento; isso é esperado.

### Editar admissão (`/colaboradores`, RH-only)

Na ficha do colaborador, o campo "Admissão" tem um botão de editar (ícone de lápis) visível só para RH — os demais campos (Cargo, Departamento, Vínculo, Nível, Gestor imediato) continuam somente leitura, pois hoje são cadastrados via `npm run seed:supabase` (ou pelo SST, no caso de Cargo/Departamento), não pela tela.

### Autocomplete de cargo em "Nova movimentação"

Os campos de nome de cargo (ADM "Cargo solicitado", PRO "Novo cargo", TRF "Novo cargo (se aplicável)", NOV "Nome do cargo") sugerem os cargos já cadastrados (`colaboradores.cargo` + `peopleflow_cargos_custom.nome`) via `<datalist>` — continuam sendo texto livre, não um `<select>` fechado, porque "Nome do cargo" no tipo Novo Cargo precisa aceitar um nome que ainda não existe em lugar nenhum.

### Pré-cadastro automático ao concluir uma Admissão

O tipo de movimentação **ADM (Admissão)** agora também pede o **Vínculo** (CLT/PJ/Estágio) do candidato. Quando a última etapa é aprovada (RH), o PeopleFlow cria automaticamente o pré-cadastro do colaborador em `colaboradores` — nome, cargo, departamento, gestor, vínculo e data de admissão, os mesmos dados do formulário da movimentação — via `api/criar-pre-cadastro.ts` (RH-only, service_role, mesmo padrão de `api/atualizar-admissao.ts`). Se "Candidato" não tiver sido preenchido na solicitação, ou já existir alguém com o mesmo nome, nenhuma linha é criada (a movimentação conclui normalmente e o toast explica o motivo).

**Isso é um pré-cadastro, não um cadastro completo**: `cpf` fica como string vazia (é `NOT NULL` no schema do SST, mas sem CPF real ainda) e `nascimento`/`epis`/`exames` ficam vazios — essas colunas continuam exclusivas do SST. Quem completa esses dados é a nova tela **Editar colaborador** no Portal SST (aba Colaboradores → ícone de lápis por linha — ver README dele). Por isso o botão "Novo colaborador" do Portal SST foi removido — ele nunca fez nada (era um `window.alert` de placeholder) e agora a entrada de novo colaborador é sempre pela Admissão aqui no PeopleFlow.

### Sincronização de Promoção, Transferência, Mudança de Função e Desligamento

Ao concluir a última etapa dessas movimentações, o PeopleFlow também atualiza `colaboradores` (mesma tabela, RH-only via service_role):

- **Promoção**: grava o novo cargo (campo "Novo cargo" do formulário).
- **Transferência**: grava o novo departamento e, se informado, o novo cargo.
- **Mudança de Função**: grava a nova função como novo cargo.
- **Desligamento**: **não** grava `desligado = true` diretamente (isso mudou — ver seção abaixo). Em vez disso, cria uma linha em `peopleflow_desligamento_pendente` com nome/data/motivo/quem aprovou; a efetivação real fica com o Portal SST.

Se o campo relevante do formulário ficar vazio (ex.: promoção sem preencher "Novo cargo"), nada é sincronizado — a movimentação conclui normalmente sem alterar o cadastro. **Alteração Salarial não sincroniza nada**: não há coluna de salário em `colaboradores`.

Promoção/Transferência/Mudança de Função recarregam a lista de colaboradores do Supabase (`reload()`) logo em seguida, então a mudança aparece nos dois portais sem precisar dar F5.

### Desligamento em duas etapas (PeopleFlow aprova, SST efetiva)

Concluir a etapa final (RH) de uma movimentação de Desligamento **não desliga ninguém ainda** — só registra a solicitação em `peopleflow_desligamento_pendente` (nome, data prevista, motivo, quem aprovou), gravado direto pelo navegador (tabela exclusiva do PeopleFlow, RLS já libera `authenticated`, sem precisar de service_role).

O Portal SST lê essa tabela e mostra um card **"Desligamento pendente"** no Dashboard dele; clicar num item abre a ficha do colaborador já com a tela "Desligar colaborador" aberta e pré-preenchida (data/motivo). O RH revisa, anexa o ASO demissional se for o caso (fluxo que já existia lá, pergunta "possui mais de 90 dias?") e confirma — só nesse momento `colaboradores.desligado` é gravado de fato, e a linha em `peopleflow_desligamento_pendente` é apagada.

Isso significa: entre a aprovação no PeopleFlow e a confirmação no SST, o colaborador **continua ativo** nos dois portais — a movimentação fica "Aprovado" no PeopleFlow, mas o desligamento em si só existe depois que o RH passa pela tela do SST. Ver README do Portal SST para o lado de lá.

Diferente das demais escritas do PeopleFlow (que vão para tabelas próprias, prefixadas `peopleflow_`), esta é a **primeira gravação direta na tabela `colaboradores`** vinda do próprio app — e como a RLS dela só libera `select` para `authenticated`, a escrita passa por uma Vercel Serverless Function RH-only (`api/atualizar-admissao.ts`, mesmo padrão do `api/desligar-colaborador.ts` do SST): confirma que quem chamou é RH e então usa a `SUPABASE_SERVICE_ROLE_KEY` para atualizar só a coluna `admissao`. **Só funciona em produção (Vercel) ou com `vercel dev`** — em `npm run dev` (Vite puro) a chamada falha, o que é esperado localmente.

### Ver detalhes e reprovação com justificativa (`/workflow`, `/dashboard`)

Cada card de movimentação (Workflow de aprovação e o widget "Aprovações pendentes" do Dashboard) tem um botão **"Ver detalhes"** que abre a mesma ficha completa usada em Movimentações aprovadas (`src/components/shared/MovimentacaoDetalhe.tsx`, extraído para ser reaproveitado nos dois lugares) dentro de um Drawer — todos os campos do formulário, justificativa da solicitação, trilha de aprovações e documentos gerados, sem sair da lista.

**Reprovar** agora exige uma justificativa: em vez de reprovar direto no clique, abre um modal pedindo o motivo (`ReprovarModal.tsx`), que fica gravado no comentário da etapa reprovada e aparece na trilha ("JUSTIFICATIVA DA REPROVAÇÃO") — mesmo texto exibido tanto no card do Workflow quanto na ficha de detalhes.

### Notificação de movimentação por e-mail (Gmail SMTP)

Toda movimentação dispara e-mail nestes 3 momentos (ver `src/domain/notificacoes.ts`):
- **Nova etapa aguardando aprovação** — ao criar a movimentação (primeira etapa) e a cada aprovação intermediária (próxima etapa) — envia para o **aprovador responsável pela etapa atual** (mesmo `emailOf()` usado em `/acessos`), não para o solicitante.
- **Aprovação final / concluída** — quando a última etapa é aprovada, envia para o **solicitante**.
- **Reprovação** — quando qualquer etapa reprova a movimentação, envia para o **solicitante**, com a justificativa.

O envio (`api/notificar.ts`) usa Gmail SMTP via `nodemailer`, autenticado com `GMAIL_USER` + `GMAIL_APP_PASSWORD` (variáveis de servidor, sem prefixo `VITE_`) — a senha é uma **"Senha de app"** do Google (`myaccount.google.com/apppasswords`, exige verificação em 2 etapas habilitada na conta), não a senha normal do Gmail. Qualquer conta autenticada pode chamar essa function (quem age no fluxo varia por etapa — Gestor, Diretor, CEO ou RH), diferente das demais `api/*.ts` que são RH-only.

**Best-effort, nunca bloqueia o fluxo**: a chamada em `notificacoesRepository.ts` engole qualquer erro, e a function em si responde `200` mesmo quando o envio falha (credencial ausente/errada, Gmail fora do ar etc.) — a movimentação já foi aprovada/reprovada/criada e salva no Supabase antes de disparar o e-mail; se o e-mail não sair, isso nunca aparece pro usuário como falha da ação. Sem `GMAIL_USER`/`GMAIL_APP_PASSWORD` configuradas, o envio é pulado silenciosamente (log no console do servidor).

E-mail em HTML com a identidade do portal (`src/domain/emailTemplate.ts`): logo MSB, cores de `src/index.css` (faixa de destaque azul para pendente, verde para aprovada, vermelha para reprovada) e um bloco com os detalhes da movimentação. O logo vai embutido como anexo inline (`cid:msb-logo`, base64 em `api/_lib/msbLogo.ts`) em vez de imagem remota — funciona em qualquer ambiente sem depender de uma URL pública ou de acesso a `public/assets/` a partir da function. `text` continua sendo enviado junto como fallback para clientes que não renderizam HTML.

### Desligados (`/desligados`, RH-only)

Quando alguém é desligado no **Portal SST** (botão "Desligar colaborador"), esse colaborador aparece automaticamente aqui — os dois portais leem a mesma linha da tabela `colaboradores` (`desligado`, `data_desligamento`, `motivo_desligamento`), não há sincronização própria do PeopleFlow, é a mesma tabela.

Colaboradores desligados somem das telas normais (Colaboradores, headcount do Dashboard, seletor de "Nova movimentação" — ver o filtro `!c.desligado` em `usePortalData.ts`) e passam a aparecer só aqui, com:
- Dados do desligamento (data, motivo, quem registrou no SST);
- Histórico completo das movimentações desse colaborador no PeopleFlow (promoções, transferências etc. antes do desligamento);
- Dois campos editáveis, exclusivos do PeopleFlow — **valor da rescisão** e **valor da GRRF** —, salvos em `peopleflow_desligamentos` (colaborador não tem esses campos no SST).

Enquanto rescisão ou GRRF não estiverem preenchidos, o colaborador conta como **pendência** — aparece no badge do menu lateral e num card no Dashboard ("Desligamentos pendentes"), visível só para RH.

### Descrição de cargo (`/cargos`, formulário POP-RH-001)

Na tela **Cargos**, a coluna "Descrição de cargo" mostra um link **"Ver descrição"** para todo cargo que já tenha o formulário oficial (POP-RH-001) cadastrado em `peopleflow_descricoes_cargo`. Clicar abre uma ficha com todos os campos do formulário:

- **Dados do formulário (auditoria)** — código (ex.: `POP-RH-001-01`), revisão, data do formulário e data de revisão do cargo. Ficam em destaque no topo por serem o dado consultado em auditorias.
- Subordinação, localidade e nível declarados no documento;
- Sumário do cargo, principais responsabilidades, requisitos (escolaridade/experiência), competências (habilidades técnicas/comportamentais) e EPIs.

Cada campo tem um botão de editar (ícone de lápis) visível **só para perfil RH** (`podeEditarDescricaoCargo` em `usePortalData.ts` — na prática, os únicos colaboradores no departamento "Recursos Humanos", hoje Carolina e Leslie). Toda edição grava em `peopleflow_descricoes_cargo` e também insere uma linha em `peopleflow_descricoes_cargo_historico` (valor anterior, valor novo, quem editou, quando) — a ficha mostra esse histórico completo na seção "Histórico de atualizações". Cargo sem descrição cadastrada mostra "—"; RH pode clicar em "+ Adicionar descrição" para começar a preencher do zero (cria a linha na primeira edição salva).

Os 22 formulários reais (pasta "Descrição de Cargos 2026") foram convertidos para SQL em `supabase/descricoes_cargo_seed.local.sql` (gitignorado — conteúdo proprietário da empresa). Ao rodar, confira se cada cargo aparece com o link "Ver descrição" na tela — o nome do cargo (`cargo_nome`) precisa bater exatamente com o texto usado em `colaboradores.cargo`; como o Claude não tem acesso direto ao banco, os nomes foram normalizados a partir do texto em CAIXA ALTA de cada formulário e podem divergir da grafia real. Cargo sem o link após rodar o seed provavelmente só precisa de um `UPDATE ... SET cargo_nome = '<nome real>'`.

## Arquitetura

```
api/                        Vercel Serverless Functions (Node, só servidor — nunca no bundle do navegador)
  _lib/adminAuth.ts           confere que quem chamou é RH autenticado; client admin com a service_role key
  listar-acessos.ts            GET — lista colaboradores + status de provisionamento no Supabase Auth
  provisionar-acesso.ts        POST — cria a conta no Supabase Auth para um e-mail de colaborador válido
src/
  types/domain.ts            entidades de domínio (Colaborador, Cargo, Departamento, Movimentacao, Etapa, ...)
  data/*.json                catálogos estáticos (tipos de movimentação, perfis de acesso) + example data
  lib/supabaseClient.ts       cliente Supabase único (mesmo projeto do Portal SST)
  repositories/
    colaboradoresRepository.ts   lê a tabela `colaboradores` (compartilhada com o SST) — só as colunas
                                 que o PeopleFlow usa, nunca escreve nela
    movimentacoesRepository.ts   CRUD em `peopleflow_movimentacoes` (exclusiva deste portal)
    cargosCustomRepository.ts    CRUD em `peopleflow_cargos_custom` (exclusiva deste portal)
    desligadosRepository.ts       CRUD em `peopleflow_desligamentos` (rescisão/GRRF, exclusiva deste portal)
    acessosRepository.ts          chama as Serverless Functions em api/*.ts (nunca fala com o Supabase
                                 Auth admin direto do navegador)
    portalRepository.ts          catálogos estáticos (tipos, perfis) — sem backend
  domain/                     regras de negócio puras, sem React (testáveis isoladamente):
    hierarquia.ts              e-mail/perfil por colaborador, hierarquia de gestores, aprovador por papel
                              (buildAccess já exclui colaborador desligado)
    permissoes.ts              o que cada perfil pode ver/fazer
    workflow.ts                motor de aprovação: gera etapas, aprova/reprova, gera próximo ID
    formMovimentacao.ts        valida e monta uma Movimentacao a partir do formulário "Nova movimentação"
    agregados.ts                agregações derivadas (headcount por depto, cargos, contagem por gestor)
    desligados.ts                filtra colaboradores desligados e calcula pendência de fechamento financeiro
    historico.ts                 reconstrói a trilha de eventos (criação + etapas) de uma lista de
                              movimentações — usado por Histórico e pelo detalhe de Desligados
    colors.ts / avatar.ts / documentos.ts / dates.ts   utilitários de apresentação
  store/                      estado da aplicação via useReducer + Context (`PortalStoreContext`);
                              carrega colaboradores/movimentações/cargos/desligamentos financeiros do
                              Supabase assim que há sessão autenticada e zera tudo ao deslogar.
                              `useConta()` cruza o e-mail autenticado com os colaboradores para achar a
                              Conta (nome/cargo/perfil). `usePortalData()` combina Conta + store e expõe
                              dados já filtrados por perfil + as ações de workflow (que gravam no Supabase
                              antes de atualizar o estado local) — é o principal hook consumido pelas páginas
  auth/                       AuthContext (Supabase Auth, magic link) + guarda de rotas (RequireAuth)
  components/
    ui/                        biblioteca de componentes visuais (Badge, Card, Button, Modal, Drawer, ...)
    layout/                    Sidebar, Header, AppShell (com navegação sensível a perfil)
    shared/                    ToastContext, NovaMovimentacaoModal (reusado por Dashboard e Workflow)
  features/                   uma pasta por página (dashboard, colaboradores, departamentos, cargos,
                              tipos, workflow, aprovadas, historico, desligados, acessos, auth), cada
                              uma com seu .tsx + .module.css
```

Estilo: CSS Modules (sem framework de UI), tokens de design (cores, raios, sombras) como variáveis CSS em `src/index.css`, fonte Montserrat. Roteamento com React Router v7, ícones via `lucide-react`.

## Banco de dados compartilhado com o Portal SST

Os dois portais MSB usam o **mesmo projeto Supabase**, mas cada um só lê/escreve o que é seu:

| Tabela | Dono | Quem lê | Quem escreve |
|---|---|---|---|
| `colaboradores` | Portal SST | SST (tudo) e PeopleFlow (nome/cargo/departamento/vinculo/depto_code/nivel/gestor/admissao/desligado/data_desligamento/motivo_desligamento/desligado_by) | Cadastro base: criado como pré-cadastro pelo PeopleFlow ao concluir uma Admissão (`api/criar-pre-cadastro.ts`), completado (cpf/nascimento) pelo SST na tela Editar colaborador. `cargo`/`departamento` também atualizados pelo PeopleFlow ao concluir Promoção/Transferência/Mudança de Função (`api/atualizar-cargo-departamento.ts`). `desligado`/`data_desligamento`/`motivo_desligamento`/`desligado_by`: só o SST grava (botão "Desligar colaborador" dele) — o PeopleFlow nunca grava esses campos diretamente, só sinaliza via `peopleflow_desligamento_pendente` abaixo. `admissao` também editável manualmente pelo RH via `api/atualizar-admissao.ts`. Fora essas exceções pontuais (todas RH-only, via service role), PeopleFlow só lê `colaboradores` |
| `peopleflow_desligamento_pendente` | Portal PeopleFlow | Os dois — PeopleFlow escreve, SST lê e apaga | PeopleFlow cria/atualiza a linha ao concluir uma movimentação de Desligamento (direto do navegador). SST lê para mostrar "Desligamento pendente" no Dashboard dele e apaga a linha ao confirmar o desligamento de verdade (tela "Desligar colaborador") |
| `peopleflow_movimentacoes` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador, usuário autenticado) |
| `peopleflow_cargos_custom` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador, usuário autenticado) |
| `peopleflow_desligamentos` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador, usuário autenticado) — valor da rescisão e da GRRF, editados na tela `/desligados` |
| `peopleflow_descricoes_cargo` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador) — escrita liberada por RLS a qualquer autenticado, mas a UI só mostra o botão de editar para perfil RH |
| `peopleflow_descricoes_cargo_historico` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow — log append-only, uma linha por campo editado em `peopleflow_descricoes_cargo` |

Isso significa: **qualquer pessoa cadastrada no SST também aparece automaticamente no PeopleFlow** (mesmo nome/cargo/departamento), mas só consegue **entrar** no PeopleFlow se tiver uma conta Supabase Auth provisionada (passo 2 acima) — ter conta no SST não dá acesso automático ao PeopleFlow, e vice-versa.
