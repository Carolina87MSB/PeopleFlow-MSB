import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { BarChart, Button, Card, EmptyState, KpiCard } from "../../components/ui";
import {
  distribuicaoMatriz9Box,
  distribuicaoPorFaixa,
  evolucaoPorCiclo,
  filtrarFichasGestor,
  filtrarPotencial,
  mediaNotasOficiais,
  mediaPorSetor,
  mediasPorCompetencia,
  mediasPorKpi,
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

/** Dashboard do RH (Etapa 8) — painel gerencial, empresa toda
 * (`colaboradoresListagem`, que já dá visão total ao RH). Read-only,
 * puramente derivado dos dados já existentes. */
export function DashboardRHTab() {
  const {
    colaboradoresListagem,
    avaliacoesDesempenho,
    avaliacoesPotencial,
    ciclosAvaliacaoDesempenho,
    pdi,
    configAvaliacaoDesempenho,
  } = usePortalData();

  const [cicloId, setCicloId] = useState(() => ciclosAvaliacaoDesempenho[0]?.id ?? "");
  const [departamentoFiltro, setDepartamentoFiltro] = useState("Todos");
  const [gestorFiltro, setGestorFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusAvaliacaoDesempenho | "Todos">("Todos");

  const opcoesDepartamento = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresListagem.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresListagem],
  );
  const opcoesGestor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresListagem.map((c) => c.gestor).filter(Boolean))).sort()],
    [colaboradoresListagem],
  );
  const opcoesCargo = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresListagem.map((c) => c.cargo).filter(Boolean))).sort()],
    [colaboradoresListagem],
  );

  const nomesPopulacao = useMemo(() => new Set(colaboradoresListagem.map((c) => c.nome)), [colaboradoresListagem]);
  const fichasPopulacao = useMemo(
    () => avaliacoesDesempenho.filter((f) => nomesPopulacao.has(f.colaboradorNome)),
    [avaliacoesDesempenho, nomesPopulacao],
  );
  const potencialPopulacao = useMemo(
    () => avaliacoesPotencial.filter((a) => nomesPopulacao.has(a.colaboradorNome)),
    [avaliacoesPotencial, nomesPopulacao],
  );
  const pdiPopulacao = useMemo(() => pdi.filter((p) => nomesPopulacao.has(p.colaboradorNome)), [pdi, nomesPopulacao]);

  const filtros: FiltrosDashboard = useMemo(
    () => ({ cicloId, departamento: departamentoFiltro, gestor: gestorFiltro, cargo: cargoFiltro, statusAvaliacao: statusFiltro }),
    [cicloId, departamentoFiltro, gestorFiltro, cargoFiltro, statusFiltro],
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

  const mediaGeral = useMemo(() => mediaNotasOficiais(fichasHomologadas), [fichasHomologadas]);
  const porSetor = useMemo(() => mediaPorSetor(fichasHomologadas), [fichasHomologadas]);
  const distDesempenho = useMemo(
    () =>
      distribuicaoPorFaixa(
        fichasHomologadas.map((f) => f.notaFinalOficial),
        configAvaliacaoDesempenho?.matrizDesempenhoLimiteMedio ?? 3,
        configAvaliacaoDesempenho?.matrizDesempenhoLimiteAlto ?? 4,
      ),
    [fichasHomologadas, configAvaliacaoDesempenho],
  );
  const distPotencial = useMemo(
    () =>
      distribuicaoPorFaixa(
        potencialHomologadas.map((a) => a.notaOficial),
        configAvaliacaoDesempenho?.matrizPotencialLimiteMedio ?? 3,
        configAvaliacaoDesempenho?.matrizPotencialLimiteAlto ?? 4,
      ),
    [potencialHomologadas, configAvaliacaoDesempenho],
  );

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
  const kpis = useMemo(() => mediasPorKpi(fichasConcluidas), [fichasConcluidas]);
  const kpisComCargo = useMemo(() => kpis.map((k) => ({ nome: `${k.nome} (${formatarNomeCargo(k.cargo)})`, media: k.media })), [kpis]);

  const avaliacoesPendentes = fichasFiltradas.filter((f) => f.status !== "Concluída" && f.status !== "Não Elegível").length;
  const avaliacoesHomologadas = fichasHomologadas.length;
  const devolutivasPendentes = fichasHomologadas.filter((f) => !f.devolutivaRealizada).length;

  const pdisFiltrados = useMemo(() => {
    const colaboradoresPorNome = new Map(colaboradoresListagem.map((c) => [c.nome, c]));
    return pdiPopulacao.filter((p) => {
      const colaborador = colaboradoresPorNome.get(p.colaboradorNome);
      if (!colaborador) return false;
      return (
        (departamentoFiltro === "Todos" || colaborador.depto === departamentoFiltro) &&
        (gestorFiltro === "Todos" || colaborador.gestor === gestorFiltro) &&
        (cargoFiltro === "Todos" || colaborador.cargo === cargoFiltro)
      );
    });
  }, [pdiPopulacao, colaboradoresListagem, departamentoFiltro, gestorFiltro, cargoFiltro]);
  const pdisPorStatus: Record<StatusPdi, number> = { "Não iniciado": 0, "Em andamento": 0, Concluído: 0 };
  for (const p of pdisFiltrados) pdisPorStatus[p.status] += 1;

  function exportarCsv() {
    const secoes: SecaoCsv[] = [
      { titulo: "Média geral", colunas: ["Média Oficial"], linhas: [[mediaGeral ?? ""]] },
      { titulo: "Média por setor", colunas: ["Setor", "Média", "Quantidade"], linhas: porSetor.map((s) => [s.setor, s.media ?? "", s.quantidade]) },
      { titulo: "Evolução por ciclo", colunas: ["Ciclo", "Média"], linhas: evolucao.map((e) => [e.ciclo, e.media ?? ""]) },
      { titulo: "Distribuição de notas de desempenho", colunas: ["Faixa", "Quantidade"], linhas: distDesempenho.map((d) => [d.faixa, d.quantidade]) },
      { titulo: "Distribuição de notas de potencial", colunas: ["Faixa", "Quantidade"], linhas: distPotencial.map((d) => [d.faixa, d.quantidade]) },
      { titulo: "Competências com maior/menor média", colunas: ["Competência", "Média"], linhas: competencias.map((c) => [c.nome, c.media]) },
      { titulo: "KPIs com melhor/menor desempenho", colunas: ["KPI", "Média"], linhas: kpisComCargo.map((k) => [k.nome, k.media]) },
      {
        titulo: "Avaliações e devolutivas",
        colunas: ["Métrica", "Quantidade"],
        linhas: [
          ["Avaliações pendentes", avaliacoesPendentes],
          ["Avaliações homologadas", avaliacoesHomologadas],
          ["Devolutivas pendentes", devolutivasPendentes],
        ],
      },
      {
        titulo: "PDIs",
        colunas: ["Status", "Quantidade"],
        linhas: [
          ["Em andamento", pdisPorStatus["Em andamento"]],
          ["Concluído", pdisPorStatus.Concluído],
        ],
      },
    ];
    baixarArquivo(gerarCsv(secoes), "dashboard-rh.csv", "text/csv;charset=utf-8;");
  }

  if (ciclosAvaliacaoDesempenho.length === 0) {
    return <EmptyState message="Nenhum ciclo de Avaliação de Desempenho aberto ainda." />;
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Visão gerencial da empresa toda — todas as métricas de nota usam a Nota Oficial (pós-homologação do
          Comitê de Calibração). Filtre por ciclo/departamento/gestor/cargo/status para refinar.
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
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={gestorFiltro} onChange={(e) => setGestorFiltro(e.target.value)}>
          {opcoesGestor.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={cargoFiltro} onChange={(e) => setCargoFiltro(e.target.value)}>
          {opcoesCargo.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? o : formatarNomeCargo(o)}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}>
          {STATUS_AVALIACAO.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.kpis}>
        <KpiCard label="Média geral (Oficial)" value={mediaGeral ?? "—"} highlight />
        <KpiCard label="Avaliações pendentes" value={avaliacoesPendentes} />
        <KpiCard label="Avaliações homologadas" value={avaliacoesHomologadas} />
        <KpiCard label="Devolutivas pendentes" value={devolutivasPendentes} highlight={devolutivasPendentes > 0} />
        <KpiCard label="PDIs em andamento" value={pdisPorStatus["Em andamento"]} />
        <KpiCard label="PDIs concluídos" value={pdisPorStatus.Concluído} />
      </div>

      <div className={styles.mainGrid}>
        <Card>
          <h3 className={styles.cardTitle}>Média por setor</h3>
          {porSetor.length === 0 ? (
            <p className={styles.semDados}>Sem fichas homologadas neste ciclo/filtro.</p>
          ) : (
            <div className={styles.setorLista}>
              {porSetor.map((s) => (
                <div key={s.setor} className={styles.setorLinha}>
                  <span className={styles.setorNome}>{s.setor}</span>
                  <span className={styles.setorMedia}>{s.media ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Evolução por ciclo</h3>
          {evolucao.length === 0 ? (
            <p className={styles.semDados}>Sem histórico ainda.</p>
          ) : (
            <BarChart data={evolucao.map((e) => ({ label: e.ciclo, value: e.media ?? 0, annotation: e.media?.toFixed(1) ?? "—" }))} />
          )}
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Distribuição de notas de desempenho</h3>
          <BarChart data={distDesempenho.map((d) => ({ label: d.faixa, value: d.quantidade, annotation: String(d.quantidade) }))} />
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Distribuição de notas de potencial</h3>
          <BarChart data={distPotencial.map((d) => ({ label: d.faixa, value: d.quantidade, annotation: String(d.quantidade) }))} />
        </Card>

        <Card className={styles.spanAll}>
          <h3 className={styles.cardTitle}>Distribuição na Matriz 9 Box</h3>
          <Matriz9BoxDistribuicao distribuicao={distMatriz9Box} />
        </Card>

        <Card className={styles.spanAll}>
          <h3 className={styles.cardTitle}>Competências comportamentais</h3>
          <div className={styles.rankingGrid}>
            <RankingLista titulo="Maior média" itens={competencias.slice(0, 5)} />
            <RankingLista titulo="Menor média" itens={competencias.slice(-5).reverse()} />
          </div>
        </Card>

        <Card className={styles.spanAll}>
          <h3 className={styles.cardTitle}>KPIs (Competências Técnicas)</h3>
          <div className={styles.rankingGrid}>
            <RankingLista titulo="Melhor desempenho" itens={kpisComCargo.slice(0, 5)} />
            <RankingLista titulo="Menor desempenho" itens={kpisComCargo.slice(-5).reverse()} />
          </div>
        </Card>
      </div>
    </>
  );
}
