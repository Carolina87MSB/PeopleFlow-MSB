import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, FilterChips, tableStyles } from "../../components/ui";
import { arredondar, mediaComportamental, mediaTecnica, notaFinalAvaliacao } from "../../domain/avaliacaoDesempenho";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho } from "../../types/domain";
import { AvaliacaoDesempenhoDrawer } from "./AvaliacaoDesempenhoDrawer";
import { NovoCicloModal } from "./NovoCicloModal";
import styles from "./AvaliacoesTab.module.css";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  "Não iniciada": { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
  "Em andamento": { bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  Concluída: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
};

function notaFinalDe(avaliacao: AvaliacaoDesempenho, kpisCargo: ReturnType<typeof usePortalData>["kpisCargo"], config: ReturnType<typeof usePortalData>["configAvaliacaoDesempenho"]): number | null {
  const tecnica = mediaTecnica(avaliacao.resultadosKpis, kpisCargo);
  const comportamental = mediaComportamental(avaliacao.resultadosComportamentais);
  return notaFinalAvaliacao(tecnica, comportamental, config);
}

/** Ciclos de Avaliação de Desempenho (AVD) — RH abre um ciclo (gera 1
 * avaliação por colaborador ativo); gestor preenche as avaliações dos seus
 * liderados. Sem fluxo de aprovação, autoavaliação ou dashboards ainda. */
export function AvaliacoesTab() {
  const { avaliacoesDesempenhoVisiveis, ciclosAvaliacaoDesempenho, kpisCargo, configAvaliacaoDesempenho, podeEditarGestaoDesempenho } =
    usePortalData();
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [avaliacaoAbertaId, setAvaliacaoAbertaId] = useState<string | null>(null);

  const opcoesCiclo = useMemo(() => ["Todos", ...ciclosAvaliacaoDesempenho.map((c) => c.nome)], [ciclosAvaliacaoDesempenho]);

  const filtradas = useMemo(
    () => (cicloFiltro === "Todos" ? avaliacoesDesempenhoVisiveis : avaliacoesDesempenhoVisiveis.filter((a) => a.ciclo === cicloFiltro)),
    [avaliacoesDesempenhoVisiveis, cicloFiltro],
  );

  const avaliacaoAberta = avaliacaoAbertaId ? avaliacoesDesempenhoVisiveis.find((a) => a.id === avaliacaoAbertaId) ?? null : null;

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

      {ciclosAvaliacaoDesempenho.length > 1 && <FilterChips options={opcoesCiclo} value={cicloFiltro} onChange={setCicloFiltro} />}

      {filtradas.length === 0 ? (
        <EmptyState message="Nenhuma avaliação de desempenho ainda — abra um ciclo pra gerar as avaliações dos colaboradores ativos." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Ciclo</th>
                <th>Status</th>
                <th className={tableStyles.right}>Nota final</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a) => {
                const nota = arredondar(notaFinalDe(a, kpisCargo, configAvaliacaoDesempenho));
                const tone = STATUS_TONE[a.status] ?? STATUS_TONE["Não iniciada"];
                return (
                  <tr key={a.id} className={tableStyles.clickable} onClick={() => setAvaliacaoAbertaId(a.id)}>
                    <td>{a.colaboradorNome}</td>
                    <td>{a.ciclo}</td>
                    <td>
                      <Badge bg={tone.bg} fg={tone.fg}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className={tableStyles.right}>{nota ?? "—"}</td>
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
