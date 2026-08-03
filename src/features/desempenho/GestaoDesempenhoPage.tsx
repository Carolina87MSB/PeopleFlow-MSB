import { useState } from "react";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import { ConfiguracaoAvaliacaoTab } from "./ConfiguracaoAvaliacaoTab";
import { CompetenciasComportamentaisTab } from "./CompetenciasComportamentaisTab";
import { CompetenciasTecnicasTab } from "./CompetenciasTecnicasTab";
import { AvaliacoesTab } from "./AvaliacoesTab";
import { AcessosAvdTab } from "./AcessosAvdTab";
import { PdiTab } from "./PdiTab";
import { PdiBibliotecaTab } from "./PdiBibliotecaTab";
import { AvaliacoesPotencialTab } from "./AvaliacoesPotencialTab";
import { Matriz9BoxTab } from "./Matriz9BoxTab";
import { CalibracaoTab } from "./CalibracaoTab";
import { DashboardDesempenhoTab } from "./DashboardDesempenhoTab";
import { HistoricoTab } from "./HistoricoTab";
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
  | "matriz9box"
  | "calibracao"
  | "dashboard"
  | "historico";

const ABAS_RH: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Competências comportamentais" },
  { id: "tecnicas", label: "Competências técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "potencial", label: "Potencial" },
  { id: "matriz9box", label: "Matriz 9 Box" },
  { id: "calibracao", label: "Calibração" },
  { id: "dashboard", label: "Dashboard" },
  { id: "historico", label: "Histórico" },
  { id: "acessos", label: "Acessos AVD" },
  { id: "pdi", label: "PDI" },
  { id: "pdiBiblioteca", label: "Biblioteca de PDI" },
];

/** Aberta a qualquer perfil autenticado, incl. "Colaborador". */
const ABAS_ABERTAS: Aba[] = ["avaliacoes", "pdi", "historico"];

/** Aberta a todo perfil MENOS "Colaborador" (RH/Gestor/Diretoria). */
const ABAS_GESTAO: Aba[] = ["potencial", "matriz9box", "dashboard"];

/** Módulo Gestão de Desempenho. `podeVerCadastros` (`navRegistro()` em
 * domain/permissoes.ts) é RH-only — Diretoria NÃO tem acesso especial
 * dentro deste módulo, ao contrário de outras telas do portal (ex.:
 * `colaboradoresListagem`); hoje Gestor e Diretoria enxergam exatamente as
 * mesmas abas que o Colaborador ("Avaliações"/"PDI"/"Histórico"), mais
 * "Potencial"/"Matriz 9 Box"/"Dashboard". "Configuração"/"Competências"/
 * "Acessos AVD"/"Biblioteca de PDI"/"Calibração" são RH-only (o Comitê de
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
 * que o spec desta etapa nunca menciona Diretoria. */
export function GestaoDesempenhoPage() {
  const { podeVerCadastros, perfil } = usePortalData();
  const [aba, setAba] = useState<Aba>(() => (podeVerCadastros ? "configuracao" : "avaliacoes"));

  const abasVisiveis = ABAS_RH.filter(
    (a) => podeVerCadastros || ABAS_ABERTAS.includes(a.id) || (ABAS_GESTAO.includes(a.id) && perfil !== "Colaborador"),
  );

  return (
    <>
      <Header />

      {abasVisiveis.length > 1 && (
        <div className={styles.abas}>
          {abasVisiveis.map((a) => (
            <button
              key={a.id}
              type="button"
              className={aba === a.id ? styles.abaAtiva : styles.aba}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {podeVerCadastros && aba === "configuracao" && <ConfiguracaoAvaliacaoTab />}
      {podeVerCadastros && aba === "comportamentais" && <CompetenciasComportamentaisTab />}
      {podeVerCadastros && aba === "tecnicas" && <CompetenciasTecnicasTab />}
      {aba === "avaliacoes" && <AvaliacoesTab />}
      {perfil !== "Colaborador" && aba === "potencial" && <AvaliacoesPotencialTab />}
      {perfil !== "Colaborador" && aba === "matriz9box" && <Matriz9BoxTab />}
      {podeVerCadastros && aba === "calibracao" && <CalibracaoTab />}
      {perfil !== "Colaborador" && aba === "dashboard" && <DashboardDesempenhoTab />}
      {aba === "historico" && <HistoricoTab />}
      {podeVerCadastros && aba === "acessos" && <AcessosAvdTab />}
      {aba === "pdi" && <PdiTab />}
      {podeVerCadastros && aba === "pdiBiblioteca" && <PdiBibliotecaTab />}
    </>
  );
}
