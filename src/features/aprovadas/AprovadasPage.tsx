import { useMemo, useState } from "react";
import { Header } from "../../components/layout/Header";
import { Badge, EmptyState, StatusBadge, tableStyles } from "../../components/ui";
import { MovimentacaoDetalhe } from "../../components/shared/MovimentacaoDetalhe";
import { tipoColor } from "../../domain/colors";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";

export function AprovadasPage() {
  const { movimentacoesVisiveis } = usePortalData();
  const { state } = usePortalStore();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const aprovadas = useMemo(
    () => movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído"),
    [movimentacoesVisiveis],
  );

  const movimentacao = useMemo(() => aprovadas.find((m) => m.id === selecionado) || null, [aprovadas, selecionado]);

  if (movimentacao) {
    return (
      <>
        <Header />
        <MovimentacaoDetalhe movimentacao={movimentacao} cargosCustom={state.cargosCustom} onVoltar={() => setSelecionado(null)} />
      </>
    );
  }

  return (
    <>
      <Header />
      {aprovadas.length === 0 ? (
        <EmptyState message="Nenhuma movimentação aprovada ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Solicitação</th>
                <th>Tipo</th>
                <th>Colaborador</th>
                <th>Departamento</th>
                <th>Gestor solicitante</th>
                <th>Status</th>
                <th className={tableStyles.right}>Aprovação final</th>
              </tr>
            </thead>
            <tbody>
              {aprovadas.map((m) => (
                <tr key={m.id} className={tableStyles.clickable} onClick={() => setSelecionado(m.id)}>
                  <td>{m.id}</td>
                  <td>
                    <Badge bg={`${tipoColor(m.tipoCod)}1a`} fg={tipoColor(m.tipoCod)} pill={false}>
                      {m.tipoCod}
                    </Badge>
                  </td>
                  <td>{m.colaborador}</td>
                  <td>{m.depto}</td>
                  <td>{m.solicitante}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td className={tableStyles.right}>
                    {m.aprovacaoFinal ? `${m.aprovacaoFinal.data} · ${m.aprovacaoFinal.hora}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
