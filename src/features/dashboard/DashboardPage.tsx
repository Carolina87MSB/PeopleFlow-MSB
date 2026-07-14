import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Plus, Search, X } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { NovaMovimentacaoModal } from "../../components/shared/NovaMovimentacaoModal";
import { Avatar, Badge, Button, Card, EmptyState, KpiCard, ProgressBar } from "../../components/ui";
import { agregarCargos, agregarDepartamentos, contarPorGestor } from "../../domain/agregados";
import { tipoColor } from "../../domain/colors";
import { podeAgir } from "../../domain/workflow";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { state } = usePortalStore();
  const {
    conta,
    colaboradoresVisiveis,
    movimentacoesVisiveis,
    mostrarEquipes,
    podeCriar,
    podeVerCadastros,
    pendenciasFinanceirasCount,
    aprovarEtapa,
    reprovarEtapa,
  } = usePortalData();
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const departamentos = useMemo(() => agregarDepartamentos(colaboradoresVisiveis), [colaboradoresVisiveis]);
  const cargos = useMemo(() => agregarCargos(colaboradoresVisiveis, state.cargosCustom), [colaboradoresVisiveis, state.cargosCustom]);
  const niveis = useMemo(() => new Set(cargos.map((c) => c.nivel)).size, [cargos]);
  const maxDepto = Math.max(1, ...departamentos.map((d) => d.count));

  const pendentes = movimentacoesVisiveis.filter((m) => m.status === "Em Aprovação");
  const aprovadasMes = movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído").length;
  const reprovadasMes = movimentacoesVisiveis.filter((m) => m.status === "Reprovado").length;
  const meusPendCount = pendentes.filter((m) => podeAgir(m, conta.nome)).length;

  const gestores = useMemo(() => [...contarPorGestor(colaboradoresVisiveis).entries()].sort((a, b) => b[1] - a[1]), [colaboradoresVisiveis]);
  const maxGestor = Math.max(1, ...gestores.map(([, count]) => count));

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

      <div className={styles.kpis}>
        <KpiCard label="Colaboradores ativos" value={colaboradoresVisiveis.length} hint={`distribuídos em ${departamentos.length} departamentos`} />
        <KpiCard label="Cargos cadastrados" value={cargos.length} hint={`em ${niveis} níveis hierárquicos`} />
        <KpiCard label="Movimentações no mês" value={movimentacoesVisiveis.length} hint={`${aprovadasMes} aprovadas · ${reprovadasMes} reprovadas`} />
        <KpiCard
          label="Pendentes de aprovação"
          value={pendentes.length}
          hint={`${meusPendCount} aguardando você`}
          highlight
        />
        {podeVerCadastros && (
          <Link to="/desligados" className={styles.kpiLink}>
            <KpiCard
              label="Desligamentos pendentes"
              value={pendenciasFinanceirasCount}
              hint="rescisão ou GRRF sem valor lançado"
              highlight={pendenciasFinanceirasCount > 0}
            />
          </Link>
        )}
      </div>

      <div className={styles.mainGrid}>
        <Card>
          <h3 className={styles.cardTitle}>Headcount por departamento</h3>
          <div className={styles.deptList}>
            {departamentos.map((d) => (
              <div key={d.nome} className={styles.deptRow}>
                <span className={styles.deptName}>{d.nome}</span>
                <ProgressBar value={d.count} max={maxDepto} />
                <span className={styles.deptCount}>{d.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className={styles.pendHeader}>
            <h3 className={styles.cardTitle}>Aprovações pendentes</h3>
            <Link to="/workflow" className={styles.verTodas}>
              Ver todas ›
            </Link>
          </div>
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
                      <Button variant="danger" icon={<X size={14} />} onClick={() => reprovarEtapa(m.id)}>
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

        {mostrarEquipes && gestores.length > 0 && (
          <Card className={styles.spanAll}>
            <h3 className={styles.cardTitle}>Equipes por gestor</h3>
            <div className={styles.gestorGrid}>
              {gestores.map(([nome, count]) => (
                <Link key={nome} to={`/colaboradores?gestor=${encodeURIComponent(nome)}`} className={styles.gestorCard}>
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
    </>
  );
}
