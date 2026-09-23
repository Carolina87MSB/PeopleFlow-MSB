import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ListChecks, Sparkles } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card, FilterChips, tableStyles } from "../../components/ui";
import { listarNecessidades, type OrigemNecessidade, type StatusNecessidade } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Abas, Carregando, Erro, EstadoVazio, Paginacao, Selo, type AbaDef } from "./componentes";
import { usePaginado } from "./hooks";
import { formatarData, ROTULO_ORIGEM, STATUS_NECESSIDADE } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

type AbaLnt = "necessidades" | "sugestoes";

const ABAS: AbaDef<AbaLnt>[] = [
  { id: "necessidades", rotulo: "Necessidades" },
  { id: "sugestoes", rotulo: "Sugestões" },
];

export default function LntPage() {
  const { aba } = useParams<{ aba?: string }>();
  const atual = ABAS.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/lnt/necessidades" replace />;
  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/lnt" abas={ABAS} atual={atual} />
      {atual === "necessidades" ? <NecessidadesAba /> : <SugestoesAba />}
    </>
  );
}

const FILTROS_STATUS: { rotulo: string; status: StatusNecessidade[] }[] = [
  { rotulo: "Em aberto", status: ["aberta", "planejada"] },
  { rotulo: "Atendidas", status: ["atendida"] },
  { rotulo: "Canceladas", status: ["cancelada"] },
  { rotulo: "Todas", status: ["aberta", "planejada", "atendida", "cancelada"] },
];

const PRIORIDADE: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

function NecessidadesAba() {
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const [filtro, setFiltro] = useState(FILTROS_STATUS[0].rotulo);
  const [origem, setOrigem] = useState<OrigemNecessidade | "">("");
  const status = FILTROS_STATUS.find((f) => f.rotulo === filtro)!.status;
  const { dados, erro, carregando, pagina, setPagina } = usePaginado((p) => listarNecessidades(p, status, origem || null), [filtro, origem]);

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Levantamento de Necessidades de Treinamento</h3>
          <p className={styles.cardSubtitle}>{perfil === "RH" ? "Todas as necessidades registradas" : "Necessidades da sua equipe"}</p>
        </div>
        <div className={styles.filtros}>
          <select className={styles.select} value={origem} onChange={(e) => setOrigem(e.target.value as OrigemNecessidade | "")} aria-label="Origem">
            <option value="">Todas as origens</option>
            {(Object.keys(ROTULO_ORIGEM) as OrigemNecessidade[]).map((o) => (
              <option key={o} value={o}>
                {ROTULO_ORIGEM[o]}
              </option>
            ))}
          </select>
          <FilterChips options={FILTROS_STATUS.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
        </div>
      </div>
      {erro ? (
        <Erro mensagem={erro} />
      ) : carregando || !dados ? (
        <Carregando />
      ) : dados.itens.length === 0 ? (
        <EstadoVazio icone={<ListChecks size={26} strokeWidth={1.6} />} titulo="Nenhuma necessidade registrada." />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Para</th>
                  <th>Necessidade</th>
                  <th>Origem</th>
                  <th>Prioridade</th>
                  <th>Prazo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((n) => (
                  <tr key={n.id}>
                    <td>
                      {n.colaborador_id ? (pessoaPorId.get(n.colaborador_id)?.nome ?? `Colaborador #${n.colaborador_id}`) : n.cargo_nome}
                      {!n.colaborador_id && <div className={styles.secundario}>Todos os ocupantes do cargo</div>}
                    </td>
                    <td>{n.descricao}</td>
                    <td className={styles.secundario}>{ROTULO_ORIGEM[n.origem]}</td>
                    <td className={styles.secundario}>{n.prioridade ? PRIORIDADE[n.prioridade] : "—"}</td>
                    <td className={styles.mono}>{formatarData(n.prazo)}</td>
                    <td>
                      <Selo tom={STATUS_NECESSIDADE[n.status].tom}>{STATUS_NECESSIDADE[n.status].rotulo}</Selo>
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

function SugestoesAba() {
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Sugestões de necessidade</h3>
          <p className={styles.cardSubtitle}>Geradas a partir de requisitos obrigatórios, revisões de POP, integração e PDI</p>
        </div>
      </div>
      <EstadoVazio
        icone={<Sparkles size={26} strokeWidth={1.6} />}
        titulo="Nenhuma sugestão no momento."
        descricao="As sugestões serão exibidas aqui conforme as origens forem configuradas. Aceitar uma sugestão registra a necessidade com a origem rastreável — sem alterar o PDI."
      />
    </Card>
  );
}
