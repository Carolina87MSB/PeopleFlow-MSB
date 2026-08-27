import { Fragment, useCallback, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { EmptyState, Modal } from "../../components/ui";
import { posicionarMatriz9Box } from "../../domain/matriz9Box";
import type { PosicaoMatriz9Box } from "../../domain/matriz9Box";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { EXPLICACAO_DESEMPENHO, EXPLICACAO_POTENCIAL, ORIENTACAO_GERAL_9BOX, orientacaoDoQuadrante } from "../../domain/orientacaoMatriz9Box";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho, AvaliacaoPotencial, Colaborador, FaixaMatriz9Box } from "../../types/domain";
import { Matriz9BoxDrawer } from "./Matriz9BoxDrawer";
import styles from "./Matriz9BoxTab.module.css";

const LINHAS_POTENCIAL: FaixaMatriz9Box[] = ["Alto", "Médio", "Baixo"];
const COLUNAS_DESEMPENHO: FaixaMatriz9Box[] = ["Baixo", "Médio", "Alto"];

export interface EntradaMatriz9Box {
  colaborador: Colaborador;
  notaDesempenho: number;
  notaPotencial: number;
  posicao: PosicaoMatriz9Box;
  ciclo: string;
}

/** Matriz 9 Box (Etapa 5) — view puramente derivada, sem edição manual de
 * posição: cruza a nota final da avaliação GESTOR (Concluída) com a nota de
 * Potencial (Concluída) do ciclo selecionado. Sem uma das duas, o
 * colaborador simplesmente não aparece plotado (nada de preenchimento
 * manual). Toda alteração de posição só acontece reabrindo/reconcluindo as
 * avaliações de origem (AVD/Potencial), nunca aqui. */
export function Matriz9BoxTab() {
  const {
    colaboradoresParaMatriz9Box,
    avaliacoesDesempenho,
    avaliacoesPotencial,
    ciclosAvaliacaoDesempenho,
    configAvaliacaoDesempenho,
  } = usePortalData();

  const [cicloId, setCicloId] = useState(() => ciclosAvaliacaoDesempenho[0]?.id ?? "");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [gestorFiltro, setGestorFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState<"Ativo" | "Inativo" | "Todos">("Ativo");
  const [entradaAberta, setEntradaAberta] = useState<EntradaMatriz9Box | null>(null);
  const [mostrarOrientacaoGeral, setMostrarOrientacaoGeral] = useState(false);
  const [quadranteInfoAberto, setQuadranteInfoAberto] = useState<{ potencial: FaixaMatriz9Box; desempenho: FaixaMatriz9Box } | null>(
    null,
  );

  const cicloSelecionado = ciclosAvaliacaoDesempenho.find((c) => c.id === cicloId) ?? ciclosAvaliacaoDesempenho[0] ?? null;

  // Fichas GESTOR Homologadas do ciclo selecionado, indexadas por
  // colaborador — o filtro é por statusCalibracao === "Homologada"
  // explicitamente (Etapa 6: Comitê de Calibração), nunca por
  // status === "Concluída"/nota-não-nula: uma ficha só "Concluída" (nem
  // sequer entrou em calibração ainda) ou uma "Aguardando Calibração" não é
  // definitiva — só depois de homologada a Nota Oficial (notaFinalOficial/
  // notaOficial) é o que a Matriz consome, nunca a nota bruta do gestor.
  const gestorPorColaborador = useMemo(() => {
    const mapa = new Map<string, AvaliacaoDesempenho>();
    if (!cicloSelecionado) return mapa;
    for (const a of avaliacoesDesempenho) {
      if (a.tipo === "GESTOR" && a.statusCalibracao === "Homologada" && a.cicloId === cicloSelecionado.id) {
        mapa.set(a.colaboradorNome, a);
      }
    }
    return mapa;
  }, [avaliacoesDesempenho, cicloSelecionado]);

  const potencialPorColaborador = useMemo(() => {
    const mapa = new Map<string, AvaliacaoPotencial>();
    if (!cicloSelecionado) return mapa;
    for (const a of avaliacoesPotencial) {
      if (a.statusCalibracao === "Homologada" && a.cicloId === cicloSelecionado.id) {
        mapa.set(a.colaboradorNome, a);
      }
    }
    return mapa;
  }, [avaliacoesPotencial, cicloSelecionado]);

  /** Liderança pra agrupar/filtrar aqui é sempre `gestorAvaliador` (quem de
   * fato avaliou o colaborador NESTE ciclo, congelado na própria ficha) —
   * nunca `colaborador.gestor` (atual/ao vivo): uma promoção/transferência
   * depois do ciclo não pode reatribuir retroativamente a quem avaliou.
   * Cai pro gestor atual só quando ainda não existe ficha GESTOR homologada
   * pra essa pessoa neste ciclo (senão ela não apareceria em filtro nenhum
   * antes da calibração). */
  const liderancaDoCiclo = useCallback(
    (colaborador: Colaborador): string => gestorPorColaborador.get(colaborador.nome)?.gestorAvaliador || colaborador.gestor,
    [gestorPorColaborador],
  );

  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaMatriz9Box.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresParaMatriz9Box],
  );
  const opcoesGestor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaMatriz9Box.map(liderancaDoCiclo).filter(Boolean))).sort()],
    [colaboradoresParaMatriz9Box, liderancaDoCiclo],
  );
  const opcoesCargo = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaMatriz9Box.map((c) => c.cargo).filter(Boolean))).sort()],
    [colaboradoresParaMatriz9Box],
  );

  const colaboradoresFiltrados = useMemo(
    () =>
      colaboradoresParaMatriz9Box.filter(
        (c) =>
          (departamentoFiltro === "Todos" || c.depto === departamentoFiltro) &&
          (gestorFiltro === "Todos" || liderancaDoCiclo(c) === gestorFiltro) &&
          (cargoFiltro === "Todos" || c.cargo === cargoFiltro) &&
          (statusFiltro === "Todos" || (statusFiltro === "Ativo" ? !c.desligado : c.desligado)),
      ),
    [colaboradoresParaMatriz9Box, liderancaDoCiclo, departamentoFiltro, gestorFiltro, cargoFiltro, statusFiltro],
  );

  const { entradas, semPosicao } = useMemo(() => {
    if (!cicloSelecionado) return { entradas: [] as EntradaMatriz9Box[], semPosicao: 0 };

    const entradasResult: EntradaMatriz9Box[] = [];
    let semPosicaoResult = 0;
    for (const colaborador of colaboradoresFiltrados) {
      const avaliacaoGestor = gestorPorColaborador.get(colaborador.nome);
      const avaliacaoPotencial = potencialPorColaborador.get(colaborador.nome);
      const notaDesempenho = avaliacaoGestor?.notaFinalOficial ?? null;
      const notaPotencial = avaliacaoPotencial?.notaOficial ?? null;
      const posicao = posicionarMatriz9Box(notaDesempenho, notaPotencial, configAvaliacaoDesempenho);
      if (!posicao || notaDesempenho === null || notaPotencial === null) {
        semPosicaoResult += 1;
        continue;
      }
      entradasResult.push({ colaborador, notaDesempenho, notaPotencial, posicao, ciclo: cicloSelecionado.nome });
    }
    return { entradas: entradasResult, semPosicao: semPosicaoResult };
  }, [colaboradoresFiltrados, gestorPorColaborador, potencialPorColaborador, cicloSelecionado, configAvaliacaoDesempenho]);

  if (ciclosAvaliacaoDesempenho.length === 0) {
    return <EmptyState message="Nenhum ciclo de Avaliação de Desempenho aberto ainda." />;
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Posição calculada automaticamente a partir da Nota Oficial de Desempenho e da Nota Oficial de Potencial —
          só depois que as duas avaliações são homologadas pelo RH (aba Calibração). Sem preenchimento manual: pra
          mudar a posição de alguém, calibre/atualize as avaliações de origem.
        </p>
        <button
          type="button"
          className={styles.orientacaoBtn}
          onClick={() => setMostrarOrientacaoGeral((v) => !v)}
        >
          <HelpCircle size={14} /> Como interpretar a 9 Box
        </button>
      </div>

      {mostrarOrientacaoGeral && (
        <div className={styles.orientacaoGeral}>
          <p>{ORIENTACAO_GERAL_9BOX}</p>
          <div className={styles.orientacaoDimensoes}>
            <div>
              <strong>Desempenho</strong>
              <p>{EXPLICACAO_DESEMPENHO}</p>
            </div>
            <div>
              <strong>Potencial</strong>
              <p>{EXPLICACAO_POTENCIAL}</p>
            </div>
          </div>
        </div>
      )}

      <div className={styles.filtros}>
        <select className={styles.select} value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
          {ciclosAvaliacaoDesempenho.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select className={styles.select} value={departamentoFiltro} onChange={(e) => setDepartamentoFiltro(e.target.value)}>
          {opcoesDepartamento.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os departamentos" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={gestorFiltro} onChange={(e) => setGestorFiltro(e.target.value)}>
          {opcoesGestor.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os gestores" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={cargoFiltro} onChange={(e) => setCargoFiltro(e.target.value)}>
          {opcoesCargo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os cargos" : formatarNomeCargo(o)}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}>
          <option value="Ativo">Ativos</option>
          <option value="Inativo">Inativos</option>
          <option value="Todos">Todos (ativos e inativos)</option>
        </select>
      </div>

      {semPosicao > 0 && (
        <p className={styles.semPosicao}>
          {semPosicao} colaborador(es) sem posição neste ciclo (avaliação de desempenho e/ou de potencial ainda não
          concluída, ou aguardando homologação do RH na aba Calibração).
        </p>
      )}

      <div className={styles.grade}>
        <div className={styles.eixoCanto} />
        {COLUNAS_DESEMPENHO.map((coluna) => (
          <div key={coluna} className={styles.eixoDesempenho}>
            Desempenho: {coluna}
          </div>
        ))}
        {LINHAS_POTENCIAL.map((linha) => (
          <Fragment key={linha}>
            <div className={styles.eixoPotencial}>
              Potencial: {linha}
            </div>
            {COLUNAS_DESEMPENHO.map((coluna) => {
              const doQuadrante = entradas.filter((e) => e.posicao.faixaPotencial === linha && e.posicao.faixaDesempenho === coluna);
              return (
                <div key={`${linha}-${coluna}`} className={styles.celula}>
                  <div className={styles.celulaHeader}>
                    <span className={styles.celulaTitulo}>{orientacaoDoQuadrante(linha, coluna).nome}</span>
                    <button
                      type="button"
                      className={styles.infoBtn}
                      title="O que este quadrante significa"
                      onClick={() => setQuadranteInfoAberto({ potencial: linha, desempenho: coluna })}
                    >
                      <HelpCircle size={13} />
                    </button>
                  </div>
                  {doQuadrante.length === 0 ? (
                    <span className={styles.celulaVazia}>Nenhum colaborador</span>
                  ) : (
                    <div className={styles.marcadores}>
                      {doQuadrante.map((entrada) => (
                        <button
                          key={entrada.colaborador.nome}
                          type="button"
                          className={styles.marcador}
                          onClick={() => setEntradaAberta(entrada)}
                        >
                          <span className={styles.marcadorNome}>{entrada.colaborador.nome}</span>
                          <span className={styles.marcadorDetalhe}>
                            {formatarNomeCargo(entrada.colaborador.cargo)} · {entrada.colaborador.depto}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {entradaAberta && <Matriz9BoxDrawer entrada={entradaAberta} onClose={() => setEntradaAberta(null)} />}

      {quadranteInfoAberto &&
        (() => {
          const orientacao = orientacaoDoQuadrante(quadranteInfoAberto.potencial, quadranteInfoAberto.desempenho);
          return (
            <Modal title={orientacao.nome} onClose={() => setQuadranteInfoAberto(null)} width={380}>
              <div className={styles.infoRapida}>
                <div>
                  <span className={styles.infoRapidaLabel}>O que significa</span>
                  <p>{orientacao.oQueSignifica}</p>
                </div>
                <div>
                  <span className={styles.infoRapidaLabel}>Principal ponto de atenção</span>
                  <p>{orientacao.principalPontoDeAtencao}</p>
                </div>
                <div>
                  <span className={styles.infoRapidaLabel}>Próximo passo recomendado</span>
                  <p>{orientacao.proximoPasso}</p>
                </div>
              </div>
            </Modal>
          );
        })()}
    </>
  );
}
