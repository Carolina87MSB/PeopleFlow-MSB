import { Navigate, useParams } from "react-router-dom";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card, tableStyles } from "../../components/ui";
import { listarTreinamentos, type StatusTreinamento } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Abas, Carregando, Erro, EstadoVazio, Paginacao, Selo, type AbaDef } from "./componentes";
import { usePaginado } from "./hooks";
import { formatarCarga, formatarData, STATUS_TREINAMENTO } from "./rotulos";
import { ListaMestraAba } from "./ListaMestraAba";
import styles from "./Desenvolvimento.module.css";

type AbaTreinamentos = "agenda" | "concluidos" | "lista-mestra";

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
      {atual === "agenda" && (
        <ListaTreinamentos
          key="agenda"
          titulo="Agenda de treinamentos"
          subtitulo="Treinamentos planejados e em andamento"
          status={["planejado", "em_andamento"]}
          recentesPrimeiro={false}
          vazio="Não há treinamentos agendados."
          icone={<CalendarDays size={26} strokeWidth={1.6} />}
        />
      )}
      {atual === "concluidos" && (
        <ListaTreinamentos
          key="concluidos"
          titulo="Treinamentos concluídos"
          subtitulo="Realizados e encerrados, do mais recente para o mais antigo"
          status={["concluido"]}
          recentesPrimeiro
          vazio="Não há treinamentos concluídos."
          icone={<CheckCircle2 size={26} strokeWidth={1.6} />}
        />
      )}
      {atual === "lista-mestra" && <ListaMestraAba />}
    </>
  );
}

function ListaTreinamentos(props: {
  titulo: string;
  subtitulo: string;
  status: StatusTreinamento[];
  recentesPrimeiro: boolean;
  vazio: string;
  icone: React.ReactNode;
}) {
  const { perfil } = useDesenvolvimento();
  const { dados, erro, carregando, pagina, setPagina } = usePaginado((p) => listarTreinamentos(p, props.status, props.recentesPrimeiro), [props.status.join()]);
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{props.titulo}</h3>
          <p className={styles.cardSubtitle}>
            {props.subtitulo}
            {perfil === "Gestor" ? " com participantes da sua equipe" : ""}
          </p>
        </div>
      </div>
      {erro ? (
        <Erro mensagem={erro} />
      ) : carregando || !dados ? (
        <Carregando />
      ) : dados.itens.length === 0 ? (
        <EstadoVazio icone={props.icone} titulo={props.vazio} />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Treinamento</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Carga</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((t) => (
                  <tr key={t.id}>
                    <td className={styles.mono}>{t.codigo}</td>
                    <td>
                      {t.titulo}
                      {t.lista_mestra_codigo && <div className={styles.secundario}>{t.lista_mestra_codigo}</div>}
                    </td>
                    <td className={styles.secundario}>{t.tipo === "interno" ? "Interno" : "Externo"}</td>
                    <td className={styles.mono}>
                      {formatarData(t.data_inicio)}
                      {t.data_fim && t.data_fim !== t.data_inicio ? ` a ${formatarData(t.data_fim)}` : ""}
                    </td>
                    <td className={styles.mono}>{formatarCarga(t.carga_horaria_min)}</td>
                    <td>
                      <Selo tom={STATUS_TREINAMENTO[t.status].tom}>{STATUS_TREINAMENTO[t.status].rotulo}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} total={dados.total} onChange={setPagina} />
        </>
      )}
    </Card>
  );
}
