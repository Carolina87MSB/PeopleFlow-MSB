import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { calcularNotasAvaliacao } from "../../domain/avaliacaoDesempenho";
import { formatarDataHora, formatarDataIso } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { getIniciosAvaliacoesDesempenho, getLogAvaliacaoDesempenho } from "../../repositories/logAvaliacaoDesempenhoRepository";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho, CicloAvaliacaoDesempenho, LogAvaliacaoDesempenho, TipoAvaliacaoDesempenho } from "../../types/domain";
import { AvaliacaoDesempenhoDrawer } from "./AvaliacaoDesempenhoDrawer";
import { NovoCicloModal } from "./NovoCicloModal";
import { STATUS_CALIBRACAO_TONE } from "./CalibracaoTab";
import styles from "./AvaliacoesTab.module.css";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  "Não iniciada": { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
  "Em andamento": { bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  Concluída: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
};

const CICLO_TONE: Record<string, { bg: string; fg: string }> = {
  Aberto: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
  Encerrado: { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
};

const ACAO_LOG_LABEL: Record<string, string> = {
  CICLO_CRIADO: "Ciclo criado",
  AVALIACOES_GERADAS: "Avaliações geradas",
  CICLO_ENCERRADO: "Ciclo encerrado",
  AVALIACAO_INICIADA: "Avaliação iniciada",
  AVALIACAO_SALVA: "Avaliação salva",
  AVALIACAO_CONCLUIDA: "Avaliação concluída",
  COLABORADOR_NAO_ELEGIVEL: "Colaborador não elegível",
  AGUARDANDO_CALIBRACAO: "Aguardando calibração",
  AVALIACAO_HOMOLOGADA: "Avaliação homologada",
};

const TIPO_LABEL: Record<TipoAvaliacaoDesempenho, string> = {
  GESTOR: "Avaliação do Gestor",
  AUTOAVALIACAO: "Autoavaliação",
  LIDERANCA: "Avaliação da Liderança",
};

// Ponto único de cálculo — o mesmo usado no preview do Drawer e ao salvar,
// pra esta coluna nunca divergir do valor efetivamente gravado (ver
// calcularNotasAvaliacao() em domain/avaliacaoDesempenho.ts). Já vem
// arredondado — não precisa de arredondar() no call site.
function notaFinalDe(
  avaliacao: AvaliacaoDesempenho,
  kpisCargo: ReturnType<typeof usePortalData>["kpisCargo"],
  config: ReturnType<typeof usePortalData>["configAvaliacaoDesempenho"],
): number | null {
  return calcularNotasAvaliacao(avaliacao, kpisCargo, config).notaFinal;
}

function acaoParaAvaliacao(status: AvaliacaoDesempenho["status"]): string {
  if (status === "Concluída") return "Visualizar";
  if (status === "Em andamento") return "Continuar";
  return "Iniciar";
}

interface CicloLinhaProps {
  ciclo: CicloAvaliacaoDesempenho;
  avaliacoesDoCiclo: AvaliacaoDesempenho[];
  onEncerrar: (ciclo: CicloAvaliacaoDesempenho) => void;
}

/** Uma linha da tabela de Ciclos (RH), com log de auditoria colapsável — sem
 * dashboard/relatório novo, só consulta crua dos registros já gravados. */
function CicloLinha({ ciclo, avaliacoesDoCiclo, onEncerrar }: CicloLinhaProps) {
  const [expandido, setExpandido] = useState(false);
  const [log, setLog] = useState<LogAvaliacaoDesempenho[] | null>(null);
  const [carregandoLog, setCarregandoLog] = useState(false);

  const geradas = avaliacoesDoCiclo.length;
  const concluidas = avaliacoesDoCiclo.filter((a) => a.status === "Concluída").length;
  const semGestor = avaliacoesDoCiclo.filter((a) => !a.gestorAvaliador).length;
  const tone = CICLO_TONE[ciclo.status] ?? CICLO_TONE.Aberto;

  async function toggleExpandir() {
    const abrindo = !expandido;
    setExpandido(abrindo);
    if (abrindo && log === null) {
      setCarregandoLog(true);
      const entradas = await getLogAvaliacaoDesempenho(ciclo.id);
      setCarregandoLog(false);
      setLog(entradas);
    }
  }

  return (
    <>
      <tr>
        <td>
          <button type="button" className={styles.expandirBotao} onClick={toggleExpandir}>
            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {ciclo.nome}
          </button>
        </td>
        <td>{ciclo.periodoReferencia}</td>
        <td>{formatarDataIso(ciclo.dataInicio)}</td>
        <td>{formatarDataIso(ciclo.dataEncerramento)}</td>
        <td className={tableStyles.right}>{geradas}</td>
        <td className={tableStyles.right}>{concluidas}</td>
        <td>
          <div className={styles.statusBadges}>
            <Badge bg={tone.bg} fg={tone.fg}>
              {ciclo.status}
            </Badge>
            {semGestor > 0 && (
              <Badge bg="var(--color-warning-bg, #fbeee0)" fg="var(--color-warning-fg, #a3672a)">
                {semGestor} sem gestor
              </Badge>
            )}
          </div>
        </td>
        <td className={tableStyles.right}>
          {ciclo.status === "Aberto" && (
            <Button variant="ghost" onClick={() => onEncerrar(ciclo)}>
              Encerrar ciclo
            </Button>
          )}
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={8}>
            <div className={styles.logBox}>
              {carregandoLog ? (
                <span className={styles.logVazio}>Carregando registros...</span>
              ) : !log || log.length === 0 ? (
                <span className={styles.logVazio}>Nenhum registro de auditoria ainda.</span>
              ) : (
                <ul className={styles.logLista}>
                  {log.map((entrada) => (
                    <li key={entrada.id}>
                      <strong>{ACAO_LOG_LABEL[entrada.acao] ?? entrada.acao}</strong> — {entrada.usuario} em {formatarDataHora(entrada.criadoEm)}
                      {entrada.detalhe && <span> ({entrada.detalhe})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Ciclos de Avaliação de Desempenho (AVD) — RH abre um ciclo (gera 1
 * avaliação por colaborador ativo) e pode encerrá-lo (trava todas as
 * avaliações vinculadas, mesmo as "Em andamento" — sem reabertura nesta
 * etapa). Gestor preenche as avaliações dos seus liderados. Sem fluxo de
 * aprovação, autoavaliação ou dashboards ainda. */
export function AvaliacoesTab() {
  const {
    avaliacoesDesempenhoVisiveis,
    avaliacoesDesempenho,
    ciclosAvaliacaoDesempenho,
    kpisCargo,
    configAvaliacaoDesempenho,
    podeEditarGestaoDesempenho,
    encerrarCicloAvaliacaoDesempenho,
  } = usePortalData();
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [somenteSemGestor, setSomenteSemGestor] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [avaliacaoAbertaId, setAvaliacaoAbertaId] = useState<string | null>(null);
  const [iniciosPorAvaliacao, setIniciosPorAvaliacao] = useState<Map<string, string>>(new Map());

  // Data de início de cada avaliação = 1º registro "AVALIACAO_INICIADA" no log
  // de auditoria — não é um campo novo, só reaproveita o que o log já grava.
  useEffect(() => {
    let cancelado = false;
    getIniciosAvaliacoesDesempenho().then((registros) => {
      if (cancelado) return;
      const mapa = new Map<string, string>();
      for (const r of registros) if (!mapa.has(r.avaliacaoId)) mapa.set(r.avaliacaoId, r.iniciadoEm);
      setIniciosPorAvaliacao(mapa);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const opcoesCiclo = useMemo(() => ["Todos", ...ciclosAvaliacaoDesempenho.map((c) => c.nome)], [ciclosAvaliacaoDesempenho]);
  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(avaliacoesDesempenhoVisiveis.map((a) => a.departamento).filter(Boolean))).sort()],
    [avaliacoesDesempenhoVisiveis],
  );

  const filtradas = useMemo(
    () =>
      avaliacoesDesempenhoVisiveis.filter(
        (a) =>
          (cicloFiltro === "Todos" || a.ciclo === cicloFiltro) &&
          (statusFiltro === "Todos" || a.status === statusFiltro) &&
          (tipoFiltro === "Todos" || a.tipo === tipoFiltro) &&
          (departamentoFiltro === "Todos" || a.departamento === departamentoFiltro) &&
          (!somenteSemGestor || !a.gestorAvaliador),
      ),
    [avaliacoesDesempenhoVisiveis, cicloFiltro, statusFiltro, tipoFiltro, departamentoFiltro, somenteSemGestor],
  );

  const avaliacaoAberta = avaliacaoAbertaId ? avaliacoesDesempenhoVisiveis.find((a) => a.id === avaliacaoAbertaId) ?? null : null;

  async function handleEncerrar(ciclo: CicloAvaliacaoDesempenho) {
    const confirmado = window.confirm(
      `Encerrar o ciclo "${ciclo.nome}"? Todas as avaliações vinculadas — mesmo as "Em andamento" — deixarão de aceitar edição.`,
    );
    if (!confirmado) return;
    await encerrarCicloAvaliacaoDesempenho(ciclo.id);
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Um ciclo gera automaticamente a avaliação de cada colaborador ativo — competências comportamentais corporativas + KPIs do cargo.
        </p>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setModalAberto(true)}>
            Abrir novo ciclo
          </Button>
        )}
      </div>

      {podeEditarGestaoDesempenho && (
        <>
          <h4 className={styles.sectionTitle}>Ciclos</h4>
          {ciclosAvaliacaoDesempenho.length === 0 ? (
            <EmptyState message="Nenhum ciclo aberto ainda." />
          ) : (
            <div className={tableStyles.wrap}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Período</th>
                    <th>Início</th>
                    <th>Encerramento</th>
                    <th className={tableStyles.right}>Geradas</th>
                    <th className={tableStyles.right}>Concluídas</th>
                    <th>Status</th>
                    <th className={tableStyles.right}></th>
                  </tr>
                </thead>
                <tbody>
                  {ciclosAvaliacaoDesempenho.map((ciclo) => (
                    <CicloLinha
                      key={ciclo.id}
                      ciclo={ciclo}
                      avaliacoesDoCiclo={avaliacoesDesempenho.filter((a) => a.cicloId === ciclo.id)}
                      onEncerrar={handleEncerrar}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h4 className={styles.sectionTitle}>Avaliações</h4>
      <div className={styles.filtros}>
        <select className={styles.select} value={cicloFiltro} onChange={(e) => setCicloFiltro(e.target.value)}>
          {opcoesCiclo.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
          {["Todos", "Não iniciada", "Em andamento", "Concluída"].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
          <option value="Todos">Todos os tipos</option>
          {(Object.keys(TIPO_LABEL) as TipoAvaliacaoDesempenho[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
        {opcoesDepartamento.length > 2 && (
          <select className={styles.select} value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)}>
            {opcoesDepartamento.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {podeEditarGestaoDesempenho && (
          <label className={styles.checkboxFiltro}>
            <input type="checkbox" checked={somenteSemGestor} onChange={(e) => setSomenteSemGestor(e.target.checked)} />
            Somente sem gestor
          </label>
        )}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState message="Nenhuma avaliação de desempenho encontrada com os filtros atuais." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Tipo</th>
                <th>Avaliado</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Ciclo</th>
                <th>Status</th>
                {podeEditarGestaoDesempenho && <th>Avaliador</th>}
                <th>Início</th>
                <th>Conclusão</th>
                <th className={tableStyles.right}>Nota final</th>
                <th className={tableStyles.right}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a) => {
                const nota = a.notaFinal ?? notaFinalDe(a, kpisCargo, configAvaliacaoDesempenho);
                const tone = STATUS_TONE[a.status] ?? STATUS_TONE["Não iniciada"];
                const iniciadoEm = iniciosPorAvaliacao.get(a.id);
                return (
                  <tr key={a.id} className={tableStyles.clickable} onClick={() => setAvaliacaoAbertaId(a.id)}>
                    <td>{a.colaboradorNome}</td>
                    <td>{TIPO_LABEL[a.tipo]}</td>
                    <td>{a.avaliado}</td>
                    <td>{formatarNomeCargo(a.cargo)}</td>
                    <td>{a.departamento}</td>
                    <td>{a.ciclo}</td>
                    <td>
                      <div className={styles.statusBadges}>
                        <Badge bg={tone.bg} fg={tone.fg}>
                          {a.status}
                        </Badge>
                        {a.tipo === "GESTOR" && a.statusCalibracao !== "Não iniciada" && (
                          <Badge bg={STATUS_CALIBRACAO_TONE[a.statusCalibracao].bg} fg={STATUS_CALIBRACAO_TONE[a.statusCalibracao].fg}>
                            {a.statusCalibracao}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {podeEditarGestaoDesempenho && (
                      <td>{a.gestorAvaliador || <span className={styles.semGestor}>Sem gestor</span>}</td>
                    )}
                    <td>{iniciadoEm ? formatarDataHora(iniciadoEm) : "—"}</td>
                    <td>{a.concluidoEm ? formatarDataHora(a.concluidoEm) : "—"}</td>
                    <td className={tableStyles.right}>{nota ?? "—"}</td>
                    <td className={tableStyles.right}>{acaoParaAvaliacao(a.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && <NovoCicloModal onClose={() => setModalAberto(false)} />}
      {avaliacaoAberta && <AvaliacaoDesempenhoDrawer avaliacao={avaliacaoAberta} onClose={() => setAvaliacaoAbertaId(null)} />}
    </>
  );
}
