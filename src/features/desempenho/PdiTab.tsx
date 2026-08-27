import { useMemo, useState } from "react";
import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import { PdiDrawer } from "./PdiDrawer";
import styles from "./PdiTab.module.css";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  "Não iniciado": { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
  "Em andamento": { bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  Concluído: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
};

/** Plano de Desenvolvimento Individual — gerado automaticamente na conclusão
 * da avaliação GESTOR de cada ciclo (ver usePortalData.ts). RH vê todos;
 * Gestor vê os próprios liderados; Colaborador só depois de concluído. */
export function PdiTab() {
  const { pdiVisiveis, colaboradores, ciclosAvaliacaoDesempenho, podeEditarGestaoDesempenho } = usePortalData();
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [pdiAbertoId, setPdiAbertoId] = useState<number | null>(null);

  const departamentoPorColaborador = useMemo(() => new Map(colaboradores.map((c) => [c.nome, c.depto])), [colaboradores]);

  const opcoesCiclo = useMemo(() => ["Todos", ...ciclosAvaliacaoDesempenho.map((c) => c.nome)], [ciclosAvaliacaoDesempenho]);
  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(pdiVisiveis.map((p) => departamentoPorColaborador.get(p.colaboradorNome)).filter(Boolean) as string[])).sort()],
    [pdiVisiveis, departamentoPorColaborador],
  );

  const filtrados = useMemo(
    () =>
      pdiVisiveis.filter(
        (p) =>
          (cicloFiltro === "Todos" || p.ciclo === cicloFiltro) &&
          (statusFiltro === "Todos" || p.status === statusFiltro) &&
          (departamentoFiltro === "Todos" || departamentoPorColaborador.get(p.colaboradorNome) === departamentoFiltro),
      ),
    [pdiVisiveis, cicloFiltro, statusFiltro, departamentoFiltro, departamentoPorColaborador],
  );

  const pdiAberto = pdiAbertoId ? pdiVisiveis.find((p) => p.id === pdiAbertoId) ?? null : null;

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Gerado automaticamente quando a avaliação do gestor é concluída — identifica competências e KPIs abaixo da
          nota mínima configurada e sugere ações de desenvolvimento.
        </p>
      </div>

      <div className={styles.filtros}>
        <div className={styles.filtroCampo}>
          <span className={styles.label}>Ciclos</span>
          <select className={styles.select} value={cicloFiltro} onChange={(e) => setCicloFiltro(e.target.value)}>
            {opcoesCiclo.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filtroCampo}>
          <span className={styles.label}>Status</span>
          <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            {["Todos", "Não iniciado", "Em andamento", "Concluído"].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        {podeEditarGestaoDesempenho && opcoesDepartamento.length > 2 && (
          <div className={styles.filtroCampo}>
            <span className={styles.label}>Departamentos</span>
            <select className={styles.select} value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)}>
              {opcoesDepartamento.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState message="Nenhum PDI encontrado com os filtros atuais." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                {podeEditarGestaoDesempenho && <th>Departamento</th>}
                <th>Ciclo</th>
                <th className={tableStyles.right}>Itens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const tone = STATUS_TONE[p.status] ?? STATUS_TONE["Não iniciado"];
                return (
                  <tr key={p.id} className={tableStyles.clickable} onClick={() => setPdiAbertoId(p.id)}>
                    <td>{p.colaboradorNome}</td>
                    {podeEditarGestaoDesempenho && <td>{departamentoPorColaborador.get(p.colaboradorNome) ?? "—"}</td>}
                    <td>{p.ciclo}</td>
                    <td className={tableStyles.right}>{p.itens.length}</td>
                    <td>
                      <Badge bg={tone.bg} fg={tone.fg}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pdiAberto && <PdiDrawer pdi={pdiAberto} onClose={() => setPdiAbertoId(null)} />}
    </>
  );
}
