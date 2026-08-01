import { useState } from "react";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import { ConfiguracaoAvaliacaoTab } from "./ConfiguracaoAvaliacaoTab";
import { CompetenciasComportamentaisTab } from "./CompetenciasComportamentaisTab";
import { CompetenciasTecnicasTab } from "./CompetenciasTecnicasTab";
import { AvaliacoesTab } from "./AvaliacoesTab";
import { AcessosAvdTab } from "./AcessosAvdTab";
import { PdiTab } from "./PdiTab";
import styles from "./GestaoDesempenhoPage.module.css";

type Aba = "configuracao" | "comportamentais" | "tecnicas" | "avaliacoes" | "acessos" | "pdi";

const ABAS_RH: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Competências comportamentais" },
  { id: "tecnicas", label: "Competências técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "acessos", label: "Acessos AVD" },
  { id: "pdi", label: "PDI" },
];

/** Módulo Gestão de Desempenho. As abas "Configuração"/"Competências"/
 * "Acessos AVD"/"PDI" são RH-only; "Avaliações" é aberta a qualquer perfil
 * autenticado — RH gerencia ciclos e vê tudo, Gestor/Diretoria preenchem as
 * avaliações dos liderados e as próprias, e o perfil "Colaborador" (acesso
 * restrito à AVD, ver AppShell.tsx) só alcança esta página e só enxerga a
 * aba Avaliações, com suas próprias fichas. */
export function GestaoDesempenhoPage() {
  const { podeVerCadastros } = usePortalData();
  const [aba, setAba] = useState<Aba>(() => (podeVerCadastros ? "configuracao" : "avaliacoes"));

  const abasVisiveis = podeVerCadastros ? ABAS_RH : ABAS_RH.filter((a) => a.id === "avaliacoes");

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
      {podeVerCadastros && aba === "acessos" && <AcessosAvdTab />}
      {podeVerCadastros && aba === "pdi" && <PdiTab />}
    </>
  );
}
