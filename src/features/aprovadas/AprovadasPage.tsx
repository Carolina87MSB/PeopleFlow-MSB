import { useMemo, useState } from "react";
import { Header } from "../../components/layout/Header";
import { Badge, Button, EmptyState, StatusBadge, tableStyles } from "../../components/ui";
import { MovimentacaoDetalhe } from "../../components/shared/MovimentacaoDetalhe";
import { CartaMovimentacaoModal } from "../../components/shared/CartaMovimentacaoModal";
import { RegistrarSubstituicaoModal } from "../../components/shared/RegistrarSubstituicaoModal";
import { tipoColor } from "../../domain/colors";
import { podeEmitirCarta, statusCarta } from "../../domain/cartaMovimentacao";
import { podeRegistrarSubstituicao } from "../../domain/workflow";
import { usePortalData } from "../../store/usePortalData";
import type { Movimentacao } from "../../types/domain";
import styles from "./AprovadasPage.module.css";

function AcaoCarta({ m }: { m: Movimentacao }) {
  const { perfil, emitirCartaMovimentacao } = usePortalData();
  const [aberta, setAberta] = useState(false);

  if (!m.cartaMovimentacao) {
    if (perfil !== "RH" || !podeEmitirCarta(m)) return null;
    return (
      <Button
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          emitirCartaMovimentacao(m.id);
        }}
      >
        Emitir Carta de Movimentação
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        className={styles.botaoCarta}
        title={`Carta (${statusCarta(m.cartaMovimentacao)})`}
        onClick={(e) => {
          e.stopPropagation();
          setAberta(true);
        }}
      >
        Carta ({statusCarta(m.cartaMovimentacao)})
      </Button>
      {aberta && <CartaMovimentacaoModal movimentacao={m} onClose={() => setAberta(false)} />}
    </>
  );
}

function AcaoSubstituicao({ m }: { m: Movimentacao }) {
  const [aberta, setAberta] = useState(false);
  if (m.tipoCod !== "DES" || !m.substituicaoInfo?.necessaria) return null;
  const pendente = podeRegistrarSubstituicao(m);

  return (
    <span className={styles.acaoSubstituicao}>
      <span className={pendente ? styles.substituicaoPendente : styles.substituicaoRealizada}>
        {pendente ? "Substituição pendente" : "Substituição realizada"}
      </span>
      {pendente && (
        <Button
          variant="ghost"
          className={styles.botaoSubstituicao}
          onClick={(e) => {
            e.stopPropagation();
            setAberta(true);
          }}
        >
          Registrar substituição
        </Button>
      )}
      {aberta && <RegistrarSubstituicaoModal movimentacao={m} onClose={() => setAberta(false)} />}
    </span>
  );
}

export function AprovadasPage() {
  const { movimentacoesVisiveis } = usePortalData();
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
        <div className={styles.acaoCartaDetalhe}>
          <AcaoSubstituicao m={movimentacao} />
          <AcaoCarta m={movimentacao} />
        </div>
        <MovimentacaoDetalhe movimentacao={movimentacao} onVoltar={() => setSelecionado(null)} />
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
          <table className={[tableStyles.table, styles.tabelaAprovadas].join(" ")}>
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Solicitação</th>
                <th>Tipo</th>
                <th>Colaborador</th>
                <th>Departamento</th>
                <th>Gestor solicitante</th>
                <th>Status</th>
                <th>Aprovação final</th>
                <th className={tableStyles.right}>Ações</th>
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
                  <td>{m.aprovacaoFinal ? `${m.aprovacaoFinal.data} · ${m.aprovacaoFinal.hora}` : "—"}</td>
                  <td className={tableStyles.right}>
                    <div className={styles.acoesColuna}>
                      <AcaoSubstituicao m={m} />
                      <AcaoCarta m={m} />
                    </div>
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
