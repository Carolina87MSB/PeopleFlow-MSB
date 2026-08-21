import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { agregarCargos } from "../../domain/agregados";
import { nivelMeta, statusDescricaoCargoMeta } from "../../domain/colors";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { DescricaoCargoDrawer } from "./DescricaoCargoDrawer";
import styles from "./CargosPage.module.css";

const STATUS_SEM_DESCRICAO = "Sem descrição";

export function CargosPage() {
  const { state } = usePortalStore();
  const { conta, perfil, colaboradoresVisiveis, podeVerCargos, toggleDescricaoCargo, descricoesCargo } = usePortalData();
  const [cargoAberto, setCargoAberto] = useState<string | null>(null);
  const [filtroCargo, setFiltroCargo] = useState("Todos");
  const [filtroNivel, setFiltroNivel] = useState("Todos");
  const [filtroDepto, setFiltroDepto] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

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

  const descricaoPorCargo = useMemo(() => new Map(descricoesCargo.map((d) => [d.cargoNome, d])), [descricoesCargo]);

  const opcoesCargo = useMemo(() => ["Todos", ...cargos.map((c) => c.nome)], [cargos]);
  const opcoesNivel = useMemo(() => ["Todos", ...[...new Set(cargos.map((c) => c.nivel))].sort()], [cargos]);
  const opcoesDepto = useMemo(() => ["Todos", ...[...new Set(cargos.flatMap((c) => [...c.deptos]))].sort()], [cargos]);
  const opcoesStatus = [STATUS_SEM_DESCRICAO, "Em revisão", "Aprovada", "Rejeitada"] as const;

  const cargosFiltrados = useMemo(
    () =>
      cargos.filter((c) => {
        // Cargo sem `descricao` nenhuma (nunca preenchida, ou só o toggle
        // OK/Pendente de cargo novo) conta como "Sem descrição", já que
        // nenhum dos dois é de fato o formulário POP-RH-001.
        const status = descricaoPorCargo.get(c.nome)?.status ?? STATUS_SEM_DESCRICAO;
        return (
          (filtroCargo === "Todos" || c.nome === filtroCargo) &&
          (filtroNivel === "Todos" || c.nivel === filtroNivel) &&
          (filtroDepto === "Todos" || c.deptos.has(filtroDepto)) &&
          (filtroStatus === "Todos" || status === filtroStatus)
        );
      }),
    [cargos, filtroCargo, filtroNivel, filtroDepto, filtroStatus, descricaoPorCargo],
  );

  if (!podeVerCargos) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={tableStyles.wrap}>
        <table className={tableStyles.table}>
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <div className={styles.thFiltro}>
                  <span>Cargo</span>
                  <select className={styles.thSelect} value={filtroCargo} onChange={(e) => setFiltroCargo(e.target.value)}>
                    {opcoesCargo.map((o) => (
                      <option key={o} value={o}>
                        {o === "Todos" ? "Todos os cargos" : formatarNomeCargo(o)}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th>
                <div className={styles.thFiltro}>
                  <span>Nível</span>
                  <select className={styles.thSelect} value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)}>
                    {opcoesNivel.map((o) => (
                      <option key={o} value={o}>
                        {o === "Todos" ? "Todos os níveis" : o}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th>
                <div className={styles.thFiltro}>
                  <span>Departamentos</span>
                  <select className={styles.thSelect} value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}>
                    {opcoesDepto.map((o) => (
                      <option key={o} value={o}>
                        {o === "Todos" ? "Todos os departamentos" : o}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th>
                <div className={styles.thFiltro}>
                  <span>Descrição de cargo</span>
                  <select className={styles.thSelect} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                    <option value="Todos">Todos os status</option>
                    {opcoesStatus.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </th>
              <th className={tableStyles.right}>Ocupantes</th>
            </tr>
          </thead>
          <tbody>
            {cargosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState message="Nenhum cargo encontrado para os filtros selecionados." />
                </td>
              </tr>
            ) : (
            cargosFiltrados.map((c) => {
              const nivel = nivelMeta(c.nivel);
              const descricao = descricaoPorCargo.get(c.nome);
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
                    {descricao ? (
                      <div className={styles.descricaoCell}>
                        <button type="button" className={styles.descricaoLink} onClick={() => setCargoAberto(c.nome)}>
                          <FileText size={13} /> Ver descrição
                        </button>
                        <Badge bg={statusDescricaoCargoMeta(descricao.status).bg} fg={statusDescricaoCargoMeta(descricao.status).fg}>
                          {descricao.status}
                        </Badge>
                      </div>
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
            })
            )}
          </tbody>
        </table>
      </div>

      {cargoAberto ? <DescricaoCargoDrawer cargoNome={cargoAberto} onClose={() => setCargoAberto(null)} /> : null}
    </>
  );
}
