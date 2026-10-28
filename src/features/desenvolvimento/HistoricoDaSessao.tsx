import { useState } from "react";
import { Card } from "../../components/ui";
import { historicoDoTreinamento, type EventoHistorico } from "./devRepository";
import { Carregando, Erro } from "./componentes";
import { useConsulta } from "./hooks";
import styles from "./Desenvolvimento.module.css";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function Lista({ treinamentoId, versao }: { treinamentoId: number; versao: number }) {
  const consulta = useConsulta<EventoHistorico[]>(() => historicoDoTreinamento(treinamentoId), [treinamentoId, versao]);
  if (consulta.erro) return <Erro mensagem={consulta.erro} />;
  if (consulta.carregando || !consulta.dados) return <Carregando />;
  if (consulta.dados.length === 0) return <p className={styles.secundario}>Nenhuma ação registrada ainda.</p>;
  return (
    <ul className={styles.historico}>
      {consulta.dados.map((e, i) => (
        <li key={`${e.em}-${i}`}>
          <strong>{e.rotulo}</strong>
          {e.resumo ? ` — ${e.resumo}` : ""}
          <div className={styles.secundario}>
            por {e.por} · {dataHora.format(new Date(e.em))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Histórico de ações do treinamento: quem fez o quê e quando (RH, quem administra e a liderança que acompanha). */
export function HistoricoDaSessao({ treinamentoId, versao }: { treinamentoId: number; versao: number }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Histórico de ações</h3>
          <p className={styles.cardSubtitle}>Quem realizou cada ação neste treinamento, e quando.</p>
        </div>
        <button type="button" className={styles.linkAcao} onClick={() => setAberto((v) => !v)}>
          {aberto ? "Ocultar" : "Ver histórico"}
        </button>
      </div>
      {aberto && <Lista treinamentoId={treinamentoId} versao={versao} />}
    </Card>
  );
}
