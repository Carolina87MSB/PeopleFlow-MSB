import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import { ConfiguracaoAvaliacaoTab } from "./ConfiguracaoAvaliacaoTab";
import { CompetenciasComportamentaisTab } from "./CompetenciasComportamentaisTab";
import { CompetenciasTecnicasTab } from "./CompetenciasTecnicasTab";
import { AvaliacoesTab } from "./AvaliacoesTab";
import { AcessosAvdTab } from "./AcessosAvdTab";
import { PdiTab } from "./PdiTab";
import { PdiBibliotecaTab } from "./PdiBibliotecaTab";
import { FeedbackTab } from "./FeedbackTab";
import { AvaliacoesPotencialTab } from "./AvaliacoesPotencialTab";
import { Matriz9BoxTab } from "./Matriz9BoxTab";
import { CalibracaoTab } from "./CalibracaoTab";
import { DashboardDesempenhoTab } from "./DashboardDesempenhoTab";
import { HistoricoTab } from "./HistoricoTab";
import { ReajusteSalarialTab } from "./ReajusteSalarialTab";
import styles from "./GestaoDesempenhoPage.module.css";

type Aba =
  | "configuracao"
  | "comportamentais"
  | "tecnicas"
  | "avaliacoes"
  | "potencial"
  | "acessos"
  | "pdi"
  | "pdiBiblioteca"
  | "feedback"
  | "matriz9box"
  | "calibracao"
  | "dashboard"
  | "historico"
  | "reajusteSalarial";

const ABAS_RH: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Comp. comportamentais" },
  { id: "tecnicas", label: "Comp. técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "potencial", label: "Potencial" },
  { id: "matriz9box", label: "Matriz 9 Box" },
  { id: "calibracao", label: "Calibração" },
  { id: "reajusteSalarial", label: "Reajuste Salarial" },
  { id: "dashboard", label: "Dashboard" },
  { id: "historico", label: "Histórico" },
  { id: "acessos", label: "Acessos AVD" },
  { id: "pdi", label: "PDI" },
  { id: "pdiBiblioteca", label: "Biblioteca de PDI" },
  { id: "feedback", label: "Feedback" },
];

/** Aberta a qualquer perfil autenticado, incl. "Colaborador". */
const ABAS_ABERTAS: Aba[] = ["avaliacoes", "pdi", "historico"];

/** Aberta a todo perfil MENOS "Colaborador" (RH/Gestor/Diretoria) — Feedback
 * é ferramenta de gestão do gestor sobre o liderado, sem visão própria do
 * colaborador (spec da nova funcionalidade nunca menciona autovisualização). */
const ABAS_GESTAO: Aba[] = ["potencial", "matriz9box", "dashboard", "feedback"];

/** Agrupamento do menu superior — mesmas abas, mesmas permissões de sempre,
 * só reorganizadas visualmente em grupos. Cada aba é uma sub-rota própria
 * (/desempenho/:aba, ver App.tsx) — o 1º item visível de cada grupo (nesta
 * ordem) é a "página inicial" desse grupo, pra onde se navega ao clicar
 * direto no cabeçalho do grupo. Representa o fluxo Configuro → Avalio →
 * Calibro → Analiso → Desenvolvo → Acompanho. Um grupo com só 1 item visível
 * pro perfil atual (ex.: Colaborador só vê "Avaliações" dentro de "Ciclo de
 * Avaliação") renderiza como botão simples, sem dropdown — ver
 * GestaoDesempenhoPage.tsx. */
const GRUPOS_ABAS: { titulo: string; abas: Aba[] }[] = [
  { titulo: "Configurações", abas: ["configuracao", "acessos", "comportamentais", "tecnicas"] },
  { titulo: "Ciclo de Avaliação", abas: ["avaliacoes", "potencial", "calibracao"] },
  { titulo: "Análise", abas: ["matriz9box", "reajusteSalarial"] },
  { titulo: "Desenvolvimento", abas: ["pdi", "feedback", "pdiBiblioteca"] },
  { titulo: "Gestão", abas: ["dashboard", "historico"] },
];

/** Módulo Gestão de Desempenho. `podeVerCadastros` (`navRegistro()` em
 * domain/permissoes.ts) é RH-only — Diretoria NÃO tem acesso especial
 * dentro deste módulo, ao contrário de outras telas do portal (ex.:
 * `colaboradoresListagem`); hoje Gestor e Diretoria enxergam exatamente as
 * mesmas abas que o Colaborador ("Avaliações"/"PDI"/"Histórico"), mais
 * "Potencial"/"Matriz 9 Box"/"Dashboard". "Configuração"/"Competências"/
 * "Acessos AVD"/"Biblioteca de PDI"/"Calibração"/"Reajuste Salarial" são
 * RH-only — "Reajuste Salarial" lida com dado sensível (salário) e efetiva
 * escrita em massa, mesmo nível de restrição de "Calibração". (o Comitê de
 * Calibração é sempre o RH, não um perfil novo — spec da Etapa 6 não
 * menciona Gestor/Diretoria em nenhum momento pra esta aba); "Avaliações",
 * "PDI" e "Histórico" são abertas a todo perfil (RH gerencia ciclos/PDIs e
 * vê tudo, Gestor/Diretoria preenchem as avaliações dos liderados e
 * veem/editam os PDIs de quem lideram, e o perfil "Colaborador" — acesso
 * restrito à AVD, ver AppShell.tsx — só enxerga suas próprias fichas/PDI/
 * linha do tempo, o PDI só depois de concluído pelo gestor); "Potencial"/
 * "Matriz 9 Box"/"Dashboard" são abertas a todo perfil MENOS "Colaborador"
 * (a própria visibilidade por ficha/colaborador,
 * `avaliacoesPotencialVisiveis`/`colaboradoresParaMatriz9Box`, já garante
 * que o colaborador nunca veja a própria Avaliação de Potencial nem a
 * Matriz, mesmo se chegasse aqui; o Dashboard, Etapa 8, usa
 * `colaboradoresListagem` — que dá visão de empresa toda a RH e Diretoria,
 * exceção deliberada ao padrão do resto do módulo, ver
 * DashboardDiretoriaTab.tsx). O Histórico, Etapa 9, é a ÚNICA aba
 * `ABAS_GESTAO`-like que É aberta ao Colaborador — ele vê a própria linha
 * do tempo direto, sem lista/filtro (`colaboradoresParaHistorico` retorna só
 * o próprio registro pra esse perfil, ao contrário de `colaboradoresParaMatriz9Box`,
 * que retorna `[]`), e a Diretoria aqui é tratada igual RH (empresa toda),
 * não igual Gestor — outra exceção deliberada, decidida com o usuário, já
 * que o spec desta etapa nunca menciona Diretoria. "Feedback" segue o mesmo
 * padrão de "Potencial"/"Matriz 9 Box"/"Dashboard" (aberta a todo perfil
 * MENOS "Colaborador") — é ferramenta do gestor sobre o liderado, sem
 * autovisualização, deliberadamente independente de AVD/PDI/ciclo (ver
 * domain/feedback.ts). */
export function GestaoDesempenhoPage() {
  const { podeVerCadastros, perfil } = usePortalData();
  const navigate = useNavigate();
  const { aba: abaDaRota } = useParams<{ aba?: string }>();

  const abasVisiveis = ABAS_RH.filter(
    (a) => podeVerCadastros || ABAS_ABERTAS.includes(a.id) || (ABAS_GESTAO.includes(a.id) && perfil !== "Colaborador"),
  );

  // Mesma lista de abasVisiveis de sempre, só reorganizada em grupos pra
  // exibição — nenhuma aba nova, nenhuma removida, nenhuma permissão nova.
  const gruposVisiveis = useMemo(() => {
    const abaPorId = new Map(abasVisiveis.map((a) => [a.id, a]));
    return GRUPOS_ABAS.map((g) => ({
      titulo: g.titulo,
      itens: g.abas.map((id) => abaPorId.get(id)).filter((a): a is { id: Aba; label: string } => Boolean(a)),
    })).filter((g) => g.itens.length > 0);
  }, [abasVisiveis]);

  // Aba efetiva = a da URL, se for válida/visível pro perfil atual; senão a
  // mesma aba padrão de sempre (1ª aba RH-only, ou "avaliacoes" pra quem não
  // vê cadastros). Cobre tanto /desempenho (sem sub-rota) quanto uma aba
  // desconhecida/sem permissão.
  const abaPadrao: Aba = podeVerCadastros ? "configuracao" : "avaliacoes";
  const abaValida = abasVisiveis.some((a) => a.id === abaDaRota);
  const aba: Aba = abaValida ? (abaDaRota as Aba) : abaPadrao;

  // Corrige a URL sempre que ela não aponta pra uma aba válida — garante que
  // toda aba principal tenha sua própria rota navegável/compartilhável, sem
  // depender de clicar num submenu primeiro.
  useEffect(() => {
    if (!abaValida) navigate(`/desempenho/${abaPadrao}`, { replace: true });
  }, [abaValida, abaPadrao, navigate]);

  const grupoDaAbaAtual = gruposVisiveis.find((g) => g.itens.some((i) => i.id === aba))?.titulo ?? null;

  // Grupo expandido visualmente: sempre acompanha a aba atual (inclusive ao
  // acessar direto a rota de um submenu), mas pode ser fechado manualmente
  // sem trocar de aba — ao reabrir ou trocar de grupo, volta a acompanhar.
  const [grupoFechadoManualmente, setGrupoFechadoManualmente] = useState<string | null>(null);
  const grupoAberto = grupoFechadoManualmente === grupoDaAbaAtual ? null : grupoDaAbaAtual;
  const grupoDeAberto = gruposVisiveis.find((g) => g.titulo === grupoAberto) ?? null;

  function selecionarAba(id: Aba) {
    navigate(`/desempenho/${id}`);
  }

  // Clicar num grupo diferente do atual navega direto pra página inicial
  // dele (1º item visível) — nunca fica só marcado/expandido sem trocar o
  // conteúdo. Clicar no grupo que já é o da aba atual só alterna
  // mostrar/ocultar o submenu, sem mudar a aba selecionada.
  function clicarGrupo(g: { titulo: string; itens: { id: Aba; label: string }[] }) {
    if (g.titulo === grupoDaAbaAtual) {
      setGrupoFechadoManualmente((atual) => (atual === g.titulo ? null : g.titulo));
      return;
    }
    setGrupoFechadoManualmente(null);
    navigate(`/desempenho/${g.itens[0].id}`);
  }

  return (
    <>
      <Header />

      {gruposVisiveis.length > 1 && (
        <div className={styles.menuWrap}>
          <div className={styles.abas}>
            {gruposVisiveis.map((g) => {
              if (g.itens.length === 1) {
                const item = g.itens[0];
                return (
                  <button key={g.titulo} type="button" className={aba === item.id ? styles.abaAtiva : styles.aba} onClick={() => selecionarAba(item.id)}>
                    {item.label}
                  </button>
                );
              }
              const grupoAtivo = g.itens.some((i) => i.id === aba);
              const aberto = grupoAberto === g.titulo;
              return (
                <button
                  key={g.titulo}
                  type="button"
                  className={grupoAtivo ? styles.abaAtiva : styles.aba}
                  onClick={() => clicarGrupo(g)}
                >
                  {g.titulo}
                  <ChevronDown size={12} className={aberto ? styles.chevronAberto : styles.chevron} />
                </button>
              );
            })}
          </div>

          {grupoDeAberto && (
            <div className={styles.subAbas}>
              {grupoDeAberto.itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={aba === item.id ? styles.subAbaAtiva : styles.subAba}
                  onClick={() => selecionarAba(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {podeVerCadastros && aba === "configuracao" && <ConfiguracaoAvaliacaoTab />}
      {podeVerCadastros && aba === "comportamentais" && <CompetenciasComportamentaisTab />}
      {podeVerCadastros && aba === "tecnicas" && <CompetenciasTecnicasTab />}
      {aba === "avaliacoes" && <AvaliacoesTab />}
      {perfil !== "Colaborador" && aba === "potencial" && <AvaliacoesPotencialTab />}
      {perfil !== "Colaborador" && aba === "matriz9box" && <Matriz9BoxTab />}
      {podeVerCadastros && aba === "calibracao" && <CalibracaoTab />}
      {podeVerCadastros && aba === "reajusteSalarial" && <ReajusteSalarialTab />}
      {perfil !== "Colaborador" && aba === "dashboard" && <DashboardDesempenhoTab />}
      {aba === "historico" && <HistoricoTab />}
      {podeVerCadastros && aba === "acessos" && <AcessosAvdTab />}
      {aba === "pdi" && <PdiTab />}
      {perfil !== "Colaborador" && aba === "feedback" && <FeedbackTab />}
      {podeVerCadastros && aba === "pdiBiblioteca" && <PdiBibliotecaTab />}
    </>
  );
}
