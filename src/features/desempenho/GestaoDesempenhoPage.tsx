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
import styles from "./GestaoDesempenhoPage.module.css";

type Aba = "configuracao" | "comportamentais" | "tecnicas" | "avaliacoes" | "acessos" | "pdi" | "pdiBiblioteca";

const ABAS_RH: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Competências comportamentais" },
  { id: "tecnicas", label: "Competências técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "acessos", label: "Acessos AVD" },
  { id: "pdi", label: "PDI" },
  { id: "pdiBiblioteca", label: "Biblioteca de PDI" },
];

const ABAS_ABERTAS: Aba[] = ["avaliacoes", "pdi"];

/** Módulo Gestão de Desempenho. As abas "Configuração"/"Competências"/
 * "Acessos AVD"/"Biblioteca de PDI" são RH-only (Diretoria também alcança,
 * sem os botões de edição — mesmo padrão de `colaboradoresListagem`);
 * "Avaliações" e "PDI" são abertas a qualquer perfil autenticado — RH
 * gerencia ciclos/PDIs e vê tudo, Gestor/Diretoria preenchem as avaliações
 * dos liderados e veem/editam os PDIs de quem lideram, e o perfil
 * "Colaborador" (acesso restrito à AVD, ver AppShell.tsx) só alcança esta
 * página e só enxerga suas próprias fichas/PDI (o PDI só depois de
 * concluído pelo gestor, ver pdiVisiveis em usePortalData.ts). */
export function GestaoDesempenhoPage() {
  const { podeVerCadastros } = usePortalData();
  const [aba, setAba] = useState<Aba>(() => (podeVerCadastros ? "configuracao" : "avaliacoes"));

  const abasVisiveis = podeVerCadastros ? ABAS_RH : ABAS_RH.filter((a) => ABAS_ABERTAS.includes(a.id));

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
      {aba === "pdi" && <PdiTab />}
      {podeVerCadastros && aba === "pdiBiblioteca" && <PdiBibliotecaTab />}
    </>
  );
}
