# Portal PeopleFlow · MSB

Portal interno de RH da MSB para gestão de **movimentações de pessoal** (admissão, promoção, transferência, alteração salarial, mudança de função, desligamento e criação de cargo), com fluxo de aprovação em etapas (Gestor → RH/Diretoria → CEO, conforme o tipo) e visão de dashboard, cadastros (colaboradores, departamentos, cargos) e trilha de auditoria.

Reconstruído a partir de um protótipo visual (`Portal PeopleFlow MSB.zip`, formato proprietário de prototipagem) como uma aplicação real em **React 19 + TypeScript + Vite**, com arquitetura em camadas e **Supabase** como backend — o **mesmo projeto Supabase do [Portal SST MSB](https://github.com/Carolina87MSB/Portal-SST-MSB)**, deploy na **Vercel**.

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) 20+ e um projeto Supabase já configurado para o Portal SST (mesmo `.env.local` dele funciona aqui).

1. **Rode o schema deste portal**: abra _SQL Editor_ no painel do MESMO projeto Supabase usado pelo SST, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute. Isso:
   - adiciona 5 colunas novas (`matricula`, `depto_code`, `nivel`, `gestor`, `admissao`) à tabela `colaboradores` já existente do SST — **não remove nem altera nada que o SST já usa**;
   - cria duas tabelas exclusivas deste portal: `peopleflow_movimentacoes` e `peopleflow_cargos_custom`, com RLS liberando leitura/escrita para qualquer usuário autenticado.
2. **Provisione as contas de acesso**: diferente do SST (só RH tem conta), aqui **todo Gestor, Diretor e RH que for usar o portal precisa de uma conta no Supabase Auth**. Em _Authentication → Users → Add user_, crie uma entrada para cada e-mail `@msbbrasil.com` correspondente a um gestor cadastrado na tabela `colaboradores` (o login é por link mágico, sem senha — não há autocadastro).
3. **Configure o ambiente local**:
   ```bash
   cd portal-peopleflow
   cp .env.example .env.local
   # preencha com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY do MESMO projeto do SST
   npm install
   ```
4. **Popule os campos do PeopleFlow para os colaboradores reais** (opcional, mas necessário para o organograma/hierarquia funcionar corretamente — sem isso, matrícula/gestor/nível/admissão aparecem como "—" para todo mundo): crie um `src/data/colaboradores.local.json` (gitignored) no formato de [`src/data/colaboradores.example.json`](src/data/colaboradores.example.json) — só precisa de `{ nome, matricula, deptoCode, nivel, gestor, admissao }`, o `nome` tem que bater exatamente com o `nome` já cadastrado no SST — e rode:
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
2. Em _Settings → Environment Variables_, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` — os **mesmos valores já usados no deploy do SST** (mesmo projeto Supabase). Lembre do prefixo `VITE_` (Vite, não Next.js).
3. Em Supabase → _Authentication → URL Configuration_, adicione a URL da Vercel deste projeto (diferente da URL do SST) na lista de _Redirect URLs_ permitidas — senão o link mágico do e-mail quebra em produção.

## Acesso

Login por **link mágico** (e-mail corporativo `@msbbrasil.com`, sem senha) via Supabase Auth — ver `src/auth/AuthContext.tsx`. Só entram e-mails com conta previamente criada no Supabase (`shouldCreateUser: false`); não há cadastro aberto. Depois de autenticado, o app cruza o e-mail com a tabela `colaboradores` (`buildAccess()` em `src/domain/hierarquia.ts`) para descobrir nome/cargo/perfil — se o e-mail não corresponder a nenhum gestor cadastrado, a tela mostra um aviso pedindo para falar com o RH (ver `AppShell.tsx`).

Três perfis, com visão e permissões diferentes (ver `src/domain/permissoes.ts`):
- **RH** — acesso completo: todos os colaboradores, todas as movimentações, cadastros de departamentos/cargos.
- **Gestor** — vê apenas sua equipe (hierarquia direta e indireta, via `descendants()`), pode solicitar movimentações e aprovar a etapa "Gestor Solicitante".
- **Diretoria** — não vê o cadastro de colaboradores; vê apenas movimentações encaminhadas para sua aprovação.

## Arquitetura

```
src/
  types/domain.ts            entidades de domínio (Colaborador, Cargo, Departamento, Movimentacao, Etapa, ...)
  data/*.json                catálogos estáticos (tipos de movimentação, perfis de acesso) + example data
  lib/supabaseClient.ts       cliente Supabase único (mesmo projeto do Portal SST)
  repositories/
    colaboradoresRepository.ts   lê a tabela `colaboradores` (compartilhada com o SST) — só as colunas
                                 que o PeopleFlow usa, nunca escreve nela
    movimentacoesRepository.ts   CRUD em `peopleflow_movimentacoes` (exclusiva deste portal)
    cargosCustomRepository.ts    CRUD em `peopleflow_cargos_custom` (exclusiva deste portal)
    portalRepository.ts          catálogos estáticos (tipos, perfis) — sem backend
  domain/                     regras de negócio puras, sem React (testáveis isoladamente):
    hierarquia.ts              e-mail/perfil por colaborador, hierarquia de gestores, aprovador por papel
    permissoes.ts              o que cada perfil pode ver/fazer
    workflow.ts                motor de aprovação: gera etapas, aprova/reprova, gera próximo ID
    formMovimentacao.ts        valida e monta uma Movimentacao a partir do formulário "Nova movimentação"
    agregados.ts                agregações derivadas (headcount por depto, cargos, contagem por gestor)
    colors.ts / avatar.ts / documentos.ts / dates.ts   utilitários de apresentação
  store/                      estado da aplicação via useReducer + Context (`PortalStoreContext`);
                              carrega colaboradores/movimentações/cargos do Supabase assim que há sessão
                              autenticada e zera tudo ao deslogar. `useConta()` cruza o e-mail autenticado
                              com os colaboradores para achar a Conta (nome/cargo/perfil). `usePortalData()`
                              combina Conta + store e expõe dados já filtrados por perfil + as ações de
                              workflow (que gravam no Supabase antes de atualizar o estado local) — é o
                              principal hook consumido pelas páginas
  auth/                       AuthContext (Supabase Auth, magic link) + guarda de rotas (RequireAuth)
  components/
    ui/                        biblioteca de componentes visuais (Badge, Card, Button, Modal, Drawer, ...)
    layout/                    Sidebar, Header, AppShell (com navegação sensível a perfil)
    shared/                    ToastContext, NovaMovimentacaoModal (reusado por Dashboard e Workflow)
  features/                   uma pasta por página (dashboard, colaboradores, departamentos, cargos,
                              tipos, workflow, aprovadas, historico, auth), cada uma com seu .tsx +
                              .module.css
```

Estilo: CSS Modules (sem framework de UI), tokens de design (cores, raios, sombras) como variáveis CSS em `src/index.css`, fonte Montserrat. Roteamento com React Router v7, ícones via `lucide-react`.

## Banco de dados compartilhado com o Portal SST

Os dois portais MSB usam o **mesmo projeto Supabase**, mas cada um só lê/escreve o que é seu:

| Tabela | Dono | Quem lê | Quem escreve |
|---|---|---|---|
| `colaboradores` | Portal SST | SST (tudo) e PeopleFlow (só nome/cargo/departamento/matricula/depto_code/nivel/gestor/admissao) | Só o SST (via `npm run seed:supabase` dele, service role) — PeopleFlow só faz `UPDATE` das 5 colunas extras via seu próprio `seed:supabase` |
| `peopleflow_movimentacoes` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador, usuário autenticado) |
| `peopleflow_cargos_custom` | Portal PeopleFlow | Só PeopleFlow | Só PeopleFlow (direto do navegador, usuário autenticado) |

Isso significa: **qualquer pessoa cadastrada no SST também aparece automaticamente no PeopleFlow** (mesmo nome/cargo/departamento), mas só consegue **entrar** no PeopleFlow se tiver uma conta Supabase Auth provisionada (passo 2 acima) — ter conta no SST não dá acesso automático ao PeopleFlow, e vice-versa.
