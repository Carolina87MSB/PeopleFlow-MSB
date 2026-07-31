import { useMemo, useState } from "react";
import { agregarCargos } from "../../domain/agregados";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { EmptyState, tableStyles } from "../../components/ui";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { KpiCargoDrawer } from "./KpiCargoDrawer";
import styles from "./CompetenciasTecnicasTab.module.css";

/** Um cargo por linha, com a contagem de KPIs já cadastrados — clicar abre o
 * Drawer com os KPIs (Competências Técnicas) daquele cargo especificamente.
 * Nunca reaproveita as competências da Descrição de Cargo, e nunca
 * competências técnicas genéricas — só o que foi definido pra cada cargo. */
export function CompetenciasTecnicasTab() {
  const { state } = usePortalStore();
  const { colaboradoresVisiveis, kpisCargo } = usePortalData();
  const [cargoAberto, setCargoAberto] = useState<string | null>(null);

  const cargos = useMemo(
    () =>
      agregarCargos(colaboradoresVisiveis, state.cargosCustom).sort((a, b) =>
        formatarNomeCargo(a.nome).localeCompare(formatarNomeCargo(b.nome), "pt-BR"),
      ),
    [colaboradoresVisiveis, state.cargosCustom],
  );

  const kpisPorCargo = useMemo(() => {
    const map = new Map<string, number>();
    kpisCargo.forEach((k) => map.set(k.cargoNome, (map.get(k.cargoNome) ?? 0) + 1));
    return map;
  }, [kpisCargo]);

  return (
    <>
      <p className={styles.explicacao}>KPIs vinculados exatamente ao cargo — cada cargo só tem os indicadores definidos para ele.</p>

      {cargos.length === 0 ? (
        <EmptyState message="Nenhum cargo cadastrado ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Cargo</th>
                <th className={tableStyles.right}>KPIs cadastrados</th>
              </tr>
            </thead>
            <tbody>
              {cargos.map((c) => (
                <tr key={c.nome} className={tableStyles.clickable} onClick={() => setCargoAberto(c.nome)}>
                  <td>{formatarNomeCargo(c.nome)}</td>
                  <td className={tableStyles.right}>{kpisPorCargo.get(c.nome) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cargoAberto && <KpiCargoDrawer cargoNome={cargoAberto} onClose={() => setCargoAberto(null)} />}
    </>
  );
}
