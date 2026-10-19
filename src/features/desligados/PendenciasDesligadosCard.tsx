import { useEffect, useMemo, useState } from "react";
import { EmptyState, tableStyles } from "../../components/ui";
import { pendenciasFrontDeDesligados, type PendenciaDesligado } from "../../domain/pendenciasDesligados";
import { getPendenciasDesenvolvimentoDeDesligados } from "../../repositories/pendenciasDesligadosRepository";
import { usePortalStore } from "../../store/PortalStoreContext";
import styles from "./DesligadosPage.module.css";

/**
 * Pendências ligadas a colaboradores desligados (somente RH). Só LISTA o que ainda está aberto — nada é encerrado, concluído ou
 * reatribuído automaticamente; cada linha diz o módulo, o processo, a pessoa e a ação recomendada.
 */
export function PendenciasDesligadosCard() {
  const { state } = usePortalStore();
  const [doServidor, setDoServidor] = useState<PendenciaDesligado[] | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getPendenciasDesenvolvimentoDeDesligados()
      .then((dados) => ativo && setDoServidor(dados))
      .catch((e: unknown) => ativo && setErroServidor(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      ativo = false;
    };
  }, [state.colaboradores]);

  const doFront = useMemo(
    () =>
      pendenciasFrontDeDesligados({
        colaboradores: state.colaboradores,
        ciclos: state.ciclosAvaliacaoDesempenho,
        avaliacoesDesempenho: state.avaliacoesDesempenho,
        avaliacoesPotencial: state.avaliacoesPotencial,
        pdi: state.pdi,
        movimentacoes: state.movimentacoes,
        desligamentosFinanceiros: state.desligamentosFinanceiros,
      }),
    [state.colaboradores, state.ciclosAvaliacaoDesempenho, state.avaliacoesDesempenho, state.avaliacoesPotencial, state.pdi, state.movimentacoes, state.desligamentosFinanceiros],
  );

  const todas = useMemo(() => [...doFront, ...(doServidor ?? [])].sort((a, b) => a.modulo.localeCompare(b.modulo, "pt-BR") || a.colaborador.localeCompare(b.colaborador, "pt-BR")), [doFront, doServidor]);

  return (
    <section style={{ marginTop: 28 }} aria-labelledby="pendencias-desligados-titulo">
      <h3 id="pendencias-desligados-titulo" className={styles.sectionTitle}>
        Pendências ligadas a colaboradores desligados ({todas.length})
      </h3>
      <p className={styles.semHistorico} style={{ marginBottom: 10 }}>
        Só uma lista para decisão do RH: nenhum processo é encerrado ou concluído automaticamente, e o histórico (avaliações, treinamentos, certificados, MPs) é preservado.
      </p>
      {erroServidor && <p className={styles.semHistorico}>Não foi possível carregar as pendências de Treinamentos/LNT agora ({erroServidor}). As demais estão listadas abaixo.</p>}
      {todas.length === 0 ? (
        <EmptyState message="Nenhuma pendência aberta ligada a colaboradores desligados." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Processo</th>
                <th>Colaborador</th>
                <th>Situação</th>
                <th>Ação recomendada</th>
              </tr>
            </thead>
            <tbody>
              {todas.map((p, i) => (
                <tr key={`${p.modulo}-${p.referencia ?? ""}-${p.colaborador}-${i}`}>
                  <td>{p.modulo}</td>
                  <td>{p.processo}</td>
                  <td>{p.colaborador}</td>
                  <td>{p.detalhe}</td>
                  <td>{p.acaoRecomendada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
