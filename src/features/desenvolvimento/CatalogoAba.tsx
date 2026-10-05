import { useState } from "react";
import { CatalogoHabilidadesAba } from "./CatalogoHabilidadesAba";
import { CatalogoCompetenciasAba } from "./CatalogoCompetenciasAba";
import styles from "./Desenvolvimento.module.css";

type Visao = "habilidades" | "competencias";

const OPCOES: { id: Visao; rotulo: string }[] = [
  { id: "habilidades", rotulo: "Habilidades Técnicas" },
  { id: "competencias", rotulo: "Competências Comportamentais" },
];

/** Aba "Catálogo": dois catálogos institucionais distintos, separados por uma
 * alternância interna. Habilidades Técnicas é a tela original, intocada;
 * Competências Comportamentais é somente consulta e só busca seus dados quando
 * é aberta. */
export function CatalogoAba() {
  const [visao, setVisao] = useState<Visao>("habilidades");
  return (
    <>
      <div className={styles.alternador} role="tablist" aria-label="Tipo de catálogo">
        {OPCOES.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={o.id === visao}
            className={o.id === visao ? styles.alternadorAtiva : styles.alternadorOpcao}
            onClick={() => setVisao(o.id)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {visao === "habilidades" ? <CatalogoHabilidadesAba /> : <CatalogoCompetenciasAba />}
    </>
  );
}
