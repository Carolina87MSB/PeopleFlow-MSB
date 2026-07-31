import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { CompetenciaComportamental } from "../../types/domain";
import { CompetenciaComportamentalDrawer } from "./CompetenciaComportamentalDrawer";
import styles from "./CompetenciasComportamentaisTab.module.css";

function competenciaVazia(ordem: number): CompetenciaComportamental {
  return { id: `competencia-${Date.now()}`, nome: "", descricao: "", afirmacoes: [], ordem, ativo: true, updatedAt: "", updatedBy: "" };
}

/** Catálogo corporativo de competências comportamentais — as mesmas pra
 * todos os cargos da empresa. Etapa 1: só cadastro (nome/descrição/
 * afirmações), sem cálculo/fluxo de avaliação ainda. */
export function CompetenciasComportamentaisTab() {
  const { competenciasComportamentais, podeEditarGestaoDesempenho } = usePortalData();
  const [selecionada, setSelecionada] = useState<CompetenciaComportamental | null>(null);

  const ordenadas = [...competenciasComportamentais].sort((a, b) => a.ordem - b.ordem);

  function abrirNova() {
    setSelecionada(competenciaVazia(ordenadas.length));
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>Válidas para todos os cargos da empresa — não são específicas de um cargo (isso é o papel dos KPIs).</p>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={abrirNova}>
            Nova competência
          </Button>
        )}
      </div>

      {ordenadas.length === 0 ? (
        <EmptyState message="Nenhuma competência comportamental cadastrada ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Competência</th>
                <th>Descrição</th>
                <th className={tableStyles.right}>Afirmações</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((c) => (
                <tr key={c.id} className={tableStyles.clickable} onClick={() => setSelecionada(c)}>
                  <td>
                    <span className={styles.nomeCell}>{c.nome}</span>
                  </td>
                  <td className={styles.descricaoCell}>{c.descricao || "—"}</td>
                  <td className={tableStyles.right}>{c.afirmacoes.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionada && <CompetenciaComportamentalDrawer competencia={selecionada} onClose={() => setSelecionada(null)} />}
    </>
  );
}
