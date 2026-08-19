import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { Badge, tableStyles } from "../../components/ui";
import { agregarCargos } from "../../domain/agregados";
import { nivelMeta } from "../../domain/colors";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { DescricaoCargoDrawer } from "./DescricaoCargoDrawer";
import styles from "./CargosPage.module.css";

export function CargosPage() {
  const { state } = usePortalStore();
  const { conta, perfil, colaboradoresVisiveis, podeVerCargos, toggleDescricaoCargo, descricoesCargo } = usePortalData();
  const [cargoAberto, setCargoAberto] = useState<string | null>(null);

  /** Gestor só vê os próprios cargos-novos-pendentes (CargoCustom.gestor),
   * senão veria pedidos de "Novo Cargo" de departamentos inteiros que não
   * lidera — colaboradoresVisiveis já resolve esse escopo para os cargos já
   * ocupados (ver agregarCargos), mas cargosCustom (0 ocupantes) precisa de
   * filtro próprio. */
  const cargosCustomVisiveis = useMemo(
    () => (perfil === "Gestor" ? state.cargosCustom.filter((c) => c.gestor === conta.nome) : state.cargosCustom),
    [perfil, conta.nome, state.cargosCustom],
  );

  const cargos = useMemo(
    () =>
      agregarCargos(colaboradoresVisiveis, cargosCustomVisiveis).sort((a, b) =>
        formatarNomeCargo(a.nome).localeCompare(formatarNomeCargo(b.nome), "pt-BR"),
      ),
    [colaboradoresVisiveis, cargosCustomVisiveis],
  );

  if (!podeVerCargos) return <Navigate to="/dashboard" replace />;

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
                      <span>{formatarNomeCargo(c.nome)}</span>
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
                    {descricoesCargo.some((d) => d.cargoNome === c.nome) ? (
                      <button type="button" className={styles.descricaoLink} onClick={() => setCargoAberto(c.nome)}>
                        <FileText size={13} /> Ver descrição
                      </button>
                    ) : c.novo ? (
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
                      // Chegou aqui = já passou pelo guard de podeVerCargos no topo do componente.
                      <button type="button" className={styles.descricaoLink} onClick={() => setCargoAberto(c.nome)}>
                        + Adicionar descrição
                      </button>
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

      {cargoAberto ? <DescricaoCargoDrawer cargoNome={cargoAberto} onClose={() => setCargoAberto(null)} /> : null}
    </>
  );
}
