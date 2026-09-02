import { useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button, EmptyState, tableStyles } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador } from "../../types/domain";
import { FeedbackColaboradorModal } from "./FeedbackColaboradorModal";
import styles from "./FeedbackTab.module.css";

/** Feedback (Gestão de Desempenho → Desenvolvimento) — histórico contínuo de
 * conversas de gestão, independente de AVD/PDI/ciclo (ver domain/feedback.ts
 * e usePortalData.ts). Lista os liderados de `colaboradoresParaFeedback`
 * (RH/Diretoria: empresa toda; Gestor: quem `me` avaliou como GESTOR em
 * algum ciclo da AVD OU quem tem `gestor === me` hoje se ninguém mais já
 * avaliou — nunca só a equipe atual, pra não perder colaboradores que
 * mudaram de gestor depois do ciclo em que foram avaliados), sem coluna de
 * Setor por pedido explícito do RH. Clicar na linha abre o histórico; o
 * botão "Registrar Feedback" abre direto o formulário de novo registro
 * dentro do mesmo modal, pra manter o fluxo rápido. */
export function FeedbackTab() {
  const { colaboradoresParaFeedback, feedbacksVisiveis } = usePortalData();
  const [colaboradorAberto, setColaboradorAberto] = useState<Colaborador | null>(null);
  const [abrirFormularioAoEntrar, setAbrirFormularioAoEntrar] = useState(false);

  const contagemPorColaborador = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const f of feedbacksVisiveis) mapa.set(f.colaboradorNome, (mapa.get(f.colaboradorNome) ?? 0) + 1);
    return mapa;
  }, [feedbacksVisiveis]);

  const liderados = useMemo(
    () => [...colaboradoresParaFeedback].sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradoresParaFeedback],
  );

  function abrirHistorico(colaborador: Colaborador) {
    setAbrirFormularioAoEntrar(false);
    setColaboradorAberto(colaborador);
  }

  function abrirRegistro(colaborador: Colaborador) {
    setAbrirFormularioAoEntrar(true);
    setColaboradorAberto(colaborador);
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Histórico de feedbacks de gestão — conversas de desenvolvimento, alinhamento, orientação e reconhecimento
          com os seus liderados. Independente de AVD e PDI: pode ser registrado a qualquer momento, sem gerar nota.
        </p>
      </div>

      {liderados.length === 0 ? (
        <EmptyState message="Nenhum liderado encontrado." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th className={tableStyles.right}>Feedbacks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liderados.map((c) => (
                <tr key={c.nome} className={tableStyles.clickable} onClick={() => abrirHistorico(c)}>
                  <td>{c.nome}</td>
                  <td>{c.cargo}</td>
                  <td className={tableStyles.right}>{contagemPorColaborador.get(c.nome) ?? 0}</td>
                  <td className={styles.acaoCelula}>
                    <Button
                      variant="secondary"
                      icon={<MessageSquarePlus size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirRegistro(c);
                      }}
                    >
                      Registrar Feedback
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colaboradorAberto && (
        <FeedbackColaboradorModal
          colaborador={colaboradorAberto}
          abrirFormularioInicial={abrirFormularioAoEntrar}
          onClose={() => setColaboradorAberto(null)}
        />
      )}
    </>
  );
}
