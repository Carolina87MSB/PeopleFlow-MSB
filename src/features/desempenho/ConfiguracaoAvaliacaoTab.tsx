import { useEffect, useState } from "react";
import { Card, Button } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import styles from "./ConfiguracaoAvaliacaoTab.module.css";

function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

/** Configuração geral da Gestão de Desempenho: peso de cada bloco da AVD
 * (KPIs + Comportamentais), nota mínima pro PDI, e limiares da Matriz 9 Box
 * (Desempenho/Potencial) — um único config, uma única gravação, validada
 * como um todo antes de salvar (ver atualizarConfigAvaliacaoDesempenho() em
 * usePortalData.ts). */
export function ConfiguracaoAvaliacaoTab() {
  const { configAvaliacaoDesempenho, atualizarConfigAvaliacaoDesempenho, podeEditarGestaoDesempenho } = usePortalData();

  const [pesoKpis, setPesoKpis] = useState(String(configAvaliacaoDesempenho?.pesoKpis ?? 60));
  const [pesoComportamental, setPesoComportamental] = useState(String(configAvaliacaoDesempenho?.pesoComportamental ?? 40));
  const [notaMinimaPdi, setNotaMinimaPdi] = useState(String(configAvaliacaoDesempenho?.notaMinimaPdi ?? 3));
  const [matrizDesempenhoLimiteMedio, setMatrizDesempenhoLimiteMedio] = useState(
    String(configAvaliacaoDesempenho?.matrizDesempenhoLimiteMedio ?? 3),
  );
  const [matrizDesempenhoLimiteAlto, setMatrizDesempenhoLimiteAlto] = useState(
    String(configAvaliacaoDesempenho?.matrizDesempenhoLimiteAlto ?? 4),
  );
  const [matrizPotencialLimiteMedio, setMatrizPotencialLimiteMedio] = useState(
    String(configAvaliacaoDesempenho?.matrizPotencialLimiteMedio ?? 3),
  );
  const [matrizPotencialLimiteAlto, setMatrizPotencialLimiteAlto] = useState(
    String(configAvaliacaoDesempenho?.matrizPotencialLimiteAlto ?? 4),
  );
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setPesoKpis(String(configAvaliacaoDesempenho?.pesoKpis ?? 60));
    setPesoComportamental(String(configAvaliacaoDesempenho?.pesoComportamental ?? 40));
    setNotaMinimaPdi(String(configAvaliacaoDesempenho?.notaMinimaPdi ?? 3));
    setMatrizDesempenhoLimiteMedio(String(configAvaliacaoDesempenho?.matrizDesempenhoLimiteMedio ?? 3));
    setMatrizDesempenhoLimiteAlto(String(configAvaliacaoDesempenho?.matrizDesempenhoLimiteAlto ?? 4));
    setMatrizPotencialLimiteMedio(String(configAvaliacaoDesempenho?.matrizPotencialLimiteMedio ?? 3));
    setMatrizPotencialLimiteAlto(String(configAvaliacaoDesempenho?.matrizPotencialLimiteAlto ?? 4));
  }, [configAvaliacaoDesempenho]);

  const numKpis = paraNumero(pesoKpis);
  const numComportamental = paraNumero(pesoComportamental);
  const numNotaMinimaPdi = paraNumero(notaMinimaPdi);
  const numMatrizDesempenhoLimiteMedio = paraNumero(matrizDesempenhoLimiteMedio);
  const numMatrizDesempenhoLimiteAlto = paraNumero(matrizDesempenhoLimiteAlto);
  const numMatrizPotencialLimiteMedio = paraNumero(matrizPotencialLimiteMedio);
  const numMatrizPotencialLimiteAlto = paraNumero(matrizPotencialLimiteAlto);

  const soma = numKpis + numComportamental;
  const somaValida = !Number.isNaN(soma) && Math.abs(soma - 100) < 0.01;
  const notaMinimaValida = !Number.isNaN(numNotaMinimaPdi) && numNotaMinimaPdi >= 1 && numNotaMinimaPdi <= 5;
  const limiaresDesempenhoValidos =
    !Number.isNaN(numMatrizDesempenhoLimiteMedio) &&
    !Number.isNaN(numMatrizDesempenhoLimiteAlto) &&
    numMatrizDesempenhoLimiteMedio >= 1 &&
    numMatrizDesempenhoLimiteAlto <= 5 &&
    numMatrizDesempenhoLimiteMedio < numMatrizDesempenhoLimiteAlto;
  const limiaresPotencialValidos =
    !Number.isNaN(numMatrizPotencialLimiteMedio) &&
    !Number.isNaN(numMatrizPotencialLimiteAlto) &&
    numMatrizPotencialLimiteMedio >= 1 &&
    numMatrizPotencialLimiteAlto <= 5 &&
    numMatrizPotencialLimiteMedio < numMatrizPotencialLimiteAlto;
  const tudoValido = somaValida && notaMinimaValida && limiaresDesempenhoValidos && limiaresPotencialValidos;

  async function handleSalvar() {
    if (!tudoValido) return;
    setSalvando(true);
    await atualizarConfigAvaliacaoDesempenho({
      pesoKpis: numKpis,
      pesoComportamental: numComportamental,
      notaMinimaPdi: numNotaMinimaPdi,
      matrizDesempenhoLimiteMedio: numMatrizDesempenhoLimiteMedio,
      matrizDesempenhoLimiteAlto: numMatrizDesempenhoLimiteAlto,
      matrizPotencialLimiteMedio: numMatrizPotencialLimiteMedio,
      matrizPotencialLimiteAlto: numMatrizPotencialLimiteAlto,
    });
    setSalvando(false);
  }

  return (
    <Card padded>
      <h3 className={styles.titulo}>Blocos da avaliação</h3>
      <p className={styles.explicacao}>
        Peso de cada bloco na nota final da Avaliação de Desempenho. A soma precisa ser 100%.
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
      <span className={somaValida ? styles.somaOk : styles.somaErro}>Soma: {Number.isNaN(soma) ? "—" : soma}%</span>

      <h3 className={styles.tituloSecao}>Plano de Desenvolvimento Individual (PDI)</h3>
      <p className={styles.explicacao}>
        Competências comportamentais e KPIs com nota abaixo deste valor viram itens automáticos no PDI, gerado na
        conclusão da avaliação do gestor.
      </p>
      <div className={styles.campos}>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="nota-minima-pdi">
            Nota mínima para o PDI
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="nota-minima-pdi"
              className={styles.input}
              value={notaMinimaPdi}
              onChange={(e) => setNotaMinimaPdi(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
          </div>
          {!notaMinimaValida && <span className={styles.somaErro}>Deve estar entre 1 e 5.</span>}
        </div>
      </div>

      <h3 className={styles.tituloSecao}>Matriz 9 Box</h3>
      <p className={styles.explicacao}>
        Limiares (escala 1-5) usados pra classificar Desempenho e Potencial em Baixo/Médio/Alto e posicionar cada
        colaborador na Matriz 9 Box. Abaixo do limiar médio é "Baixo", entre os dois é "Médio", igual ou acima do
        limiar alto é "Alto".
      </p>
      <div className={styles.campos}>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="matriz-desempenho-medio">
            Desempenho — limiar Médio
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="matriz-desempenho-medio"
              className={styles.input}
              value={matrizDesempenhoLimiteMedio}
              onChange={(e) => setMatrizDesempenhoLimiteMedio(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
          </div>
        </div>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="matriz-desempenho-alto">
            Desempenho — limiar Alto
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="matriz-desempenho-alto"
              className={styles.input}
              value={matrizDesempenhoLimiteAlto}
              onChange={(e) => setMatrizDesempenhoLimiteAlto(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
          </div>
        </div>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="matriz-potencial-medio">
            Potencial — limiar Médio
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="matriz-potencial-medio"
              className={styles.input}
              value={matrizPotencialLimiteMedio}
              onChange={(e) => setMatrizPotencialLimiteMedio(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
          </div>
        </div>
        <div className={styles.campo}>
          <label className={styles.label} htmlFor="matriz-potencial-alto">
            Potencial — limiar Alto
          </label>
          <div className={styles.inputComSufixo}>
            <input
              id="matriz-potencial-alto"
              className={styles.input}
              value={matrizPotencialLimiteAlto}
              onChange={(e) => setMatrizPotencialLimiteAlto(e.target.value)}
              disabled={!podeEditarGestaoDesempenho}
              inputMode="decimal"
            />
          </div>
        </div>
      </div>
      {(!limiaresDesempenhoValidos || !limiaresPotencialValidos) && (
        <span className={styles.somaErro}>Limiares devem estar entre 1 e 5, com o médio menor que o alto.</span>
      )}

      <div className={styles.rodape}>
        <span className={tudoValido ? styles.somaOk : styles.somaErro}>{tudoValido ? "Configuração válida" : "Corrija os valores destacados"}</span>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" onClick={handleSalvar} disabled={!tudoValido || salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>
    </Card>
  );
}
