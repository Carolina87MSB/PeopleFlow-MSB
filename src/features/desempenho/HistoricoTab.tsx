import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState, tableStyles } from "../../components/ui";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { montarHistoricoColaborador } from "../../domain/historicoDesempenho";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador } from "../../types/domain";
import { HistoricoDrawer } from "./HistoricoDrawer";
import { HistoricoLinhaDoTempo } from "./HistoricoLinhaDoTempo";
import styles from "./HistoricoTab.module.css";

/** Histórico da Gestão de Desempenho (Etapa 9) — linha do tempo por colaborador
 * de todos os ciclos já realizados (nota oficial de desempenho/potencial,
 * posição na Matriz 9 Box, status do PDI, data da devolutiva, status do
 * ciclo). RH e Diretoria veem a empresa toda; Gestor só a própria equipe
 * (`colaboradoresParaHistorico` em usePortalData.ts); Colaborador vê direto a
 * própria linha do tempo, sem lista/filtro — a busca (seção 3 do spec) só faz
 * sentido pra quem tem mais de 1 colaborador pra encontrar. */
export function HistoricoTab() {
  const {
    conta,
    perfil,
    colaboradoresParaHistorico,
    avaliacoesDesempenho,
    avaliacoesPotencial,
    pdi,
    ciclosAvaliacaoDesempenho,
    configAvaliacaoDesempenho,
  } = usePortalData();

  const [busca, setBusca] = useState("");
  const [gestorFiltro, setGestorFiltro] = useState("Todos");
  const [setorFiltro, setSetorFiltro] = useState("Todos");
  const [cargoFiltro, setCargoFiltro] = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState<"Ativo" | "Inativo" | "Todos">("Ativo");
  const [cicloFiltro, setCicloFiltro] = useState("Todos");
  const [colaboradorAberto, setColaboradorAberto] = useState<Colaborador | null>(null);

  // Todos os hooks rodam incondicionalmente (mesmo pro perfil Colaborador, que
  // não usa a maior parte deles) — evita risco de hooks condicionais.
  const linhasProprio = useMemo(
    () => montarHistoricoColaborador(conta.nome, ciclosAvaliacaoDesempenho, avaliacoesDesempenho, avaliacoesPotencial, pdi, configAvaliacaoDesempenho),
    [conta.nome, ciclosAvaliacaoDesempenho, avaliacoesDesempenho, avaliacoesPotencial, pdi, configAvaliacaoDesempenho],
  );

  const opcoesGestor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaHistorico.map((c) => c.gestor).filter(Boolean))).sort()],
    [colaboradoresParaHistorico],
  );
  const opcoesSetor = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaHistorico.map((c) => c.depto).filter(Boolean))).sort()],
    [colaboradoresParaHistorico],
  );
  const opcoesCargo = useMemo(
    () => ["Todos", ...Array.from(new Set(colaboradoresParaHistorico.map((c) => c.cargo).filter(Boolean))).sort()],
    [colaboradoresParaHistorico],
  );

  // Nomes com pelo menos 1 ficha (GESTOR ou Potencial) no ciclo selecionado —
  // só calculado quando um ciclo específico está selecionado ("Todos" não
  // filtra nada aqui, cada linha da lista é 1 colaborador, não 1 nota
  // agregada, então não há risco de dupla-contagem em manter "Todos").
  const nomesComFichaNoCiclo = useMemo(() => {
    if (cicloFiltro === "Todos") return null;
    const nomes = new Set<string>();
    for (const a of avaliacoesDesempenho) if (a.tipo === "GESTOR" && a.cicloId === cicloFiltro) nomes.add(a.colaboradorNome);
    for (const a of avaliacoesPotencial) if (a.cicloId === cicloFiltro) nomes.add(a.colaboradorNome);
    return nomes;
  }, [avaliacoesDesempenho, avaliacoesPotencial, cicloFiltro]);

  const colaboradoresFiltrados = useMemo(
    () =>
      colaboradoresParaHistorico.filter(
        (c) =>
          (busca.trim() === "" || c.nome.toLowerCase().includes(busca.trim().toLowerCase())) &&
          (gestorFiltro === "Todos" || c.gestor === gestorFiltro) &&
          (setorFiltro === "Todos" || c.depto === setorFiltro) &&
          (cargoFiltro === "Todos" || c.cargo === cargoFiltro) &&
          (statusFiltro === "Todos" || (statusFiltro === "Ativo" ? !c.desligado : c.desligado)) &&
          (nomesComFichaNoCiclo === null || nomesComFichaNoCiclo.has(c.nome)),
      ),
    [colaboradoresParaHistorico, busca, gestorFiltro, setorFiltro, cargoFiltro, statusFiltro, nomesComFichaNoCiclo],
  );

  const linhasAberto = useMemo(
    () =>
      colaboradorAberto
        ? montarHistoricoColaborador(
            colaboradorAberto.nome,
            ciclosAvaliacaoDesempenho,
            avaliacoesDesempenho,
            avaliacoesPotencial,
            pdi,
            configAvaliacaoDesempenho,
          )
        : [],
    [colaboradorAberto, ciclosAvaliacaoDesempenho, avaliacoesDesempenho, avaliacoesPotencial, pdi, configAvaliacaoDesempenho],
  );

  if (perfil === "Colaborador") {
    return (
      <>
        <div className={styles.topo}>
          <p className={styles.explicacao}>Sua linha do tempo de Avaliação de Desempenho, ciclo a ciclo.</p>
        </div>
        <HistoricoLinhaDoTempo linhas={linhasProprio} />
      </>
    );
  }

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Consulte a evolução de qualquer colaborador ao longo dos ciclos de Avaliação de Desempenho — nota oficial,
          posição na Matriz 9 Box, status do PDI e da devolutiva.
        </p>
      </div>

      <div className={styles.filtros}>
        <div className={styles.busca}>
          <Search size={15} strokeWidth={1.8} />
          <input placeholder="Buscar colaborador..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className={styles.select} value={gestorFiltro} onChange={(e) => setGestorFiltro(e.target.value)}>
          {opcoesGestor.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os gestores" : o}
            </option>
          ))}
        </select>
        <select className={styles.select} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
          {opcoesSetor.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Todos os setores" : o}
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
        <select className={styles.select} value={cicloFiltro} onChange={(e) => setCicloFiltro(e.target.value)}>
          <option value="Todos">Todos os ciclos</option>
          {ciclosAvaliacaoDesempenho.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {colaboradoresFiltrados.length === 0 ? (
        <EmptyState message="Nenhum colaborador encontrado com os filtros atuais." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Setor</th>
                <th>Gestor</th>
              </tr>
            </thead>
            <tbody>
              {colaboradoresFiltrados.map((c) => (
                <tr key={c.nome} className={tableStyles.clickable} onClick={() => setColaboradorAberto(c)}>
                  <td>{c.nome}</td>
                  <td>{formatarNomeCargo(c.cargo)}</td>
                  <td>{c.depto}</td>
                  <td>{c.gestor || <span>Sem gestor</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colaboradorAberto && <HistoricoDrawer colaborador={colaboradorAberto} linhas={linhasAberto} onClose={() => setColaboradorAberto(null)} />}
    </>
  );
}
