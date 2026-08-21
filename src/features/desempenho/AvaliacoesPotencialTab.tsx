import { useMemo, useState } from "react";
import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { formatarDataHora } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoPotencial } from "../../types/domain";
import { AvaliacaoPotencialDrawer } from "./AvaliacaoPotencialDrawer";
import { STATUS_CALIBRACAO_TONE } from "./CalibracaoTab";
import styles from "./AvaliacoesTab.module.css";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  "Não iniciada": { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
  "Em andamento": { bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  Concluída: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
};

function acaoParaAvaliacao(status: AvaliacaoPotencial["status"]): string {
  if (status === "Concluída") return "Visualizar";
  if (status === "Em andamento") return "Continuar";
  return "Iniciar";
}

/** Avaliação de Potencial (Etapa 4) — independente da AVD, gerada
 * automaticamente junto com o ciclo (1 por colaborador elegível). Aberta a
 * todo perfil MENOS "Colaborador" (ver GestaoDesempenhoPage.tsx); a própria
 * visibilidade por ficha (avaliacoesPotencialVisiveis) já garante que o
 * colaborador nunca veja a própria ficha mesmo se chegasse aqui. */
export function AvaliacoesPotencialTab() {
  const { avaliacoesPotencialVisiveis, ciclosAvaliacaoDesempenho, podeEditarGestaoDesempenho } = usePortalData();
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [avaliacaoAbertaId, setAvaliacaoAbertaId] = useState<string | null>(null);

  const opcoesCiclo = useMemo(() => ["Todos", ...ciclosAvaliacaoDesempenho.map((c) => c.nome)], [ciclosAvaliacaoDesempenho]);
  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(avaliacoesPotencialVisiveis.map((a) => a.departamento).filter(Boolean))).sort()],
    [avaliacoesPotencialVisiveis],
  );

  const filtradas = useMemo(
    () =>
      avaliacoesPotencialVisiveis
        .filter(
          (a) =>
            (cicloFiltro === "Todos" || a.ciclo === cicloFiltro) &&
            (statusFiltro === "Todos" || a.status === statusFiltro) &&
            (departamentoFiltro === "Todos" || a.departamento === departamentoFiltro),
        )
        .sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR")),
    [avaliacoesPotencialVisiveis, cicloFiltro, statusFiltro, departamentoFiltro],
  );

  const avaliacaoAberta = avaliacaoAbertaId ? avaliacoesPotencialVisiveis.find((a) => a.id === avaliacaoAbertaId) ?? null : null;

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Gerada automaticamente junto com o ciclo de Avaliação de Desempenho — 5 perguntas fixas, nota = média
          simples. Independente da AVD, não altera nota final nem o PDI; alimenta a futura Matriz 9 Box.
        </p>
      </div>

      <div className={styles.filtros}>
        <select className={styles.select} value={cicloFiltro} onChange={(e) => setCicloFiltro(e.target.value)}>
          {opcoesCiclo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os ciclos" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
          {["Todos", "Não iniciada", "Em andamento", "Concluída"].map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os status" : o}
            </option>
          ))}
        </select>
        {opcoesDepartamento.length > 2 && (
          <select className={styles.select} value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)}>
            {opcoesDepartamento.map((o) => (
              <option key={o} value={o}>
                {o === "Todos" ? "Todos os departamentos" : o}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState message="Nenhuma avaliação de potencial encontrada com os filtros atuais." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Ciclo</th>
                <th>Status</th>
                {podeEditarGestaoDesempenho && <th>Gestor</th>}
                <th>Conclusão</th>
                <th className={tableStyles.right}>Nota de potencial</th>
                <th className={tableStyles.right}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a) => {
                const tone = STATUS_TONE[a.status] ?? STATUS_TONE["Não iniciada"];
                return (
                  <tr key={a.id} className={tableStyles.clickable} onClick={() => setAvaliacaoAbertaId(a.id)}>
                    <td>{a.colaboradorNome}</td>
                    <td>{formatarNomeCargo(a.cargo)}</td>
                    <td>{a.departamento}</td>
                    <td>{a.ciclo}</td>
                    <td>
                      <div className={styles.statusBadges}>
                        <Badge bg={tone.bg} fg={tone.fg}>
                          {a.status}
                        </Badge>
                        {a.statusCalibracao !== "Não iniciada" && (
                          <Badge bg={STATUS_CALIBRACAO_TONE[a.statusCalibracao].bg} fg={STATUS_CALIBRACAO_TONE[a.statusCalibracao].fg}>
                            {a.statusCalibracao}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {podeEditarGestaoDesempenho && (
                      <td>{a.gestorAvaliador || <span className={styles.semGestor}>Sem gestor</span>}</td>
                    )}
                    <td>{a.concluidoEm ? formatarDataHora(a.concluidoEm) : "—"}</td>
                    <td className={tableStyles.right}>{a.notaPotencial ?? "—"}</td>
                    <td className={tableStyles.right}>{acaoParaAvaliacao(a.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {avaliacaoAberta && <AvaliacaoPotencialDrawer avaliacao={avaliacaoAberta} onClose={() => setAvaliacaoAbertaId(null)} />}
    </>
  );
}
