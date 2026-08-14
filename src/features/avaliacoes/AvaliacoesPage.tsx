import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador, EtapaAvaliacaoExperiencia } from "../../types/domain";
import { AvaliacaoExperienciaDrawer } from "./AvaliacaoExperienciaDrawer";
import { DispensarAvaliacaoModal } from "./DispensarAvaliacaoModal";
import styles from "./AvaliacoesPage.module.css";

export function AvaliacoesPage() {
  const { conta, perfil, colaboradores, avaliacoesExperiencia, pendenciasAvaliacaoExperiencia, criarAvaliacaoExperiencia, dispensarAvaliacaoExperiencia } =
    usePortalData();
  const [selecionado, setSelecionado] = useState<{ colaborador: Colaborador; etapa: EtapaAvaliacaoExperiencia } | null>(null);
  const [dispensando, setDispensando] = useState<{ colaborador: Colaborador; etapa: EtapaAvaliacaoExperiencia } | null>(null);

  // Gestor ATUAL do colaborador (colaboradores.gestor, ao vivo) — não
  // `avaliadoPor` (quem preencheu, congelado): se o colaborador mudou de
  // gestor depois da avaliação, é o gestor de hoje que precisa ver o
  // histórico dele, não quem já não gerencia mais essa pessoa. Mesmo
  // critério já usado em pendenciasAvaliacaoExperiencia (`p.colaborador.gestor === me`).
  const gestorAtualPorColaborador = useMemo(() => new Map(colaboradores.map((c) => [c.nome, c.gestor])), [colaboradores]);

  const historico = useMemo(() => {
    const base =
      perfil === "RH" ? avaliacoesExperiencia : avaliacoesExperiencia.filter((a) => gestorAtualPorColaborador.get(a.colaboradorNome) === conta.nome);
    return base.slice().sort((a, b) => b.avaliadoEm.localeCompare(a.avaliadoEm));
  }, [avaliacoesExperiencia, perfil, conta.nome, gestorAtualPorColaborador]);

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
                <th>Ações</th>
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
                  <td>
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDispensando({ colaborador, etapa });
                      }}
                    >
                      Dispensar
                    </Button>
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

      {dispensando && (
        <DispensarAvaliacaoModal
          colaborador={dispensando.colaborador.nome}
          etapa={dispensando.etapa}
          onClose={() => setDispensando(null)}
          onConfirm={async (motivo) => {
            const resultado = await dispensarAvaliacaoExperiencia(dispensando.colaborador.nome, motivo);
            if (resultado.ok) setDispensando(null);
          }}
        />
      )}
    </>
  );
}
