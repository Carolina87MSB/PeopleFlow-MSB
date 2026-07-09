import { useMemo, useState } from "react";
import { Check, Info } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { NovaMovimentacaoModal } from "../../components/shared/NovaMovimentacaoModal";
import { useToast } from "../../components/shared/ToastContext";
import { Badge, Button, Card, EmptyState, FilterChips, StatusBadge } from "../../components/ui";
import { prioMeta, tipoColor } from "../../domain/colors";
import { etapaAtual, podeAgir } from "../../domain/workflow";
import { usePortalData } from "../../store/usePortalData";
import type { Etapa, EtapaStatus, Movimentacao } from "../../types/domain";
import styles from "./WorkflowPage.module.css";

const FILTROS: string[] = ["Em Aprovação", "Rascunho", "Reprovado"];

function circleClass(status: EtapaStatus): string {
  if (status === "Aprovado") return styles.circleDone;
  if (status === "Reprovado") return styles.circleRejected;
  if (status === "Em análise") return styles.circleActive;
  return styles.circleWaiting;
}

function lineClass(status: EtapaStatus): string {
  if (status === "Aprovado") return styles.lineDone;
  if (status === "Reprovado") return styles.lineRejected;
  if (status === "Em análise") return styles.lineActive;
  return styles.lineWaiting;
}

function captionClass(status: EtapaStatus): string {
  if (status === "Aprovado") return styles.captionDone;
  if (status === "Reprovado") return styles.captionRejected;
  if (status === "Em análise") return styles.captionActive;
  return styles.captionWaiting;
}

function EtapaCircle({ etapa, index }: { etapa: Etapa; index: number }) {
  if (etapa.status === "Aprovado") {
    return (
      <div className={[styles.circle, circleClass(etapa.status)].join(" ")}>
        <Check size={14} strokeWidth={3} color="#fff" />
      </div>
    );
  }
  if (etapa.status === "Reprovado") {
    return (
      <div className={[styles.circle, circleClass(etapa.status)].join(" ")}>
        <span className={styles.xMark}>✕</span>
      </div>
    );
  }
  if (etapa.status === "Em análise") {
    return (
      <div className={[styles.circle, circleClass(etapa.status)].join(" ")}>
        <span className={styles.pulseDot} />
      </div>
    );
  }
  return <div className={[styles.circle, circleClass(etapa.status)].join(" ")}>{index + 1}</div>;
}

function comentarioParaExibir(m: Movimentacao): Etapa | undefined {
  if (m.status === "Reprovado") {
    return [...m.etapas].reverse().find((e) => e.status === "Reprovado" && e.comentario);
  }
  const atual = etapaAtual(m);
  if (atual?.comentario) return atual;
  return [...m.etapas].reverse().find((e) => e.comentario);
}

export function WorkflowPage() {
  const { conta, movimentacoesVisiveis, podeCriar, aprovarEtapa, reprovarEtapa } = usePortalData();
  const { flash } = useToast();
  const [modalAberto, setModalAberto] = useState(false);
  const [filtro, setFiltro] = useState<string>("Em Aprovação");
  const [gestor, setGestor] = useState("");

  const pendentes = useMemo(
    () => movimentacoesVisiveis.filter((m) => m.status === "Em Aprovação" || m.status === "Rascunho" || m.status === "Reprovado"),
    [movimentacoesVisiveis],
  );

  const gestores = useMemo(() => [...new Set(pendentes.map((m) => m.solicitante))].sort(), [pendentes]);

  const filtradas = useMemo(
    () => pendentes.filter((m) => m.status === filtro).filter((m) => !gestor || m.solicitante === gestor),
    [pendentes, filtro, gestor],
  );

  function handleAprovar(id: string) {
    aprovarEtapa(id);
    flash("Etapa aprovada — movimentação atualizada.");
  }

  function handleReprovar(id: string) {
    reprovarEtapa(id);
    flash("Movimentação reprovada e registrada na trilha.");
  }

  return (
    <>
      <Header
        actions={
          <>
            <select className={styles.selectGestor} value={gestor} onChange={(e) => setGestor(e.target.value)}>
              <option value="">Todos os gestores</option>
              {gestores.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {podeCriar && (
              <Button variant="primary" onClick={() => setModalAberto(true)}>
                + Nova movimentação
              </Button>
            )}
          </>
        }
      />

      <div className={styles.banner}>
        <Info size={16} strokeWidth={1.8} />
        <span>
          Esta aba exibe somente movimentações pendentes. Ao concluir todas as etapas da matriz, a movimentação migra
          automaticamente para Movimentações aprovadas.
        </span>
      </div>

      <FilterChips options={FILTROS} value={filtro} onChange={setFiltro} />

      {filtradas.length === 0 ? (
        <EmptyState message="Nenhuma movimentação neste status." />
      ) : (
        <div className={styles.list}>
          {filtradas.map((m) => {
            const gestorSolicitante = m.etapas.find((e) => e.papel === "Gestor Solicitante");
            const atual = etapaAtual(m);
            const podeAgirAgora = podeAgir(m, conta.nome);
            const prio = prioMeta(m.prioridade);
            const comentarioEtapa = comentarioParaExibir(m);

            return (
              <Card key={m.id} className={styles.card}>
                <div className={styles.headerRow}>
                  <div className={styles.headerLeft}>
                    <div className={styles.tipoBadge} style={{ background: tipoColor(m.tipoCod) }}>
                      {m.tipoCod}
                    </div>
                    <div className={styles.headerInfo}>
                      <div className={styles.nameRow}>
                        <span className={styles.colaborador}>{m.colaborador}</span>
                        <span className={styles.idMuted}>{m.id}</span>
                      </div>
                      <div className={styles.tipoResumo}>
                        {m.tipo} · {m.resumo}
                      </div>
                      {gestorSolicitante && (
                        <div className={styles.gestorLine}>
                          Gestor imediato: <strong>{gestorSolicitante.aprovador}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.headerRight}>
                    <Badge bg={prio.bg} fg={prio.fg}>
                      {m.prioridade}
                    </Badge>
                    <StatusBadge status={m.status} />
                  </div>
                </div>

                <div className={styles.timeline}>
                  {m.etapas.map((e, i) => (
                    <div className={[styles.step, i < m.etapas.length - 1 ? lineClass(e.status) : ""].join(" ")} key={i}>
                      <EtapaCircle etapa={e} index={i} />
                      <div className={styles.stepPapel}>{e.papel}</div>
                      <div className={styles.stepAprovador}>{e.aprovador}</div>
                      <div className={[styles.stepCaption, captionClass(e.status)].join(" ")}>{e.status}</div>
                    </div>
                  ))}
                </div>

                {m.status === "Em Aprovação" &&
                  (podeAgirAgora ? (
                    <div className={styles.actionsRow}>
                      <Button variant="danger" onClick={() => handleReprovar(m.id)}>
                        Reprovar
                      </Button>
                      <Button variant="primary" icon={<Check size={14} />} onClick={() => handleAprovar(m.id)}>
                        Aprovar etapa
                      </Button>
                    </div>
                  ) : (
                    atual && (
                      <div className={styles.aguardandoCaption}>
                        Aguardando {atual.papel} — {atual.aprovador}
                      </div>
                    )
                  ))}

                {comentarioEtapa?.comentario && (
                  <div className={[styles.comentarioBox, m.status === "Reprovado" ? styles.comentarioDanger : ""].join(" ")}>
                    <div className={styles.comentarioLabel}>
                      {m.status === "Reprovado" ? "JUSTIFICATIVA DA REPROVAÇÃO" : "Comentário"}
                    </div>
                    <div>{comentarioEtapa.comentario}</div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modalAberto && <NovaMovimentacaoModal onClose={() => setModalAberto(false)} />}
    </>
  );
}
