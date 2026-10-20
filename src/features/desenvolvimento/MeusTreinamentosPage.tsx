import { GraduationCap } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card, tableStyles } from "../../components/ui";
import { meuHistorico } from "./devRepository";
import { Carregando, Erro, EstadoVazio, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarCarga, formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const SITUACAO = {
  realizado: { rotulo: "Realizado", tom: "success" },
  ausente: { rotulo: "Ausente", tom: "warning" },
  agendado: { rotulo: "Agendado", tom: "info" },
} as const;

/** "Meus treinamentos": consulta do próprio histórico por qualquer colaborador (o servidor identifica a pessoa pela conta). */
export default function MeusTreinamentosPage() {
  const consulta = useConsulta(() => meuHistorico(), []);
  const itens = consulta.dados?.treinamentos ?? [];
  return (
    <>
      <Header />
      <Card>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>Meus treinamentos</h3>
            <p className={styles.cardSubtitle}>Treinamentos agendados e realizados por você, do mais recente para o mais antigo</p>
          </div>
        </div>
        {consulta.erro ? (
          <Erro mensagem={consulta.erro} />
        ) : consulta.carregando || !consulta.dados ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <EstadoVazio icone={<GraduationCap size={26} strokeWidth={1.6} />} titulo="Nenhum treinamento registrado para você no PeopleFlow." descricao="Os treinamentos aparecem aqui depois que você é incluído na turma." />
        ) : (
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Treinamento</th>
                  <th>Documento</th>
                  <th>Data</th>
                  <th>Carga</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((t, i) => (
                  <tr key={`${t.codigo}-${i}`}>
                    <td>
                      {t.titulo}
                      {t.codigo && <div className={styles.secundario}>{t.codigo}</div>}
                    </td>
                    <td className={styles.secundario}>{t.documento ?? "—"}</td>
                    <td className={styles.mono}>{formatarData(t.data)}</td>
                    <td className={styles.mono}>{formatarCarga(t.carga_min)}</td>
                    <td>
                      <Selo tom={SITUACAO[t.situacao].tom}>{SITUACAO[t.situacao].rotulo}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
