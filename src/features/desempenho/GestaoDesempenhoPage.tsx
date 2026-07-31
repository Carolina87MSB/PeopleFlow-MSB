import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import { ConfiguracaoAvaliacaoTab } from "./ConfiguracaoAvaliacaoTab";
import { CompetenciasComportamentaisTab } from "./CompetenciasComportamentaisTab";
import { CompetenciasTecnicasTab } from "./CompetenciasTecnicasTab";
import { AvaliacoesTab } from "./AvaliacoesTab";
import { PdiTab } from "./PdiTab";
import styles from "./GestaoDesempenhoPage.module.css";

type Aba = "configuracao" | "comportamentais" | "tecnicas" | "avaliacoes" | "pdi";

const ABAS: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Competências comportamentais" },
  { id: "tecnicas", label: "Competências técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "pdi", label: "PDI" },
];

/** Módulo Gestão de Desempenho — etapa 1: só estrutura (configuração de
 * pesos, catálogo de competências comportamentais, KPIs por cargo,
 * esqueleto de Avaliações/PDI). Sem cálculo de nota, fluxo de aprovação,
 * autoavaliação, Matriz 9 Box ou dashboards ainda (ver README). */
export function GestaoDesempenhoPage() {
  const { podeVerCadastros } = usePortalData();
  const [aba, setAba] = useState<Aba>("configuracao");

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={styles.abas}>
        {ABAS.map((a) => (
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

      {aba === "configuracao" && <ConfiguracaoAvaliacaoTab />}
      {aba === "comportamentais" && <CompetenciasComportamentaisTab />}
      {aba === "tecnicas" && <CompetenciasTecnicasTab />}
      {aba === "avaliacoes" && <AvaliacoesTab />}
      {aba === "pdi" && <PdiTab />}
    </>
  );
}
