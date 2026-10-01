import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { Badge, Button, EmptyState, StatusBadge, tableStyles } from "../../components/ui";
import { MovimentacaoDetalhe } from "../../components/shared/MovimentacaoDetalhe";
import { CartaMovimentacaoModal } from "../../components/shared/CartaMovimentacaoModal";
import { tipoColor } from "../../domain/colors";
import { podeEmitirCarta, statusCarta } from "../../domain/cartaMovimentacao";
import { nomeExibicaoMovimentacao } from "../../domain/workflow";
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

/** Coluna "Colaborador" (RH, 2026-10) — só pra MPs de `aumento_quadro` (ex.
 * M-2026-024) a lista de nomes preenchidos substitui `m.colaborador`: ali a
 * MP não representa uma pessoa específica, só autoriza N vagas, então os
 * preenchimentos efetivos (vaga.status === "preenchida") É a identidade real
 * a mostrar — um por linha, limitando a 2 + "+N" pra não alargar a tabela
 * (ver IndicadorVagas acima pro contador "preenchidas/autorizadas").
 *
 * Para `substituicao` (Desligamento) e `vacancia_promocao`/
 * `vacancia_transferencia` (Promoção/Transferência que gera vaga), `m.
 * colaborador` já É uma pessoa real e específica (quem está sendo desligado/
 * promovido/transferido) — quem preenche a vaga resultante é uma pessoa
 * DIFERENTE, relacionada mas nunca um substituto do titular da MP na
 * listagem (regressão corrigida em 2026-10 — ver M-2026-027: o titular é
 * Leandro, não a Rute que ocupou a vaga gerada pelo desligamento dele).
 * Vaga pendente/reservada/aguardando aprovação do gestor nunca entra aqui —
 * só preenchimento já concluído, e só quando a origem é aumento_quadro. */
function ColaboradorCelula({ m }: { m: Movimentacao }) {
  const { vagas } = usePortalData();
  const vagasDaMp = vagas.filter((v) => v.movimentacaoId === m.id && v.origem === "aumento_quadro");
  const nomePadrao = nomeExibicaoMovimentacao(m.colaborador);
  if (vagasDaMp.length === 0) return <>{nomePadrao}</>;

  const nomes = Array.from(
    new Set(vagasDaMp.filter((v) => v.status === "preenchida" && v.novoColaboradorNome).map((v) => v.novoColaboradorNome as string)),
  );
  if (nomes.length === 0) return <>{nomePadrao}</>;

  const visiveis = nomes.slice(0, 2);
  const restantes = nomes.length - visiveis.length;
  return (
    <div className={styles.celulaColaborador}>
      {visiveis.map((nome) => (
        <div key={nome}>{nome}</div>
      ))}
      {restantes > 0 && <div className={styles.celulaColaboradorMais}>+{restantes}</div>}
    </div>
  );
}

export function AprovadasPage() {
  const { movimentacoesVisiveis } = usePortalData();
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link "Cadeia da movimentação" (RH, 2026-09) — abrir /aprovadas?mp=ID
  // seleciona direto essa MP, reaproveitando o mesmo detalhe já existente
  // (ver CadeiaMovimentacaoBloco.tsx). Toda MP linkável ali já é Aprovada/
  // Concluída (só uma MP nesse estado gera/preenche vaga), então esta tela é
  // sempre o destino certo.
  const [selecionado, setSelecionado] = useState<string | null>(() => searchParams.get("mp"));

  // Re-sincroniza se o parâmetro mudar com o componente já montado — ex.:
  // clicar num link da Cadeia da movimentação (CadeiaMovimentacaoBloco.tsx)
  // enquanto já se está em /aprovadas vendo outra MP (mesma rota, não
  // remonta, então o useState inicial sozinho não pegaria a troca).
  useEffect(() => {
    const mp = searchParams.get("mp");
    if (mp) setSelecionado(mp);
  }, [searchParams]);

  const aprovadas = useMemo(
    () => movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído"),
    [movimentacoesVisiveis],
  );

  const movimentacao = useMemo(() => aprovadas.find((m) => m.id === selecionado) || null, [aprovadas, selecionado]);

  function voltar() {
    setSelecionado(null);
    if (searchParams.has("mp")) {
      const proximos = new URLSearchParams(searchParams);
      proximos.delete("mp");
      setSearchParams(proximos, { replace: true });
    }
  }

  if (movimentacao) {
    return (
      <>
        <Header />
        <div className={styles.acaoCartaDetalhe}>
          <AcaoCarta m={movimentacao} />
        </div>
        <MovimentacaoDetalhe movimentacao={movimentacao} onVoltar={voltar} />
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
                  <td>
                    <ColaboradorCelula m={m} />
                  </td>
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
