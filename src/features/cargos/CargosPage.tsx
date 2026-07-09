import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { Badge, tableStyles } from "../../components/ui";
import { agregarCargos } from "../../domain/agregados";
import { nivelMeta } from "../../domain/colors";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import styles from "./CargosPage.module.css";

export function CargosPage() {
  const { state } = usePortalStore();
  const { colaboradoresVisiveis, podeVerCadastros, toggleDescricaoCargo } = usePortalData();

  const cargos = useMemo(
    () => agregarCargos(colaboradoresVisiveis, state.cargosCustom),
    [colaboradoresVisiveis, state.cargosCustom],
  );

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={tableStyles.wrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Cargo</th>
              <th>Nível</th>
              <th>Departamentos</th>
              <th>Descrição de cargo</th>
              <th className={tableStyles.right}>Ocupantes</th>
            </tr>
          </thead>
          <tbody>
            {cargos.map((c) => {
              const nivel = nivelMeta(c.nivel);
              return (
                <tr key={c.nome}>
                  <td>
                    <div className={styles.cargoCell}>
                      <span>{c.nome}</span>
                      {c.novo && (
                        <Badge bg="#d6f4f7" fg="#1f4e5e">
                          NOVO · {c.vagas} vaga(s)
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td>
                    <Badge bg={nivel.bg} fg={nivel.fg}>
                      {c.nivel}
                    </Badge>
                  </td>
                  <td>{[...c.deptos].join(", ")}</td>
                  <td>
                    {c.novo ? (
                      <button
                        type="button"
                        className={styles.descricaoToggle}
                        onClick={() => toggleDescricaoCargo(c.nome)}
                      >
                        <Badge
                          bg={c.descricao === "OK" ? "var(--color-success-bg)" : "var(--color-warning-bg)"}
                          fg={c.descricao === "OK" ? "var(--color-success-fg)" : "var(--color-warning-fg)"}
                        >
                          {c.descricao === "OK" ? "OK" : "Pendente"}
                        </Badge>
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={tableStyles.right}>
                    <span className={styles.ocupantes}>{c.count}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
