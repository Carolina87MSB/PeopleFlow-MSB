import { EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";

/** Etapa 1: só a estrutura de dados existe (peopleflow_avaliacoes_desempenho)
 * — o fluxo de criar/preencher uma avaliação (juntando as Competências
 * Comportamentais corporativas com os KPIs do cargo do colaborador) chega
 * numa próxima etapa, junto com o cálculo de nota e o fluxo de aprovação. */
export function AvaliacoesTab() {
  const { avaliacoesDesempenho } = usePortalData();

  if (avaliacoesDesempenho.length === 0) {
    return <EmptyState message="Nenhuma avaliação registrada ainda — o fluxo de criação de avaliações chega numa próxima etapa." />;
  }

  return (
    <div className={tableStyles.wrap}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Ciclo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {avaliacoesDesempenho.map((a) => (
            <tr key={a.id}>
              <td>{a.colaboradorNome}</td>
              <td>{a.ciclo}</td>
              <td>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
