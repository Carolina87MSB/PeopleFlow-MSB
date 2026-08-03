import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { PdiBibliotecaItem } from "../../types/domain";
import { PdiBibliotecaDrawer } from "./PdiBibliotecaDrawer";
import styles from "./CompetenciasComportamentaisTab.module.css";

function itemVazio(): PdiBibliotecaItem {
  return { chave: "", tipoCompetencia: "Comportamental", objetivoSugerido: "", acoesSugeridas: [], updatedAt: "", updatedBy: "" };
}

/** Biblioteca de modelos de PDI mantida pelo RH — pra cada competência
 * comportamental (chaveada pelo id estável do catálogo) ou KPI (chaveado
 * pelo nome, sem id estável entre cargos), um objetivo de desenvolvimento
 * sugerido + ações sugeridas, usados por sugerirObjetivoEAcoes() ao gerar
 * um PDI automaticamente (ver domain/pdi.ts). Sem modelo cadastrado, o PDI
 * nasce com um objetivo genérico e nenhuma ação sugerida. */
export function PdiBibliotecaTab() {
  const { pdiBiblioteca, competenciasComportamentais, kpisCargo, excluirItemBibliotecaPdi, podeEditarGestaoDesempenho } = usePortalData();
  const [selecionado, setSelecionado] = useState<PdiBibliotecaItem | null>(null);

  const competenciasPorId = useMemo(() => new Map(competenciasComportamentais.map((c) => [c.id, c])), [competenciasComportamentais]);

  function nomeExibicao(item: PdiBibliotecaItem): string {
    if (item.tipoCompetencia === "Comportamental") return competenciasPorId.get(item.chave)?.nome ?? item.chave;
    return item.chave;
  }

  async function handleExcluir(item: PdiBibliotecaItem, e: MouseEvent) {
    e.stopPropagation();
    const confirmado = window.confirm(`Remover o modelo de "${nomeExibicao(item)}" da biblioteca?`);
    if (!confirmado) return;
    await excluirItemBibliotecaPdi(item.chave, item.tipoCompetencia);
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Modelos de objetivo e ações de desenvolvimento sugeridos automaticamente quando um PDI é gerado — um por
          competência comportamental ou KPI. Sem modelo, o PDI nasce com um texto genérico.
        </p>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setSelecionado(itemVazio())}>
            Novo modelo
          </Button>
        )}
      </div>

      {pdiBiblioteca.length === 0 ? (
        <EmptyState message="Nenhum modelo cadastrado ainda na biblioteca de PDI." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Competência / KPI</th>
                <th>Tipo</th>
                <th>Objetivo sugerido</th>
                <th className={tableStyles.right}>Ações sugeridas</th>
                {podeEditarGestaoDesempenho && <th className={tableStyles.right}></th>}
              </tr>
            </thead>
            <tbody>
              {pdiBiblioteca.map((item) => (
                <tr
                  key={`${item.tipoCompetencia}::${item.chave}`}
                  className={tableStyles.clickable}
                  onClick={() => setSelecionado(item)}
                >
                  <td>
                    <span className={styles.nomeCell}>{nomeExibicao(item)}</span>
                  </td>
                  <td>
                    <Badge bg="var(--color-surface, #f6fafb)" fg="var(--color-muted)">
                      {item.tipoCompetencia === "Comportamental" ? "Comportamental" : "Técnica (KPI)"}
                    </Badge>
                  </td>
                  <td className={styles.descricaoCell}>{item.objetivoSugerido || "—"}</td>
                  <td className={tableStyles.right}>{item.acoesSugeridas.length}</td>
                  {podeEditarGestaoDesempenho && (
                    <td className={tableStyles.right}>
                      <Button variant="ghost" onClick={(e) => handleExcluir(item, e)}>
                        Excluir
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionado && (
        <PdiBibliotecaDrawer
          item={selecionado}
          chavesExistentes={new Set(pdiBiblioteca.map((b) => `${b.tipoCompetencia}::${b.chave}`))}
          competenciasDisponiveis={competenciasComportamentais.filter((c) => c.ativo && c.categoria !== "Lideranca")}
          nomesKpiDisponiveis={Array.from(new Set(kpisCargo.map((k) => k.nomeIndicador))).sort()}
          onClose={() => setSelecionado(null)}
        />
      )}
    </>
  );
}
