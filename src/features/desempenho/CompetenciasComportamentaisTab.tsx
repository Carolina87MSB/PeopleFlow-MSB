import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, EmptyState, FilterChips, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { CompetenciaComportamental } from "../../types/domain";
import { CompetenciaComportamentalDrawer } from "./CompetenciaComportamentalDrawer";
import styles from "./CompetenciasComportamentaisTab.module.css";

const CATEGORIAS = ["Comportamental", "Liderança"] as const;

function categoriaParaValor(label: string): CompetenciaComportamental["categoria"] {
  return label === "Liderança" ? "Lideranca" : "Comportamental";
}

function competenciaVazia(ordem: number, categoria: CompetenciaComportamental["categoria"]): CompetenciaComportamental {
  return { id: `competencia-${Date.now()}`, nome: "", descricao: "", afirmacoes: [], ordem, ativo: true, categoria, updatedAt: "", updatedBy: "" };
}

/** Catálogo corporativo de competências — mesma estrutura pra dois usos
 * diferentes, separados por `categoria`: "Comportamental" (usada nas
 * avaliações GESTOR/AUTOAVALIACAO, válida pra todos os cargos) e "Liderança"
 * (usada só na avaliação LIDERANCA). O alternador abaixo troca qual catálogo
 * está sendo visto/editado — a competência nova criada aqui já nasce com a
 * categoria selecionada. */
export function CompetenciasComportamentaisTab() {
  const { competenciasComportamentais, podeEditarGestaoDesempenho } = usePortalData();
  const [categoriaFiltro, setCategoriaFiltro] = useState<(typeof CATEGORIAS)[number]>("Comportamental");
  const [selecionada, setSelecionada] = useState<CompetenciaComportamental | null>(null);

  const categoriaValor = categoriaParaValor(categoriaFiltro);
  const ordenadas = useMemo(
    () => competenciasComportamentais.filter((c) => c.categoria === categoriaValor).sort((a, b) => a.ordem - b.ordem),
    [competenciasComportamentais, categoriaValor],
  );

  function abrirNova() {
    setSelecionada(competenciaVazia(ordenadas.length, categoriaValor));
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          {categoriaValor === "Lideranca"
            ? "Usadas só na Avaliação da Liderança (colaborador avalia o próprio gestor)."
            : "Válidas para todos os cargos da empresa — não são específicas de um cargo (isso é o papel dos KPIs)."}
        </p>
        {podeEditarGestaoDesempenho && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={abrirNova}>
            Nova competência
          </Button>
        )}
      </div>

      <FilterChips options={[...CATEGORIAS]} value={categoriaFiltro} onChange={(v) => setCategoriaFiltro(v as (typeof CATEGORIAS)[number])} />

      {ordenadas.length === 0 ? (
        <EmptyState message="Nenhuma competência cadastrada ainda nesta categoria." />
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
                  <td className={styles.descricaoCell} title={c.descricao || undefined}>
                    {c.descricao || "—"}
                  </td>
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
