# Portal PeopleFlow · MSB

Portal interno de RH da MSB para gestão de **movimentações de pessoal** (admissão, promoção, transferência, alteração salarial, mudança de função, desligamento e criação de cargo), com fluxo de aprovação em etapas (Gestor → RH/Diretoria → CEO, conforme o tipo) e visão de dashboard, cadastros (colaboradores, departamentos, cargos) e trilha de auditoria.

Reconstruído a partir de um protótipo visual (`Portal PeopleFlow MSB.zip`, formato proprietário de prototipagem) como uma aplicação real em **React 19 + TypeScript + Vite**, com arquitetura em camadas e dados de demonstração estáticos (sem backend).

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) 20+.

```bash
cd portal-peopleflow
npm install
npm run dev      # http://localhost:5173
npm run build    # build de produção em dist/
npm run lint     # oxlint
```

## Acesso

Login client-side por e-mail corporativo `@msbbrasil.com` (sem senha) — ver `src/auth/AuthContext.tsx`. Só entram e-mails que correspondem a um colaborador que é gestor de pelo menos uma pessoa (`buildAccess()` em `src/domain/hierarquia.ts`). A tela de login lista 6 contas de demonstração (RH, Diretoria e Gestor) para acesso rápido.

Três perfis, com visão e permissões diferentes (ver `src/domain/permissoes.ts`):
- **RH** — acesso completo: todos os colaboradores, todas as movimentações, cadastros de departamentos/cargos.
- **Gestor** — vê apenas sua equipe (hierarquia direta e indireta, via `descendants()`), pode solicitar movimentações e aprovar a etapa "Gestor Solicitante".
- **Diretoria** — não vê o cadastro de colaboradores; vê apenas movimentações encaminhadas para sua aprovação.

## Arquitetura

```
src/
  types/domain.ts            entidades de domínio (Colaborador, Cargo, Departamento, Movimentacao, Etapa, ...)
  data/*.json                dados semente (colaboradores, movimentações, tipos, perfis) — estáticos, sem backend
  repositories/
    portalRepository.ts       único ponto de acesso aos dados semente — trocar por uma API real no futuro
                              significa mudar apenas este arquivo
  domain/                     regras de negócio puras, sem React (testáveis isoladamente):
    hierarquia.ts              e-mail/perfil por colaborador, hierarquia de gestores, aprovador por papel
    permissoes.ts              o que cada perfil pode ver/fazer
    workflow.ts                motor de aprovação: gera etapas, aprova/reprova, gera próximo ID
    formMovimentacao.ts        valida e monta uma Movimentacao a partir do formulário "Nova movimentação"
    agregados.ts                agregações derivadas (headcount por depto, cargos, contagem por gestor)
    colors.ts / avatar.ts / documentos.ts / dates.ts   utilitários de apresentação
  store/                      estado da aplicação via useReducer + Context (`PortalStoreContext`);
                              `usePortalData()` combina a conta autenticada com o store e expõe dados
                              já filtrados por perfil + as ações de workflow — é o principal hook
                              consumido pelas páginas
  auth/                       AuthContext (login/logout client-side) + guarda de rotas (RequireAuth)
  components/
    ui/                        biblioteca de componentes visuais (Badge, Card, Button, Modal, Drawer, ...)
    layout/                    Sidebar, Header, AppShell (com navegação sensível a perfil)
    shared/                    ToastContext, NovaMovimentacaoModal (reusado por Dashboard e Workflow)
  features/                   uma pasta por página (dashboard, colaboradores, departamentos, cargos,
                              tipos, workflow, aprovadas, historico, auth), cada uma com seu .tsx +
                              .module.css
```

Estilo: CSS Modules (sem framework de UI), tokens de design (cores, raios, sombras) como variáveis CSS em `src/index.css`, fonte Montserrat. Roteamento com React Router v7, ícones via `lucide-react`.

## Dados

Todos os dados (55 colaboradores, cargos, departamentos, movimentações de exemplo) são fictícios/de demonstração e ficam em `src/data/*.json`, versionados no repositório — não há dado real de colaboradores nem informação sensível (CPF, salário, saúde) neste projeto.
