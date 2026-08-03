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
import styles from "./GestaoDesempenhoPage.module.css";

type Aba = "configuracao" | "comportamentais" | "tecnicas" | "avaliacoes" | "potencial" | "acessos" | "pdi" | "pdiBiblioteca";

const ABAS_RH: { id: Aba; label: string }[] = [
  { id: "configuracao", label: "Configuração" },
  { id: "comportamentais", label: "Competências comportamentais" },
  { id: "tecnicas", label: "Competências técnicas (KPIs)" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "potencial", label: "Potencial" },
  { id: "acessos", label: "Acessos AVD" },
  { id: "pdi", label: "PDI" },
  { id: "pdiBiblioteca", label: "Biblioteca de PDI" },
];

/** Aberta a qualquer perfil autenticado, incl. "Colaborador". */
const ABAS_ABERTAS: Aba[] = ["avaliacoes", "pdi"];

/** Aberta a todo perfil MENOS "Colaborador" (RH/Gestor/Diretoria). */
const ABAS_GESTAO: Aba[] = ["potencial"];

/** Módulo Gestão de Desempenho. `podeVerCadastros` (`navRegistro()` em
 * domain/permissoes.ts) é RH-only — Diretoria NÃO tem acesso especial
 * dentro deste módulo, ao contrário de outras telas do portal (ex.:
 * `colaboradoresListagem`); hoje Gestor e Diretoria enxergam exatamente as
 * mesmas abas que o Colaborador ("Avaliações"/"PDI"), mais "Potencial".
 * "Configuração"/"Competências"/"Acessos AVD"/"Biblioteca de PDI" são
 * RH-only; "Avaliações" e "PDI" são abertas a todo perfil (RH gerencia
 * ciclos/PDIs e vê tudo, Gestor/Diretoria preenchem as avaliações dos
 * liderados e veem/editam os PDIs de quem lideram, e o perfil "Colaborador"
 * — acesso restrito à AVD, ver AppShell.tsx — só enxerga suas próprias
 * fichas/PDI, o PDI só depois de concluído pelo gestor); "Potencial" é
 * aberta a todo perfil MENOS "Colaborador" (a própria visibilidade por
 * ficha, `avaliacoesPotencialVisiveis`, já garante que o colaborador nunca
 * veja a própria Avaliação de Potencial, mesmo se chegasse aqui). */
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
      {podeVerCadastros && aba === "acessos" && <AcessosAvdTab />}
      {aba === "pdi" && <PdiTab />}
      {podeVerCadastros && aba === "pdiBiblioteca" && <PdiBibliotecaTab />}
    </>
  );
}
