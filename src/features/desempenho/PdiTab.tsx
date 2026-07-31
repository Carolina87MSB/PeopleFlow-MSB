import { EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";

/** Etapa 1: só a estrutura de dados existe (peopleflow_pdi) — a geração
 * automática de ações a partir de competências com baixo desempenho chega
 * numa próxima etapa, depois que o cálculo de nota da Avaliação existir. */
export function PdiTab() {
  const { pdi } = usePortalData();

  if (pdi.length === 0) {
    return <EmptyState message="Nenhuma ação de PDI registrada ainda — a geração automática a partir de avaliações chega numa próxima etapa." />;
  }

  return (
    <div className={tableStyles.wrap}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Ação</th>
            <th>Prazo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pdi.map((p) => (
            <tr key={p.id}>
              <td>{p.colaboradorNome}</td>
              <td>{p.acao}</td>
              <td>{p.prazo ?? "—"}</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
