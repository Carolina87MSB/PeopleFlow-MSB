import { Fragment, useMemo, useState } from "react";
import { EmptyState } from "../../components/ui";
import { posicionarMatriz9Box } from "../../domain/matriz9Box";
import type { PosicaoMatriz9Box } from "../../domain/matriz9Box";
import { formatarNomeCargo } from "../../domain/formatoCargo";
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

  const cicloSelecionado = ciclosAvaliacaoDesempenho.find((c) => c.id === cicloId) ?? ciclosAvaliacaoDesempenho[0] ?? null;

  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaMatriz9Box.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresParaMatriz9Box],
  );
  const opcoesGestor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaMatriz9Box.map((c) => c.gestor).filter(Boolean))).sort()],
    [colaboradoresParaMatriz9Box],
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
          (gestorFiltro === "Todos" || c.gestor === gestorFiltro) &&
          (cargoFiltro === "Todos" || c.cargo === cargoFiltro) &&
          (statusFiltro === "Todos" || (statusFiltro === "Ativo" ? !c.desligado : c.desligado)),
      ),
    [colaboradoresParaMatriz9Box, departamentoFiltro, gestorFiltro, cargoFiltro, statusFiltro],
  );

  // Fichas Homologadas do ciclo selecionado, indexadas por colaborador — o
  // filtro é por statusCalibracao === "Homologada" explicitamente (Etapa 6:
  // Comitê de Calibração), nunca por status === "Concluída"/nota-não-nula:
  // uma ficha só "Concluída" (nem sequer entrou em calibração ainda) ou uma
  // "Aguardando Calibração" não é definitiva — só depois de homologada a
  // Nota Oficial (notaFinalOficial/notaOficial) é o que a Matriz consome,
  // nunca a nota bruta do gestor.
  const { entradas, semPosicao } = useMemo(() => {
    if (!cicloSelecionado) return { entradas: [] as EntradaMatriz9Box[], semPosicao: 0 };

    const gestorPorColaborador = new Map<string, AvaliacaoDesempenho>();
    for (const a of avaliacoesDesempenho) {
      if (a.tipo === "GESTOR" && a.statusCalibracao === "Homologada" && a.cicloId === cicloSelecionado.id) {
        gestorPorColaborador.set(a.colaboradorNome, a);
      }
    }
    const potencialPorColaborador = new Map<string, AvaliacaoPotencial>();
    for (const a of avaliacoesPotencial) {
      if (a.statusCalibracao === "Homologada" && a.cicloId === cicloSelecionado.id) {
        potencialPorColaborador.set(a.colaboradorNome, a);
      }
    }

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
  }, [colaboradoresFiltrados, avaliacoesDesempenho, avaliacoesPotencial, cicloSelecionado, configAvaliacaoDesempenho]);

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
      </div>

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
                  <span className={styles.celulaTitulo}>{doQuadrante[0]?.posicao.nomeQuadrante ?? ""}</span>
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
    </>
  );
}
