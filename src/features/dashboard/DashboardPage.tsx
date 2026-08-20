import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Pencil, Plus, Search, X } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { NovaMovimentacaoModal } from "../../components/shared/NovaMovimentacaoModal";
import { ReprovarModal } from "../../components/shared/ReprovarModal";
import { Avatar, BarChart, Badge, Button, Card, EmptyState, KpiCard, ProgressBar, tableStyles } from "../../components/ui";
import { agregarCargos, agregarDepartamentos, contarPorGestor } from "../../domain/agregados";
import { tipoColor } from "../../domain/colors";
import { hojeIso } from "../../domain/dates";
import {
  admissoesDesligamentosPorMes,
  calcularTurnover,
  colaboradoresAtivosEmData,
  desligamentosNoPeriodo,
  filtrarPorAtributos,
  headcountEmData,
  performanceMediaMSB,
  tempoMedioDeEmpresa,
  turnoverPorSetor,
  type FiltrosAtributosDashboard,
} from "../../domain/dashboardExecutivo";
import { custosRescisaoPorMes, pendenteFechamento } from "../../domain/desligados";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { pendenciasAvaliacaoExperiencia as pendenciasAvaliacaoExperienciaDomain } from "../../domain/avaliacaoExperiencia";
import { podeAgir } from "../../domain/workflow";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { AdmissoesDesligamentosChart } from "./AdmissoesDesligamentosChart";
import styles from "./DashboardPage.module.css";

function mesesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return hojeIso(d);
}

export function DashboardPage() {
  const { state } = usePortalStore();
  const {
    conta,
    perfil,
    colaboradoresVisiveis,
    colaboradoresParaDashboardExecutivo,
    movimentacoesVisiveis,
    mostrarEquipes,
    podeCriar,
    descricoesCargo,
    desligamentosFinanceiros,
    configDashboard,
    atualizarConfigDashboard,
    aprovarEtapa,
    reprovarEtapa,
    avaliacoesDesempenho,
    ciclosAvaliacaoDesempenho,
  } = usePortalData();
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [reprovandoId, setReprovandoId] = useState<string | null>(null);

  const [setorFiltro, setSetorFiltro] = useState("Todos");
  const [gestorFiltro, setGestorFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [periodoInicio, setPeriodoInicio] = useState(() => mesesAtras(12));
  const [periodoFim, setPeriodoFim] = useState(() => hojeIso());

  const [editandoHeadcountPlanejado, setEditandoHeadcountPlanejado] = useState(false);
  const [headcountPlanejadoInput, setHeadcountPlanejadoInput] = useState("");
  const [salvandoHeadcountPlanejado, setSalvandoHeadcountPlanejado] = useState(false);

  const opcoesSetor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaDashboardExecutivo.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresParaDashboardExecutivo],
  );
  const opcoesGestor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaDashboardExecutivo.map((c) => c.gestor).filter(Boolean))).sort()],
    [colaboradoresParaDashboardExecutivo],
  );
  const opcoesCargo = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaDashboardExecutivo.map((c) => c.cargo).filter(Boolean))).sort()],
    [colaboradoresParaDashboardExecutivo],
  );

  const filtrosAtributos: FiltrosAtributosDashboard = useMemo(
    () => ({ setor: setorFiltro, gestor: gestorFiltro, cargo: cargoFiltro }),
    [setorFiltro, gestorFiltro, cargoFiltro],
  );

  // Bloco 2 (alertas) ignora Período — sempre mostra a pendência real de
  // agora, só respeitando Setor/Gestor/Cargo (decisão confirmada com o usuário).
  const colaboradoresVisiveisFiltrados = useMemo(
    () => filtrarPorAtributos(colaboradoresVisiveis, filtrosAtributos),
    [colaboradoresVisiveis, filtrosAtributos],
  );
  // Bloco 1/3/4 — precisa também dos desligados do escopo, pra reconstruir
  // headcount/turnover em qualquer data (ver domain/dashboardExecutivo.ts).
  const colaboradoresExecutivoFiltrados = useMemo(
    () => filtrarPorAtributos(colaboradoresParaDashboardExecutivo, filtrosAtributos),
    [colaboradoresParaDashboardExecutivo, filtrosAtributos],
  );

  // Headcount Planejado/Aderência são a única exceção à regra "tudo responde
  // aos filtros" — sempre empresa toda, nunca recortados por Setor/Gestor/Cargo.
  const headcountRealEmpresaToda = useMemo(
    () => headcountEmData(colaboradoresParaDashboardExecutivo, periodoFim),
    [colaboradoresParaDashboardExecutivo, periodoFim],
  );
  const aderencia = useMemo(() => {
    const planejado = configDashboard?.headcountPlanejado;
    if (!planejado) return null;
    return (headcountRealEmpresaToda / planejado) * 100;
  }, [configDashboard, headcountRealEmpresaToda]);

  const headcountReal = useMemo(
    () => headcountEmData(colaboradoresExecutivoFiltrados, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoFim],
  );
  const resultadoTurnover = useMemo(
    () => calcularTurnover(colaboradoresExecutivoFiltrados, periodoInicio, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoInicio, periodoFim],
  );
  const colaboradoresAtivosNoFimDoPeriodo = useMemo(
    () => colaboradoresAtivosEmData(colaboradoresExecutivoFiltrados, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoFim],
  );
  const tempoMedio = useMemo(
    () => tempoMedioDeEmpresa(colaboradoresAtivosNoFimDoPeriodo, periodoFim),
    [colaboradoresAtivosNoFimDoPeriodo, periodoFim],
  );
  // Sempre empresa toda (ver comentário em performanceMediaMSB) — não usa
  // colaboradoresExecutivoFiltrados nem o Período selecionado, só o ciclo
  // de AVD vigente.
  const performanceMedia = useMemo(
    () => performanceMediaMSB(avaliacoesDesempenho, ciclosAvaliacaoDesempenho),
    [avaliacoesDesempenho, ciclosAvaliacaoDesempenho],
  );

  const departamentos = useMemo(() => agregarDepartamentos(colaboradoresAtivosNoFimDoPeriodo), [colaboradoresAtivosNoFimDoPeriodo]);
  const cargos = useMemo(
    () => agregarCargos(colaboradoresAtivosNoFimDoPeriodo, state.cargosCustom),
    [colaboradoresAtivosNoFimDoPeriodo, state.cargosCustom],
  );
  const maxDepto = Math.max(1, ...departamentos.map((d) => d.count));
  const gestores = useMemo(
    () => [...contarPorGestor(colaboradoresAtivosNoFimDoPeriodo).entries()].sort((a, b) => b[1] - a[1]),
    [colaboradoresAtivosNoFimDoPeriodo],
  );
  const maxGestor = Math.max(1, ...gestores.map(([, count]) => count));
  const turnoverSetor = useMemo(
    () => turnoverPorSetor(colaboradoresExecutivoFiltrados, periodoInicio, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoInicio, periodoFim],
  );
  const admissoesDesligamentosMensal = useMemo(
    () => admissoesDesligamentosPorMes(colaboradoresExecutivoFiltrados, periodoInicio, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoInicio, periodoFim],
  );

  const desligadosNoPeriodoFiltrado = useMemo(
    () => desligamentosNoPeriodo(colaboradoresExecutivoFiltrados, periodoInicio, periodoFim),
    [colaboradoresExecutivoFiltrados, periodoInicio, periodoFim],
  );
  const custosRescisao = useMemo(
    () => custosRescisaoPorMes(desligadosNoPeriodoFiltrado, desligamentosFinanceiros),
    [desligadosNoPeriodoFiltrado, desligamentosFinanceiros],
  );
  const custoRescisaoTotal = custosRescisao.reduce((acc, m) => acc + m.total, 0);
  const qtdDesligamentosTotal = custosRescisao.reduce((acc, m) => acc + m.quantidade, 0);

  // Bloco 2 — Alertas Operacionais, nenhum reaproveitando os getters globais/
  // sub-escopados de usePortalData como estão (ver plano — Diretoria/Gestor
  // ficariam mal-escopados ou sem visibilidade nenhuma).
  const avaliacoesExperienciaPendentes = useMemo(
    () => pendenciasAvaliacaoExperienciaDomain(colaboradoresVisiveisFiltrados, state.avaliacoesExperiencia, state.dispensasAvaliacaoExperiencia),
    [colaboradoresVisiveisFiltrados, state.avaliacoesExperiencia, state.dispensasAvaliacaoExperiencia],
  );
  const cargosSemDescricaoAlerta = useMemo(
    () => agregarCargos(colaboradoresVisiveisFiltrados, state.cargosCustom).filter((c) => !descricoesCargo.some((d) => d.cargoNome === c.nome)),
    [colaboradoresVisiveisFiltrados, state.cargosCustom, descricoesCargo],
  );
  const desligamentosPendentesAlerta = useMemo(
    () => colaboradoresExecutivoFiltrados.filter((c) => c.desligado && pendenteFechamento(c.nome, desligamentosFinanceiros)).length,
    [colaboradoresExecutivoFiltrados, desligamentosFinanceiros],
  );
  const pendenciasAprovacaoAlerta = useMemo(() => {
    const nomes = new Set(colaboradoresVisiveisFiltrados.map((c) => c.nome));
    return state.movimentacoes.filter((m) => m.status === "Em Aprovação" && nomes.has(m.colaborador)).length;
  }, [state.movimentacoes, colaboradoresVisiveisFiltrados]);

  const pendentes = movimentacoesVisiveis.filter((m) => m.status === "Em Aprovação");
  const movimentacaoReprovando = useMemo(
    () => (reprovandoId ? movimentacoesVisiveis.find((m) => m.id === reprovandoId) ?? null : null),
    [reprovandoId, movimentacoesVisiveis],
  );

  function handleReprovar(justificativa: string) {
    if (!reprovandoId) return;
    reprovarEtapa(reprovandoId, justificativa);
    setReprovandoId(null);
  }
  const aprovadasMes = movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído").length;
  const reprovadasMes = movimentacoesVisiveis.filter((m) => m.status === "Reprovado").length;
  const meusPendCount = pendentes.filter((m) => podeAgir(m, conta.nome)).length;

  function iniciarEdicaoHeadcountPlanejado() {
    setHeadcountPlanejadoInput(String(configDashboard?.headcountPlanejado ?? ""));
    setEditandoHeadcountPlanejado(true);
  }

  async function handleSalvarHeadcountPlanejado() {
    const valor = Number(headcountPlanejadoInput.replace(",", "."));
    if (Number.isNaN(valor)) return;
    setSalvandoHeadcountPlanejado(true);
    const result = await atualizarConfigDashboard(valor);
    setSalvandoHeadcountPlanejado(false);
    if (result.ok) setEditandoHeadcountPlanejado(false);
  }

  return (
    <>
      <Header
        actions={
          <>
            <div className={styles.search}>
              <Search size={15} strokeWidth={1.8} />
              <input placeholder="Buscar colaborador, cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {podeCriar && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModalAberto(true)}>
                Nova movimentação
              </Button>
            )}
          </>
        }
      />

      <div className={styles.filtros}>
        <div className={styles.periodoCampo}>
          <label className={styles.periodoLabel}>Período</label>
          <div className={styles.periodoInputs}>
            <input type="date" className={styles.periodoInput} value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
            <span>até</span>
            <input type="date" className={styles.periodoInput} value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
          </div>
        </div>
        <select className={styles.select} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
          {opcoesSetor.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os setores" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={gestorFiltro} onChange={(e) => setGestorFiltro(e.target.value)}>
          {opcoesGestor.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os gestores" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={cargoFiltro} onChange={(e) => setCargoFiltro(e.target.value)}>
          {opcoesCargo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os cargos" : formatarNomeCargo(o)}
            </option>
          ))}
        </select>
      </div>

      <h2 className={styles.secaoTitulo}>Indicadores Estratégicos</h2>
      <div className={styles.kpis}>
        {(perfil === "RH" || perfil === "Diretoria") && (
          <KpiCard
            label="Headcount Planejado"
            value={
              editandoHeadcountPlanejado ? (
                <input
                  type="number"
                  min={0}
                  className={styles.headcountInput}
                  value={headcountPlanejadoInput}
                  onChange={(e) => setHeadcountPlanejadoInput(e.target.value)}
                  autoFocus
                />
              ) : (
                configDashboard?.headcountPlanejado ?? "—"
              )
            }
            action={
              perfil === "RH" ? (
                editandoHeadcountPlanejado ? (
                  <div className={styles.headcountAcoes}>
                    <button type="button" className={styles.headcountBotao} onClick={handleSalvarHeadcountPlanejado} disabled={salvandoHeadcountPlanejado}>
                      <Check size={13} />
                    </button>
                    <button type="button" className={styles.headcountBotao} onClick={() => setEditandoHeadcountPlanejado(false)}>
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className={styles.headcountBotao} onClick={iniciarEdicaoHeadcountPlanejado}>
                    <Pencil size={13} />
                  </button>
                )
              ) : undefined
            }
          />
        )}
        <KpiCard label="Headcount Real" value={headcountReal} />
        {(perfil === "RH" || perfil === "Diretoria") && (
          <KpiCard label="Aderência ao Planejamento" value={aderencia !== null ? `${Math.round(aderencia)}%` : "—"} />
        )}
        <KpiCard label="Turnover" value={resultadoTurnover.turnover !== null ? `${Math.round(resultadoTurnover.turnover)}%` : "—"} hint="no período selecionado" />
        <KpiCard label="Admissões" value={resultadoTurnover.admissoes} hint="no período selecionado" />
        <KpiCard label="Desligamentos" value={resultadoTurnover.desligamentos} hint="no período selecionado" />
        <KpiCard label="Tempo Médio de Empresa" value={tempoMedio ? `${tempoMedio.anos}a ${tempoMedio.meses}m` : "—"} />
        <KpiCard
          label="Performance Média da MSB"
          value={performanceMedia.media !== null ? `${performanceMedia.media.toFixed(1).replace(".", ",")} / 5,0` : "—"}
          hint={
            performanceMedia.ciclo
              ? `${performanceMedia.quantidadeAvaliados} avaliados · ${performanceMedia.ciclo.nome}`
              : "Nenhum ciclo de avaliação em aberto"
          }
        />
      </div>

      <h2 className={styles.secaoTitulo}>Alertas Operacionais</h2>
      <div className={styles.kpis}>
        <KpiCard
          label="Pendências de Aprovação"
          value={pendenciasAprovacaoAlerta}
          hint={meusPendCount > 0 ? `${meusPendCount} aguardando você` : undefined}
          highlight={pendenciasAprovacaoAlerta > 0}
        />
        <KpiCard
          label="Avaliações de Experiência Pendentes"
          value={avaliacoesExperienciaPendentes.length}
          highlight={avaliacoesExperienciaPendentes.length > 0}
        />
        <Link to="/desligados" className={styles.kpiLink}>
          <KpiCard label="Desligamentos Pendentes" value={desligamentosPendentesAlerta} highlight={desligamentosPendentesAlerta > 0} />
        </Link>
        <Link to="/cargos" className={styles.kpiLink}>
          <KpiCard label="Cargos sem Descrição" value={cargosSemDescricaoAlerta.length} highlight={cargosSemDescricaoAlerta.length > 0} />
        </Link>
      </div>

      <div className={styles.mainGrid}>
        <Card>
          <div className={styles.pendHeader}>
            <h3 className={styles.cardTitle}>Aprovações pendentes</h3>
            <Link to="/workflow" className={styles.verTodas}>
              Ver todas ›
            </Link>
          </div>
          <p className={styles.cardSubtitulo}>
            {movimentacoesVisiveis.length} movimentações no mês · {aprovadasMes} aprovadas · {reprovadasMes} reprovadas
          </p>
          {pendentes.length === 0 ? (
            <EmptyState message="Nenhuma pendência." />
          ) : (
            <div className={styles.pendList}>
              {pendentes.slice(0, 4).map((m) => (
                <div key={m.id} className={styles.pendItem}>
                  <div className={styles.pendTop}>
                    <Badge bg={`${tipoColor(m.tipoCod)}1a`} fg={tipoColor(m.tipoCod)} pill={false}>
                      {m.tipoCod}
                    </Badge>
                    <span className={styles.pendId}>{m.id}</span>
                  </div>
                  <div className={styles.pendNome}>{m.colaborador}</div>
                  <div className={styles.pendResumo}>{m.resumo}</div>
                  {podeAgir(m, conta.nome) ? (
                    <div className={styles.pendActions}>
                      <Button variant="success" icon={<Check size={14} />} onClick={() => aprovarEtapa(m.id)}>
                        Aprovar
                      </Button>
                      <Button variant="danger" icon={<X size={14} />} onClick={() => setReprovandoId(m.id)}>
                        Reprovar
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.pendAguardando}>Aguardando outra etapa</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <h2 className={styles.secaoTitulo}>Distribuições</h2>
      <div className={styles.distribuicoesGrid}>
        <Card>
          <h3 className={styles.cardTitle}>Headcount por Setor</h3>
          <p className={styles.cardSubtitulo}>{cargos.length} cargos cadastrados</p>
          <div className={styles.deptList}>
            {departamentos.map((d) => (
              <div key={d.nome} className={styles.deptRow}>
                <span className={styles.deptName} title={d.nome}>
                  {d.nome}
                </span>
                <ProgressBar value={d.count} max={maxDepto} />
                <span className={styles.deptCount}>{d.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {mostrarEquipes && gestores.length > 0 && (
          <Card>
            <h3 className={styles.cardTitle}>Equipes por Gestor</h3>
            <div className={styles.gestorGrid}>
              {gestores.map(([nome, count]) => (
                <Link key={nome} to={`/colaboradores?gestor=${encodeURIComponent(nome)}`} className={styles.gestorCard} title={nome}>
                  <Avatar nome={nome} size={32} />
                  <div className={styles.gestorInfo}>
                    <div className={styles.gestorNome}>{nome}</div>
                    <ProgressBar value={count} max={maxGestor} />
                  </div>
                  <span className={styles.gestorCount}>{count}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h3 className={styles.cardTitle}>Turnover por Setor</h3>
          {turnoverSetor.length === 0 ? (
            <EmptyState message="Sem dados suficientes no período selecionado." />
          ) : (
            <BarChart data={turnoverSetor.map((s) => ({ label: s.setor, value: s.turnover, annotation: `${Math.round(s.turnover)}%` }))} />
          )}
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Admissões × Desligamentos</h3>
          {admissoesDesligamentosMensal.length === 0 ? (
            <EmptyState message="Sem movimentação no período selecionado." />
          ) : (
            <AdmissoesDesligamentosChart data={admissoesDesligamentosMensal} />
          )}
        </Card>
      </div>

      <h2 className={styles.secaoTitulo}>Custos</h2>
      <div className={styles.mainGrid}>
        {custosRescisao.length > 0 ? (
          <Card className={styles.spanAll}>
            <div className={styles.pendHeader}>
              <h3 className={styles.cardTitle}>Custos de Rescisão por mês</h3>
              <span className={styles.verTodas}>
                {qtdDesligamentosTotal} desligamento{qtdDesligamentosTotal === 1 ? "" : "s"} · {money(custoRescisaoTotal)}
              </span>
            </div>
            <BarChart
              data={custosRescisao.map((m) => ({ label: m.mesLabel, value: m.total, annotation: String(m.quantidade) }))}
              color="var(--color-danger)"
            />
            <div className={`${tableStyles.wrap} ${styles.custoTableWrap}`}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Desligamentos</th>
                    <th>Rescisão</th>
                    <th>GRRF</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {custosRescisao.map((m) => (
                    <tr key={m.mes}>
                      <td>{m.mesLabel}</td>
                      <td>{m.quantidade}</td>
                      <td>{money(m.rescisao)}</td>
                      <td>{money(m.grrf)}</td>
                      <td>
                        <strong>{money(m.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className={styles.spanAll}>
            <h3 className={styles.cardTitle}>Custos de Rescisão por mês</h3>
            <EmptyState message="Nenhum desligamento no período/recorte selecionado." />
          </Card>
        )}

        <Card className={styles.spanAll}>
          <h3 className={styles.cardTitle}>Integrações futuras</h3>
          <p className={styles.integracoesDesc}>
            Esta estrutura já contempla a conexão com os demais portais MSB, permitindo que dados de colaboradores e
            movimentações alimentem outras iniciativas de RH.
          </p>
          <div className={styles.integracoesGrid}>
            {["Academia MSB", "Radar de EPI", "Central RH"].map((nome) => (
              <div key={nome} className={styles.integracaoItem}>
                <CheckCircle2 size={16} strokeWidth={1.8} />
                <span>{nome}</span>
                <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">
                  EM BREVE
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {modalAberto && <NovaMovimentacaoModal onClose={() => setModalAberto(false)} />}

      {movimentacaoReprovando && (
        <ReprovarModal
          colaborador={movimentacaoReprovando.colaborador}
          tipo={movimentacaoReprovando.tipo}
          onClose={() => setReprovandoId(null)}
          onConfirm={handleReprovar}
        />
      )}
    </>
  );
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
