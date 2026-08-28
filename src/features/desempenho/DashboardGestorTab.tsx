import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { BarChart, Button, Card, EmptyState, KpiCard } from "../../components/ui";
import {
  distribuicaoMatriz9Box,
  evolucaoPorCiclo,
  filtrarFichasGestor,
  filtrarPotencial,
  mediaNotasOficiais,
  mediasPorCompetencia,
} from "../../domain/dashboardDesempenho";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { baixarArquivo, gerarCsv, type SecaoCsv } from "../../lib/exportacaoCsv";
import { usePortalData } from "../../store/usePortalData";
import type { FiltrosDashboard } from "../../domain/dashboardDesempenho";
import type { StatusAvaliacaoDesempenho, StatusPdi } from "../../types/domain";
import { Matriz9BoxDistribuicao } from "./Matriz9BoxDistribuicao";
import { RankingLista } from "./RankingLista";
import styles from "./DashboardDesempenho.module.css";

const STATUS_AVALIACAO: (StatusAvaliacaoDesempenho | "Todos")[] = ["Todos", "Não iniciada", "Em andamento", "Concluída", "Não Elegível"];

/** Dashboard do Gestor (Etapa 8) — só a própria equipe, via
 * `colaboradoresParaMatriz9Box` (gestor ATUAL === me OU quem `me` avaliou
 * como GESTOR em algum ciclo — união, ver `colaboradoresEquipe` abaixo).
 * Read-only, puramente derivado dos dados já existentes. */
export function DashboardGestorTab() {
  const {
    colaboradoresParaMatriz9Box,
    avaliacoesDesempenho,
    avaliacoesPotencial,
    ciclosAvaliacaoDesempenho,
    pdi,
    configAvaliacaoDesempenho,
    notasLiderancaVisiveis,
  } = usePortalData();

  const [cicloId, setCicloId] = useState(() => ciclosAvaliacaoDesempenho[0]?.id ?? "");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusAvaliacaoDesempenho | "Todos">("Todos");

  // Mesma população de `colaboradoresParaMatriz9Box` (gestor ATUAL === me OU
  // quem `me` avaliou como GESTOR em algum ciclo — união, já resolvida em
  // usePortalData.ts), só que restrita a ativos: uma promoção/transferência
  // depois do ciclo não pode fazer a pessoa sumir do dashboard/PDI de quem de
  // fato a avaliou (achado real: Auxiliares de Produção e Ana Maria mudaram
  // de gestor depois do 2º Ciclo e sumiam da visão de Tainara, que foi quem
  // realmente as avaliou).
  const colaboradoresEquipe = useMemo(
    () => colaboradoresParaMatriz9Box.filter((c) => !c.desligado),
    [colaboradoresParaMatriz9Box],
  );

  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresEquipe.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresEquipe],
  );
  const opcoesCargo = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresEquipe.map((c) => c.cargo).filter(Boolean))).sort()],
    [colaboradoresEquipe],
  );

  const nomesPopulacao = useMemo(() => new Set(colaboradoresEquipe.map((c) => c.nome)), [colaboradoresEquipe]);
  const fichasPopulacao = useMemo(
    () => avaliacoesDesempenho.filter((f) => nomesPopulacao.has(f.colaboradorNome)),
    [avaliacoesDesempenho, nomesPopulacao],
  );
  const potencialPopulacao = useMemo(
    () => avaliacoesPotencial.filter((a) => nomesPopulacao.has(a.colaboradorNome)),
    [avaliacoesPotencial, nomesPopulacao],
  );
  const pdiPopulacao = useMemo(() => pdi.filter((p) => nomesPopulacao.has(p.colaboradorNome)), [pdi, nomesPopulacao]);

  // Sem filtro de gestor aqui — a população já vem restrita à própria
  // equipe (colaboradoresEquipe), então um sub-filtro por gestor seria
  // redundante.
  const filtros: FiltrosDashboard = useMemo(
    () => ({ cicloId, departamento: departamentoFiltro, gestor: "Todos", cargo: cargoFiltro, statusAvaliacao: statusFiltro }),
    [cicloId, departamentoFiltro, cargoFiltro, statusFiltro],
  );

  const fichasFiltradas = useMemo(() => filtrarFichasGestor(fichasPopulacao, filtros), [fichasPopulacao, filtros]);
  const fichasHomologadas = useMemo(() => fichasFiltradas.filter((f) => f.statusCalibracao === "Homologada"), [fichasFiltradas]);
  const fichasConcluidas = useMemo(() => fichasFiltradas.filter((f) => f.status === "Concluída"), [fichasFiltradas]);
  const potencialFiltradas = useMemo(() => filtrarPotencial(potencialPopulacao, filtros), [potencialPopulacao, filtros]);
  const potencialHomologadas = useMemo(() => potencialFiltradas.filter((a) => a.statusCalibracao === "Homologada"), [potencialFiltradas]);

  const fichasSemCiclo = useMemo(
    () => filtrarFichasGestor(fichasPopulacao, { ...filtros, cicloId: "" }).filter((f) => f.statusCalibracao === "Homologada"),
    [fichasPopulacao, filtros],
  );
  const evolucao = useMemo(() => evolucaoPorCiclo(fichasSemCiclo, ciclosAvaliacaoDesempenho), [fichasSemCiclo, ciclosAvaliacaoDesempenho]);

  const mediaEquipe = useMemo(() => mediaNotasOficiais(fichasHomologadas), [fichasHomologadas]);

  const paresMatriz = useMemo(() => {
    const potencialPorColaborador = new Map(potencialHomologadas.map((a) => [a.colaboradorNome, a]));
    return fichasHomologadas
      .map((f) => {
        const par = potencialPorColaborador.get(f.colaboradorNome);
        if (!par || f.notaFinalOficial === null || par.notaOficial === null) return null;
        return { notaDesempenho: f.notaFinalOficial, notaPotencial: par.notaOficial };
      })
      .filter((p): p is { notaDesempenho: number; notaPotencial: number } => p !== null);
  }, [fichasHomologadas, potencialHomologadas]);
  const distMatriz9Box = useMemo(() => distribuicaoMatriz9Box(paresMatriz, configAvaliacaoDesempenho), [paresMatriz, configAvaliacaoDesempenho]);

  const competencias = useMemo(() => mediasPorCompetencia(fichasConcluidas), [fichasConcluidas]);

  const avaliacoesPendentes = fichasFiltradas.filter((f) => f.status !== "Concluída" && f.status !== "Não Elegível").length;
  const devolutivasPendentes = fichasHomologadas.filter((f) => !f.devolutivaRealizada).length;

  const pdisFiltrados = useMemo(() => {
    const colaboradoresPorNome = new Map(colaboradoresEquipe.map((c) => [c.nome, c]));
    return pdiPopulacao.filter((p) => {
      const colaborador = colaboradoresPorNome.get(p.colaboradorNome);
      if (!colaborador) return false;
      return (
        (departamentoFiltro === "Todos" || colaborador.depto === departamentoFiltro) &&
        (cargoFiltro === "Todos" || colaborador.cargo === cargoFiltro)
      );
    });
  }, [pdiPopulacao, colaboradoresEquipe, departamentoFiltro, cargoFiltro]);
  const pdisPorStatus: Record<StatusPdi, number> = { "Não iniciado": 0, "Em andamento": 0, Concluído: 0 };
  for (const p of pdisFiltrados) pdisPorStatus[p.status] += 1;

  function exportarCsv() {
    const secoes: SecaoCsv[] = [
      { titulo: "Média da equipe", colunas: ["Média Oficial"], linhas: [[mediaEquipe ?? ""]] },
      { titulo: "Evolução da equipe por ciclo", colunas: ["Ciclo", "Média"], linhas: evolucao.map((e) => [e.ciclo, e.media ?? ""]) },
      { titulo: "Competências com maior/menor desempenho", colunas: ["Competência", "Média"], linhas: competencias.map((c) => [c.nome, c.media]) },
      {
        titulo: "Situação dos PDIs",
        colunas: ["Status", "Quantidade"],
        linhas: [
          ["Não iniciado", pdisPorStatus["Não iniciado"]],
          ["Em andamento", pdisPorStatus["Em andamento"]],
          ["Concluído", pdisPorStatus.Concluído],
        ],
      },
      {
        titulo: "Avaliações e devolutivas",
        colunas: ["Métrica", "Quantidade"],
        linhas: [
          ["Avaliações pendentes", avaliacoesPendentes],
          ["Devolutivas pendentes", devolutivasPendentes],
        ],
      },
    ];
    baixarArquivo(gerarCsv(secoes), "dashboard-gestor.csv", "text/csv;charset=utf-8;");
  }

  if (ciclosAvaliacaoDesempenho.length === 0) {
    return <EmptyState message="Nenhum ciclo de Avaliação de Desempenho aberto ainda." />;
  }

  return (
    <>
      <div className={styles.topoCard}>
        <div className={styles.topo}>
          <p className={styles.explicacao}>
            Visão da sua equipe — todas as métricas de nota usam a Nota Oficial (pós-homologação do Comitê de
            Calibração). Filtre por ciclo/departamento/cargo/status para refinar.
          </p>
          <div className={styles.acoes}>
            <Button icon={<Download size={14} />} onClick={exportarCsv}>
              Exportar CSV
            </Button>
            <Button icon={<Printer size={14} />} onClick={() => window.print()}>
              Exportar PDF
            </Button>
          </div>
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
        <select className={styles.select} value={cargoFiltro} onChange={(e) => setCargoFiltro(e.target.value)}>
          {opcoesCargo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os cargos" : formatarNomeCargo(o)}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}>
          {STATUS_AVALIACAO.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os status" : o}
            </option>
          ))}
        </select>
        </div>
      </div>

      <div className={styles.kpis}>
        <KpiCard label="Média da equipe (Oficial)" value={mediaEquipe ?? "—"} highlight />
        <KpiCard label="Avaliações pendentes" value={avaliacoesPendentes} />
        <KpiCard label="Devolutivas pendentes" value={devolutivasPendentes} highlight={devolutivasPendentes > 0} />
        <KpiCard label="PDIs não iniciados" value={pdisPorStatus["Não iniciado"]} />
        <KpiCard label="PDIs em andamento" value={pdisPorStatus["Em andamento"]} />
        <KpiCard label="PDIs concluídos" value={pdisPorStatus.Concluído} />
      </div>

      <div className={styles.mainGrid}>
        <Card>
          <h3 className={styles.cardTitle}>Evolução da equipe por ciclo</h3>
          {evolucao.length === 0 ? (
            <p className={styles.semDados}>Sem histórico ainda.</p>
          ) : (
            <BarChart data={evolucao.map((e) => ({ label: e.ciclo, value: e.media ?? 0, annotation: e.media?.toFixed(1) ?? "—" }))} />
          )}
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Distribuição da equipe na Matriz 9 Box</h3>
          <Matriz9BoxDistribuicao distribuicao={distMatriz9Box} />
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Minha nota de Liderança (recebida da equipe)</h3>
          {notasLiderancaVisiveis.length === 0 ? (
            <p className={styles.semDados}>Sem avaliações de liderança concluídas ainda.</p>
          ) : (
            <ul className={styles.notasLideranca}>
              {notasLiderancaVisiveis.map((n) => (
                <li key={n.cicloId}>
                  <span>{n.ciclo}</span>
                  <strong>{n.mediaFinal.toFixed(1)}</strong>
                  <span className={styles.notasLiderancaContagem}>
                    {n.quantidadeAvaliacoes} {n.quantidadeAvaliacoes === 1 ? "avaliação" : "avaliações"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={styles.spanAll}>
          <h3 className={styles.cardTitle}>Competências com menor/maior desempenho</h3>
          <div className={styles.rankingGrid}>
            <RankingLista titulo="Maior média" itens={competencias.slice(0, 5)} />
            <RankingLista titulo="Menor média" itens={competencias.slice(-5).reverse()} />
          </div>
        </Card>
      </div>
    </>
  );
}
