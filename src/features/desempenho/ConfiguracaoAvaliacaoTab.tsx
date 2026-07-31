import { useEffect, useState } from "react";
import { Card, Button } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import styles from "./ConfiguracaoAvaliacaoTab.module.css";

/** Configuração geral da Avaliação de Desempenho: peso de cada bloco (KPIs +
 * Comportamentais) que vai compor a nota final — etapa 1 não calcula nada
 * ainda, só guarda os pesos editáveis pelo RH, com validação de soma=100%. */
export function ConfiguracaoAvaliacaoTab() {
  const { configAvaliacaoDesempenho, atualizarConfigAvaliacaoDesempenho, podeEditarGestaoDesempenho } = usePortalData();

  const [pesoKpis, setPesoKpis] = useState(String(configAvaliacaoDesempenho?.pesoKpis ?? 60));
  const [pesoComportamental, setPesoComportamental] = useState(String(configAvaliacaoDesempenho?.pesoComportamental ?? 40));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setPesoKpis(String(configAvaliacaoDesempenho?.pesoKpis ?? 60));
    setPesoComportamental(String(configAvaliacaoDesempenho?.pesoComportamental ?? 40));
  }, [configAvaliacaoDesempenho]);

  const numKpis = Number(pesoKpis.replace(",", "."));
  const numComportamental = Number(pesoComportamental.replace(",", "."));
  const soma = numKpis + numComportamental;
  const somaValida = !Number.isNaN(soma) && Math.abs(soma - 100) < 0.01;

  async function handleSalvar() {
    if (!somaValida) return;
    setSalvando(true);
    await atualizarConfigAvaliacaoDesempenho(numKpis, numComportamental);
    setSalvando(false);
  }

  return (
    <Card padded>
      <h3 className={styles.titulo}>Blocos da avaliação</h3>
      <p className={styles.explicacao}>
        Peso de cada bloco na nota final da Avaliação de Desempenho. A soma precisa ser 100%. (O cálculo automático da
        nota chega numa próxima etapa — por ora só os pesos ficam guardados.)
      </p>

      <div className={styles.campos}>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="peso-kpis">
            Competências Técnicas (KPIs)
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="peso-kpis"
              className={styles.input}
              value={pesoKpis}
              onChange={(e) => setPesoKpis(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
            <span className={styles.sufixo}>%</span>
          </div>
        </div>

        <div className={styles.campo}>
          <label className={styles.label} htmlFor="peso-comportamental">
            Competências Comportamentais
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="peso-comportamental"
              className={styles.input}
              value={pesoComportamental}
              onChange={(e) => setPesoComportamental(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
            <span className={styles.sufixo}>%</span>
          </div>
        </div>
      </div>

      <div className={styles.rodape}>
        <span className={somaValida ? styles.somaOk : styles.somaErro}>Soma: {Number.isNaN(soma) ? "—" : soma}%</span>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" onClick={handleSalvar} disabled={!somaValida || salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>
    </Card>
  );
}
