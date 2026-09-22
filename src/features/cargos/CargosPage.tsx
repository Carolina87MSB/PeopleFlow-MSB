import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { Badge, Button, EmptyState, FilterChips, Modal, tableStyles } from "../../components/ui";
import { agregarTodosOsCargos } from "../../domain/agregados";
import { nivelMeta, statusDescricaoCargoMeta } from "../../domain/colors";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { DescricaoCargoModal } from "./DescricaoCargoModal";
import { NovoCargoModal } from "./NovoCargoModal";
import styles from "./CargosPage.module.css";

const STATUS_SEM_DESCRICAO = "Sem descrição";
const ABAS = ["Ativos", "Obsoletos"] as const;
type Aba = (typeof ABAS)[number];

export function CargosPage() {
  const { state } = usePortalStore();
  const { conta, perfil, colaboradores, colaboradoresVisiveis, podeVerCargos, descricoesCargo, podeMarcarCargoObsoleto, marcarCargoObsoleto, reativarCargo } =
    usePortalData();
  const [cargoAberto, setCargoAberto] = useState<string | null>(null);
  const [novoCargoAberto, setNovoCargoAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("Ativos");
  const [filtroCargo, setFiltroCargo] = useState("Todos");
  const [filtroNivel, setFiltroNivel] = useState("Todos");
  const [filtroDepto, setFiltroDepto] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [confirmando, setConfirmando] = useState<{ cargoNome: string; acao: "marcar" | "reativar" } | null>(null);
  const [processando, setProcessando] = useState(false);

  /** Gestor só vê os próprios cargos-novos-pendentes (CargoCustom.gestor),
   * senão veria pedidos de "Novo Cargo" de departamentos inteiros que não
   * lidera — colaboradoresVisiveis já resolve esse escopo para os cargos já
   * ocupados (ver agregarTodosOsCargos), mas cargosCustom (0 ocupantes)
   * precisa de filtro próprio. */
  const cargosCustomVisiveis = useMemo(
    () => (perfil === "Gestor" ? state.cargosCustom.filter((c) => c.gestor === conta.nome) : state.cargosCustom),
    [perfil, conta.nome, state.cargosCustom],
  );

  const descricaoPorCargo = useMemo(() => new Map(descricoesCargo.map((d) => [d.cargoNome, d])), [descricoesCargo]);

  // Todo cargo com Descrição de Cargo continua na lista mesmo sem ocupante
  // ativo (ex.: vaga aberta por desligamento) — "0" em Ocupantes já avisa
  // que está vago; só some da tela quando o RH marca como Obsoleto.
  const cargos = useMemo(
    () =>
      agregarTodosOsCargos(
        colaboradoresVisiveis,
        colaboradores,
        cargosCustomVisiveis,
        descricoesCargo.map((d) => d.cargoNome),
      ).sort((a, b) => formatarNomeCargo(a.nome).localeCompare(formatarNomeCargo(b.nome), "pt-BR")),
    [colaboradoresVisiveis, colaboradores, cargosCustomVisiveis, descricoesCargo],
  );

  const cargosAtivos = useMemo(() => cargos.filter((c) => !descricaoPorCargo.get(c.nome)?.obsoleto), [cargos, descricaoPorCargo]);
  const cargosObsoletos = useMemo(() => cargos.filter((c) => descricaoPorCargo.get(c.nome)?.obsoleto), [cargos, descricaoPorCargo]);
  const cargosDaAba = aba === "Ativos" ? cargosAtivos : cargosObsoletos;

  const opcoesCargo = useMemo(() => ["Todos", ...cargosDaAba.map((c) => c.nome)], [cargosDaAba]);
  const opcoesNivel = useMemo(() => ["Todos", ...[...new Set(cargosDaAba.map((c) => c.nivel))].sort()], [cargosDaAba]);
  const opcoesDepto = useMemo(() => ["Todos", ...[...new Set(cargosDaAba.flatMap((c) => [...c.deptos]))].sort()], [cargosDaAba]);
  const opcoesStatus = [STATUS_SEM_DESCRICAO, "Em revisão", "Aprovada", "Rejeitada"] as const;

  const cargosFiltrados = useMemo(
    () =>
      cargosDaAba.filter((c) => {
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
    [cargosDaAba, filtroCargo, filtroNivel, filtroDepto, filtroStatus, descricaoPorCargo],
  );

  function trocarAba(novaAba: Aba) {
    setAba(novaAba);
    setFiltroCargo("Todos");
    setFiltroNivel("Todos");
    setFiltroDepto("Todos");
    setFiltroStatus("Todos");
  }

  async function confirmarAcao() {
    if (!confirmando) return;
    setProcessando(true);
    const result =
      confirmando.acao === "marcar" ? await marcarCargoObsoleto(confirmando.cargoNome) : await reativarCargo(confirmando.cargoNome);
    setProcessando(false);
    if (result.ok) setConfirmando(null);
  }

  if (!podeVerCargos) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header
        actions={
          perfil === "RH" ? (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setNovoCargoAberto(true)}>
              Novo Cargo
            </Button>
          ) : undefined
        }
      />

      <div className={styles.abas}>
        <FilterChips
          options={ABAS.map((a) => (a === "Ativos" ? `Cargos ativos · ${cargosAtivos.length}` : `Cargos obsoletos · ${cargosObsoletos.length}`))}
          value={aba === "Ativos" ? `Cargos ativos · ${cargosAtivos.length}` : `Cargos obsoletos · ${cargosObsoletos.length}`}
          onChange={(v) => trocarAba(v.startsWith("Cargos ativos") ? "Ativos" : "Obsoletos")}
        />
      </div>

      {aba === "Ativos" && (
        <p className={styles.notaAba}>
          Cargos aparecem aqui mesmo sem ocupante ativo (ex.: vaga em processo de substituição) — "0" em Ocupantes já avisa que está
          vago. Um cargo só sai de circulação (some do seletor de "Cargo solicitado" de novas Admissões) quando o RH o marca como
          obsoleto.
        </p>
      )}

      <div className={tableStyles.wrap}>
        <table className={[tableStyles.table, styles.tabela].join(" ")}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "9%" }} />
            {podeMarcarCargoObsoleto && <col style={{ width: "12%" }} />}
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
                  <span>Categoria</span>
                  <select className={styles.thSelect} value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)}>
                    {opcoesNivel.map((o) => (
                      <option key={o} value={o}>
                        {o === "Todos" ? "Todas as categorias" : o}
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
              {podeMarcarCargoObsoleto && <th></th>}
            </tr>
          </thead>
          <tbody>
            {cargosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={podeMarcarCargoObsoleto ? 6 : 5}>
                  <EmptyState message="Nenhum cargo encontrado para os filtros selecionados." />
                </td>
              </tr>
            ) : (
            cargosFiltrados.map((c) => {
              const nivel = nivelMeta(c.nivel);
              const descricao = descricaoPorCargo.get(c.nome);
              const vago = c.count === 0;
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
                  <td>{[...c.deptos].join(", ") || "—"}</td>
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
                    ) : (
                      // Chegou aqui = já passou pelo guard de podeVerCargos no topo do componente.
                      // Vale tanto pra cargo já ocupado quanto pra cargo novo (c.novo) — os dois
                      // usam a mesma ficha real (POP-RH-001), nunca o toggle OK/Pendente antigo.
                      <button type="button" className={styles.descricaoLink} onClick={() => setCargoAberto(c.nome)}>
                        + Adicionar descrição
                      </button>
                    )}
                  </td>
                  <td className={tableStyles.right}>
                    <span className={styles.ocupantes}>{c.count}</span>
                    {vago && <div className={styles.vagoLabel}>vago</div>}
                  </td>
                  {podeMarcarCargoObsoleto && (
                    <td className={tableStyles.right}>
                      {aba === "Ativos" ? (
                        <button
                          type="button"
                          className={styles.acaoObsoleto}
                          disabled={!vago}
                          title={vago ? undefined : "Só é possível marcar como obsoleto um cargo sem ocupante ativo."}
                          onClick={() => setConfirmando({ cargoNome: c.nome, acao: "marcar" })}
                        >
                          Marcar obsoleto
                        </button>
                      ) : (
                        <Button variant="secondary" onClick={() => setConfirmando({ cargoNome: c.nome, acao: "reativar" })}>
                          Reativar
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>

      {cargoAberto ? <DescricaoCargoModal cargoNome={cargoAberto} onClose={() => setCargoAberto(null)} /> : null}
      {novoCargoAberto ? <NovoCargoModal onClose={() => setNovoCargoAberto(false)} /> : null}
      {confirmando && (
        <Modal
          title={confirmando.acao === "marcar" ? "Marcar cargo como obsoleto?" : "Reativar este cargo?"}
          onClose={() => setConfirmando(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmando(null)} disabled={processando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarAcao} disabled={processando}>
                {processando ? "Salvando..." : "Confirmar"}
              </Button>
            </>
          }
        >
          {confirmando.acao === "marcar" ? (
            <p>
              <b>{formatarNomeCargo(confirmando.cargoNome)}</b> deixa de aparecer no seletor de "Cargo solicitado" de novas Admissões.
              A Descrição de Cargo e o histórico de quem já ocupou continuam preservados — dá pra reativar a qualquer momento na aba
              Obsoletos.
            </p>
          ) : (
            <p>
              <b>{formatarNomeCargo(confirmando.cargoNome)}</b> volta a aparecer em Cargos ativos e no seletor de "Cargo solicitado"
              de novas Admissões.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
