import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, Plus } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Button, Card, FilterChips, tableStyles } from "../../components/ui";
import { listarTreinamentos, type StatusTreinamento, type TipoTreinamento } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Abas, Carregando, Erro, EstadoVazio, Paginacao, Selo, TagTeste, type AbaDef } from "./componentes";
import { usePaginado } from "./hooks";
import { FORMATO, formatarCarga, formatarData, MODALIDADE, STATUS_TREINAMENTO, TIPO_TREINAMENTO } from "./rotulos";
import { ListaMestraAba } from "./ListaMestraAba";
import { TreinamentoDrawer } from "./TreinamentoForm";
import styles from "./Desenvolvimento.module.css";

type AbaTreinamentos = "agenda" | "concluidos" | "lista-mestra";

const FILTROS: Record<"agenda" | "concluidos", { rotulo: string; status: StatusTreinamento[] }[]> = {
  agenda: [
    { rotulo: "Todos", status: ["solicitado", "planejado", "em_andamento"] },
    { rotulo: "Solicitados", status: ["solicitado"] },
    { rotulo: "Planejados", status: ["planejado"] },
    { rotulo: "Em andamento", status: ["em_andamento"] },
  ],
  concluidos: [
    { rotulo: "Concluídos", status: ["concluido"] },
    { rotulo: "Cancelados", status: ["cancelado"] },
  ],
};

export default function TreinamentosPage() {
  const { perfil } = useDesenvolvimento();
  const { aba } = useParams<{ aba?: string }>();
  const abas: AbaDef<AbaTreinamentos>[] = [
    { id: "agenda", rotulo: "Agenda" },
    { id: "concluidos", rotulo: "Concluídos" },
    ...(perfil === "RH" ? [{ id: "lista-mestra" as const, rotulo: "Lista Mestra" }] : []),
  ];
  const atual = abas.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/treinamentos/agenda" replace />;

  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/treinamentos" abas={abas} atual={atual} />
      {atual === "agenda" && <ListaTreinamentos key="agenda" aba="agenda" />}
      {atual === "concluidos" && <ListaTreinamentos key="concluidos" aba="concluidos" />}
      {atual === "lista-mestra" && <ListaMestraAba />}
    </>
  );
}

function ListaTreinamentos({ aba }: { aba: "agenda" | "concluidos" }) {
  const { perfil, colaboradorId } = useDesenvolvimento();
  const navigate = useNavigate();
  const filtros = FILTROS[aba];
  const [filtro, setFiltro] = useState(filtros[0].rotulo);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState("");
  const [soConduzo, setSoConduzo] = useState(false);
  const [novo, setNovo] = useState(false);
  const status = filtros.find((f) => f.rotulo === filtro)!.status;
  const lista = usePaginado(
    (p) =>
      listarTreinamentos(p, {
        status,
        busca: termo,
        tipo: (tipo || null) as TipoTreinamento | null,
        recentesPrimeiro: aba === "concluidos",
        conduzidosPor: soConduzo ? colaboradorId : undefined,
      }),
    [filtro, termo, tipo, soConduzo],
  );
  const podeSolicitar = perfil === "RH" || perfil === "Gestor";
  const subtitulo =
    perfil === "Responsavel"
      ? "Treinamentos em que você é responsável ou instrutor"
      : perfil === "Gestor"
        ? "Da sua equipe, os que você solicitou e os que você conduz"
        : aba === "agenda"
          ? "Solicitados, planejados e em andamento"
          : "Realizados e encerrados, do mais recente para o mais antigo";

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{aba === "agenda" ? "Agenda de treinamentos" : "Treinamentos encerrados"}</h3>
          <p className={styles.cardSubtitle}>{subtitulo}</p>
        </div>
        {podeSolicitar && aba === "agenda" && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNovo(true)}>
            Solicitar treinamento
          </Button>
        )}
      </div>
      <div className={styles.toolbar}>
        <form
          className={styles.filtros}
          onSubmit={(e) => {
            e.preventDefault();
            setTermo(busca);
          }}
        >
          <input className={styles.input} type="search" placeholder="Buscar por título, código ou documento" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca)} />
          <select className={styles.select} style={{ minWidth: 160 }} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {(Object.keys(TIPO_TREINAMENTO) as TipoTreinamento[]).map((o) => (
              <option key={o} value={o}>
                {TIPO_TREINAMENTO[o]}
              </option>
            ))}
          </select>
          {perfil !== "Responsavel" && (
            <label className={styles.check}>
              <input type="checkbox" checked={soConduzo} onChange={(e) => setSoConduzo(e.target.checked)} /> Só os que conduzo
            </label>
          )}
        </form>
        <FilterChips options={filtros.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
      </div>
      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.itens.length === 0 ? (
        <EstadoVazio
          icone={aba === "agenda" ? <CalendarDays size={26} strokeWidth={1.6} /> : <CheckCircle2 size={26} strokeWidth={1.6} />}
          titulo={aba === "agenda" ? "Não há treinamentos na agenda." : "Não há treinamentos encerrados."}
        />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Treinamento</th>
                  <th>Tipo</th>
                  <th>Modalidade</th>
                  <th>Data</th>
                  <th>Carga</th>
                  <th>Participantes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.itens.map((t) => {
                  const data = aba === "concluidos" ? (t.data_realizacao ?? t.data_inicio) : t.data_inicio;
                  return (
                    <tr key={t.id} className={[styles.linhaClicavel, t.status === "cancelado" ? styles.linhaInativa : ""].join(" ")} onClick={() => navigate(`/desenvolvimento/treinamento/${t.id}`)}>
                      <td className={styles.mono}>{t.codigo}</td>
                      <td>
                        {t.titulo}
                        {t.homologacao && <TagTeste />}
                        {t.lista_mestra_codigo && (
                          <div className={styles.secundario}>
                            {t.lista_mestra_codigo} rev. {t.lista_mestra_revisao}
                          </div>
                        )}
                        {t.reposicao_numero && <div className={styles.secundario}>Reposição {t.reposicao_numero}</div>}
                      </td>
                      <td className={styles.secundario}>{TIPO_TREINAMENTO[t.tipo]}</td>
                      <td className={styles.secundario}>
                        {MODALIDADE[t.modalidade]}
                        {t.formato && <div>{FORMATO[t.formato]}</div>}
                      </td>
                      <td className={styles.mono}>
                        {formatarData(data)}
                        {aba === "agenda" && t.data_fim && t.data_fim !== t.data_inicio ? ` a ${formatarData(t.data_fim)}` : ""}
                      </td>
                      <td className={styles.mono}>{formatarCarga(t.carga_realizada_min ?? t.carga_horaria_min)}</td>
                      <td className={styles.mono}>{t.participantes?.[0]?.count ?? 0}</td>
                      <td>
                        <Selo tom={STATUS_TREINAMENTO[t.status].tom}>{STATUS_TREINAMENTO[t.status].rotulo}</Selo>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={lista.pagina} total={lista.dados.total} onChange={lista.setPagina} />
        </>
      )}
      {novo && <TreinamentoDrawer item={null} onFechar={() => setNovo(false)} onSalvo={(t) => navigate(`/desenvolvimento/treinamento/${t.id}`)} />}
    </Card>
  );
}
