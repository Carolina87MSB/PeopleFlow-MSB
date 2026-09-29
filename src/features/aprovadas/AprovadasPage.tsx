import { useMemo, useState } from "react";
import { Header } from "../../components/layout/Header";
import { Badge, Button, EmptyState, StatusBadge, tableStyles } from "../../components/ui";
import { MovimentacaoDetalhe } from "../../components/shared/MovimentacaoDetalhe";
import { CartaMovimentacaoModal } from "../../components/shared/CartaMovimentacaoModal";
import { tipoColor } from "../../domain/colors";
import { podeEmitirCarta, statusCarta } from "../../domain/cartaMovimentacao";
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
        className={styles.botaoAcao}
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
        className={styles.botaoAcao}
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

/** Indicador compacto "Vagas: preenchidas/autorizadas" (RH, 2026-09) — os
 * detalhes (cargo, status de cada vaga, ações) ficam só dentro da MP (ver
 * VagasAutorizadasBloco.tsx), pra não voltar a alargar esta tabela. */
function IndicadorVagas({ m }: { m: Movimentacao }) {
  const { vagas } = usePortalData();
  const vagasDaMp = vagas.filter((v) => v.movimentacaoId === m.id);
  if (vagasDaMp.length === 0) return null;
  const preenchidas = vagasDaMp.filter((v) => v.status === "preenchida").length;
  return (
    <span className={preenchidas === vagasDaMp.length ? styles.substituicaoRealizada : styles.substituicaoPendente}>
      Vagas: {preenchidas}/{vagasDaMp.length}
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
              <col style={{ width: "5%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "16%" }} />
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
                  <td className={styles.celulaNowrap}>{m.id}</td>
                  <td>
                    <Badge bg={`${tipoColor(m.tipoCod)}1a`} fg={tipoColor(m.tipoCod)} pill={false} className={styles.badgeCompacta}>
                      {m.tipoCod}
                    </Badge>
                  </td>
                  <td>{m.colaborador}</td>
                  <td>{m.depto}</td>
                  <td>{m.solicitante}</td>
                  <td>
                    <StatusBadge status={m.status} className={styles.badgeCompacta} />
                  </td>
                  <td>{m.aprovacaoFinal ? `${m.aprovacaoFinal.data} · ${m.aprovacaoFinal.hora}` : "—"}</td>
                  <td className={tableStyles.right}>
                    <div className={styles.acoesColuna}>
                      <IndicadorVagas m={m} />
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
