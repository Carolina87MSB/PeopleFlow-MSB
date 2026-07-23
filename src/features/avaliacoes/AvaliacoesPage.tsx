import { useMemo, useState } from "react";
import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador, EtapaAvaliacaoExperiencia } from "../../types/domain";
import { AvaliacaoExperienciaDrawer } from "./AvaliacaoExperienciaDrawer";
import styles from "./AvaliacoesPage.module.css";

export function AvaliacoesPage() {
  const { conta, perfil, avaliacoesExperiencia, pendenciasAvaliacaoExperiencia, criarAvaliacaoExperiencia } = usePortalData();
  const [selecionado, setSelecionado] = useState<{ colaborador: Colaborador; etapa: EtapaAvaliacaoExperiencia } | null>(null);

  const historico = useMemo(() => {
    const base = perfil === "RH" ? avaliacoesExperiencia : avaliacoesExperiencia.filter((a) => a.avaliadoPor === conta.nome);
    return base.slice().sort((a, b) => b.avaliadoEm.localeCompare(a.avaliadoEm));
  }, [avaliacoesExperiencia, perfil, conta.nome]);

  return (
    <>
      <Header />

      <h3 className={styles.sectionTitle}>Pendentes ({pendenciasAvaliacaoExperiencia.length})</h3>
      {pendenciasAvaliacaoExperiencia.length === 0 ? (
        <EmptyState message="Nenhuma avaliação de experiência pendente." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {pendenciasAvaliacaoExperiencia.map(({ colaborador, etapa }) => (
                <tr key={`${colaborador.nome}-${etapa}`} className={tableStyles.clickable} onClick={() => setSelecionado({ colaborador, etapa })}>
                  <td>{colaborador.nome}</td>
                  <td>{colaborador.cargo}</td>
                  <td>{colaborador.depto}</td>
                  <td>
                    <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">
                      {etapa}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.sectionTitle}>Histórico ({historico.length})</h3>
      {historico.length === 0 ? (
        <EmptyState message="Nenhuma avaliação de experiência registrada ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Etapa</th>
                <th>Nota</th>
                <th>Indicação</th>
                <th>Decisão final</th>
                <th>Avaliado por</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((a) => (
                <tr key={a.id}>
                  <td>{a.colaboradorNome}</td>
                  <td>{a.etapa}</td>
                  <td className="mono">{a.notaFinalPct.toFixed(1)}%</td>
                  <td>
                    <Badge
                      bg={a.indicacao === "Desligar" ? "var(--color-danger-bg)" : "var(--color-success-bg)"}
                      fg={a.indicacao === "Desligar" ? "var(--color-danger-fg)" : "var(--color-success-fg)"}
                    >
                      {a.indicacao}
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      bg={a.decisaoFinal === "Desligar" ? "var(--color-danger-bg)" : "var(--color-success-bg)"}
                      fg={a.decisaoFinal === "Desligar" ? "var(--color-danger-fg)" : "var(--color-success-fg)"}
                    >
                      {a.decisaoFinal}
                    </Badge>
                  </td>
                  <td>{a.avaliadoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionado && (
        <AvaliacaoExperienciaDrawer
          colaborador={selecionado.colaborador}
          etapa={selecionado.etapa}
          onClose={() => setSelecionado(null)}
          onSalvar={(respostas, decisaoFinal, justificativa) =>
            criarAvaliacaoExperiencia(selecionado.colaborador.nome, selecionado.etapa, respostas, decisaoFinal, justificativa)
          }
        />
      )}
    </>
  );
}
