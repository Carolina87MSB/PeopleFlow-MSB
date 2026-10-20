// Quadro "Custos de Rescisão por mês" do Dashboard Executivo (extraído do DashboardPage, mesmos dados e mesmas regras).
// Só o RH recebe valores (decisão do RH); os demais perfis veem apenas a quantidade de desligamentos.

import { BarChart, EmptyState, tableStyles } from "../../components/ui";
import type { CoberturaFinanceira, CustoMesFinanceiro } from "../../domain/custosRescisao";
import styles from "./DashboardPage.module.css";

export interface CustosRescisaoQuadroProps {
  /** Um item por mês efetivo de desligamento (valores já validados somados no servidor; sem valores para quem não é RH). */
  meses: CustoMesFinanceiro[];
  /** `true` só para o RH, quando o servidor devolveu os totais. */
  mostrarValores: boolean;
  /** Perfil autorizado a ver valores (RH). */
  veValoresFinanceiros: boolean;
  cobertura: CoberturaFinanceira | null;
  erro: string | null;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CustosRescisaoQuadro({ meses, mostrarValores, veValoresFinanceiros, cobertura, erro }: CustosRescisaoQuadroProps) {
  if (meses.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Custos de Rescisão por mês</h3>
        </div>
        <EmptyState message="Nenhum desligamento no período/recorte selecionado." />
      </div>
    );
  }
  return (
    <div className={`${styles.panel} ${mostrarValores ? styles.custoPanelLargo : ""}`}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Custos de Rescisão por mês</h3>
      </div>
      {/* O número acima de cada barra é a quantidade de desligamentos do mês (curto, para nunca invadir a barra vizinha); `*` = total parcial. */}
      <BarChart
        data={meses.map((m) => ({ label: m.mesLabel, value: mostrarValores ? m.total : m.quantidade, annotation: `${m.quantidade}${mostrarValores && m.parcial ? "*" : ""}` }))}
        color="var(--color-danger)"
      />
      <p className={styles.custoLegenda}>
        {mostrarValores ? "Altura da barra = Custo Total do mês (só valores validados). Número acima = desligamentos no mês; * = total parcial." : "Altura da barra e número acima = desligamentos no mês."}
      </p>
      <div className={`${tableStyles.wrap} ${styles.custoTableWrap}`}>
        <table className={`${tableStyles.table} ${styles.custoTabela}`}>
          <thead>
            <tr>
              <th>Mês</th>
              <th className={tableStyles.right}>Desligamentos</th>
              {mostrarValores && (
                <>
                  <th className={tableStyles.right}>Rescisão</th>
                  <th className={tableStyles.right}>GRRF</th>
                  <th className={tableStyles.right}>Custo Total</th>
                  <th className={tableStyles.right} title="Rescisões com o líquido validado pelo RH, em relação aos desligamentos do mês">Rescisão validada</th>
                  <th className={tableStyles.right} title="GRRF informada e confirmada (ou não aplicável), em relação aos desligamentos do mês">GRRF resolvida</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes}>
                <td className={styles.custoMes}>{m.mesLabel}</td>
                <td className={tableStyles.right}>{m.quantidade}</td>
                {mostrarValores && (
                  <>
                    <td className={tableStyles.right}>{money(m.rescisao)}</td>
                    <td className={tableStyles.right}>{money(m.grrf)}</td>
                    <td className={tableStyles.right}>
                      <strong>{money(m.total)}</strong>
                      <span className={styles.custoParcial} title={m.parcial ? "Total parcial: há valores ainda não validados pelo RH" : undefined}>{m.parcial ? "*" : ""}</span>
                    </td>
                    <td className={tableStyles.right}>{m.rescisaoValidadas}/{m.quantidade}</td>
                    <td className={tableStyles.right}>{m.grrfResolvidas}/{m.quantidade}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {mostrarValores && (
            <tfoot>
              <tr className={styles.custoTotalLinha}>
                <td>Total</td>
                <td className={tableStyles.right}>{meses.reduce((a, m) => a + m.quantidade, 0)}</td>
                <td className={tableStyles.right}>{money(meses.reduce((a, m) => a + m.rescisao, 0))}</td>
                <td className={tableStyles.right}>{money(meses.reduce((a, m) => a + m.grrf, 0))}</td>
                <td className={tableStyles.right}>
                  <strong>{money(meses.reduce((a, m) => a + m.total, 0))}</strong>
                  <span className={styles.custoParcial} title={cobertura && !cobertura.completa ? "Total parcial: o que falta validar não entra na soma" : undefined}>{cobertura && !cobertura.completa ? "*" : ""}</span>
                </td>
                <td className={tableStyles.right}>{meses.reduce((a, m) => a + m.rescisaoValidadas, 0)}/{meses.reduce((a, m) => a + m.quantidade, 0)}</td>
                <td className={tableStyles.right}>{meses.reduce((a, m) => a + m.grrfResolvidas, 0)}/{meses.reduce((a, m) => a + m.quantidade, 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {mostrarValores && cobertura && (
        <p className={`${styles.secaoContexto} ${styles.custoNota}`}>
          Só valores <strong>validados pelo RH</strong> são somados (Rescisão = líquido da folha; GRRF = total recolhido). Cobertura: rescisão validada em {cobertura.rescisaoValidadas} de{" "}
          {cobertura.saidas} desligamentos · GRRF resolvida em {cobertura.grrfResolvidas} de {cobertura.saidas}.
          {!cobertura.completa && " * Total parcial: o que falta validar não entra na soma."} Conversões de estágio para CLT não entram nos custos.
        </p>
      )}
      {mostrarValores === false && veValoresFinanceiros && erro && (
        <p className={`${styles.secaoContexto} ${styles.custoNota}`}>Valores financeiros indisponíveis no momento ({erro}). A contagem de desligamentos segue normal.</p>
      )}
      {!veValoresFinanceiros && (
        <p className={`${styles.secaoContexto} ${styles.custoNota}`}>Valores financeiros de rescisão são restritos ao RH; aqui aparece apenas a quantidade de desligamentos.</p>
      )}
    </div>
  );
}
