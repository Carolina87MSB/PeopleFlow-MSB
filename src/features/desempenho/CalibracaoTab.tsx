import { useMemo, useState } from "react";
import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho, AvaliacaoPotencial, StatusCalibracao } from "../../types/domain";
import { CalibracaoDrawer } from "./CalibracaoDrawer";
import styles from "./AvaliacoesTab.module.css";

export const STATUS_CALIBRACAO_TONE: Record<StatusCalibracao, { bg: string; fg: string }> = {
  "Não iniciada": { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
  "Aguardando Calibração": { bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  Homologada: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
};

export interface ParCalibracao {
  avaliacaoDesempenho: AvaliacaoDesempenho;
  avaliacaoPotencial: AvaliacaoPotencial;
}

/** Comitê de Calibração (Etapa 6) — RH-only. Lista os pares (ficha GESTOR +
 * Avaliação de Potencial) do mesmo colaborador/ciclo cujo `statusCalibracao`
 * já saiu de "Não iniciada" (ou seja, o gestor já concluiu os dois lados).
 * O RH representa o Comitê — não é um perfil novo, a calibração em si
 * acontece fora do sistema (reunião), aqui só se registra a decisão. */
export function CalibracaoTab() {
  const { avaliacoesDesempenho, avaliacoesPotencial, ciclosAvaliacaoDesempenho } = usePortalData();
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState<"Todos" | "Aguardando Calibração" | "Homologada">("Todos");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [gestorFiltro, setGestorFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [parAberto, setParAberto] = useState<ParCalibracao | null>(null);

  const pares = useMemo(() => {
    const potencialPorChave = new Map(avaliacoesPotencial.map((a) => [`${a.cicloId}::${a.colaboradorNome}`, a]));
    const resultado: ParCalibracao[] = [];
    for (const avd of avaliacoesDesempenho) {
      if (avd.tipo !== "GESTOR" || avd.statusCalibracao === "Não iniciada") continue;
      const potencial = potencialPorChave.get(`${avd.cicloId}::${avd.colaboradorNome}`);
      if (!potencial) continue;
      resultado.push({ avaliacaoDesempenho: avd, avaliacaoPotencial: potencial });
    }
    return resultado;
  }, [avaliacoesDesempenho, avaliacoesPotencial]);

  const opcoesDepartamento = useMemo(() => ["Todos", ...Array.from(new Set(pares.map((p) => p.avaliacaoDesempenho.departamento).filter(Boolean))).sort()], [pares]);
  const opcoesGestor = useMemo(() => ["Todos", ...Array.from(new Set(pares.map((p) => p.avaliacaoDesempenho.gestorAvaliador).filter(Boolean))).sort()], [pares]);
  const opcoesCargo = useMemo(() => ["Todos", ...Array.from(new Set(pares.map((p) => p.avaliacaoDesempenho.cargo).filter(Boolean))).sort()], [pares]);

  const paresFiltrados = pares.filter(
    (p) =>
      (cicloFiltro === "Todos" || p.avaliacaoDesempenho.ciclo === cicloFiltro) &&
      (statusFiltro === "Todos" || p.avaliacaoDesempenho.statusCalibracao === statusFiltro) &&
      (departamentoFiltro === "Todos" || p.avaliacaoDesempenho.departamento === departamentoFiltro) &&
      (gestorFiltro === "Todos" || p.avaliacaoDesempenho.gestorAvaliador === gestorFiltro) &&
      (cargoFiltro === "Todos" || p.avaliacaoDesempenho.cargo === cargoFiltro),
  );

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          O RH representa o Comitê de Calibração — revisa as avaliações já concluídas pelo gestor e, quando
          necessário, ajusta a média comportamental e/ou a nota de potencial antes de homologar a Nota Oficial.
        </p>
      </div>

      <div className={styles.filtros}>
        <select className={styles.select} value={cicloFiltro} onChange={(e) => setCicloFiltro(e.target.value)}>
          {["Todos", ...ciclosAvaliacaoDesempenho.map((c) => c.nome)].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}>
          <option value="Todos">Todos os status</option>
          <option value="Aguardando Calibração">Aguardando Calibração</option>
          <option value="Homologada">Homologada</option>
        </select>
        <select className={styles.select} value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)}>
          {opcoesDepartamento.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={gestorFiltro} onChange={(e) => setGestorFiltro(e.target.value)}>
          {opcoesGestor.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={cargoFiltro} onChange={(e) => setCargoFiltro(e.target.value)}>
          {opcoesCargo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? o : formatarNomeCargo(o)}
            </option>
          ))}
        </select>
      </div>

      {paresFiltrados.length === 0 ? (
        <EmptyState message="Nenhuma avaliação aguardando ou já submetida à calibração com os filtros atuais." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Gestor</th>
                <th>Ciclo</th>
                <th>Status</th>
                <th className={tableStyles.right}>Nota Final</th>
                <th className={tableStyles.right}>Nota Oficial</th>
              </tr>
            </thead>
            <tbody>
              {paresFiltrados.map((p) => {
                const tone = STATUS_CALIBRACAO_TONE[p.avaliacaoDesempenho.statusCalibracao];
                return (
                  <tr key={p.avaliacaoDesempenho.id} className={tableStyles.clickable} onClick={() => setParAberto(p)}>
                    <td>{p.avaliacaoDesempenho.colaboradorNome}</td>
                    <td>{formatarNomeCargo(p.avaliacaoDesempenho.cargo)}</td>
                    <td>{p.avaliacaoDesempenho.departamento}</td>
                    <td>{p.avaliacaoDesempenho.gestorAvaliador || "—"}</td>
                    <td>{p.avaliacaoDesempenho.ciclo}</td>
                    <td>
                      <Badge bg={tone.bg} fg={tone.fg}>
                        {p.avaliacaoDesempenho.statusCalibracao}
                      </Badge>
                    </td>
                    <td className={tableStyles.right}>{p.avaliacaoDesempenho.notaFinal ?? "—"}</td>
                    <td className={tableStyles.right}>{p.avaliacaoDesempenho.notaFinalOficial ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {parAberto && <CalibracaoDrawer par={parAberto} onClose={() => setParAberto(null)} />}
    </>
  );
}
