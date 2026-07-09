import { useMemo } from "react";
import { Header } from "../../components/layout/Header";
import { Card, EmptyState } from "../../components/ui";
import { tipoColor } from "../../domain/colors";
import { usePortalData } from "../../store/usePortalData";
import type { Movimentacao } from "../../types/domain";
import styles from "./HistoricoPage.module.css";

const MESES: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

/** Parses the seed's Brazilian "dd/mmm/yyyy" date strings (e.g. "16/jun/2026") into a comparable timestamp. */
function parseDataBr(data: string): number {
  const [dia, mes, ano] = data.split("/");
  const mesIndex = MESES[mes?.toLowerCase()] ?? 0;
  return new Date(Number(ano), mesIndex, Number(dia)).getTime();
}

interface EventoHistorico {
  key: string;
  tipoCod: Movimentacao["tipoCod"];
  titulo: string;
  descricao: string;
  data: string;
  autor: string;
  timestamp: number;
}

function construirEventos(movimentacoes: Movimentacao[]): EventoHistorico[] {
  const eventos: EventoHistorico[] = [];

  for (const m of movimentacoes) {
    eventos.push({
      key: `${m.id}-criacao`,
      tipoCod: m.tipoCod,
      titulo: "Movimentação criada",
      descricao: `${m.colaborador} · ${m.resumo}`,
      data: m.dataSolicitacao,
      autor: m.solicitante,
      timestamp: parseDataBr(m.dataSolicitacao),
    });

    m.etapas.forEach((etapa, i) => {
      if (!etapa.data) return;
      if (etapa.status !== "Aprovado" && etapa.status !== "Reprovado") return;
      eventos.push({
        key: `${m.id}-etapa-${i}`,
        tipoCod: m.tipoCod,
        titulo: `Etapa ${etapa.status === "Aprovado" ? "aprovada" : "reprovada"} — ${etapa.papel}`,
        descricao: `${m.colaborador} · ${m.resumo}`,
        data: etapa.data,
        autor: etapa.aprovador,
        timestamp: parseDataBr(etapa.data),
      });
    });
  }

  return eventos.sort((a, b) => b.timestamp - a.timestamp);
}

export function HistoricoPage() {
  const { movimentacoesVisiveis } = usePortalData();
  const eventos = useMemo(() => construirEventos(movimentacoesVisiveis), [movimentacoesVisiveis]);

  return (
    <>
      <Header />
      <Card>
        <div className={styles.header}>
          <h3 className={styles.title}>Trilha de auditoria</h3>
          <p className={styles.subtitle}>{eventos.length} eventos registrados</p>
        </div>

        {eventos.length === 0 ? (
          <EmptyState message="Nenhum evento registrado ainda." />
        ) : (
          <div className={styles.timeline}>
            {eventos.map((evento) => (
              <div key={evento.key} className={styles.item}>
                <div className={styles.markerCol}>
                  <span className={styles.dot} style={{ background: tipoColor(evento.tipoCod) }} />
                  <span className={styles.line} />
                </div>
                <div className={styles.content}>
                  <div className={styles.topo}>
                    <span className={styles.itemTitulo}>{evento.titulo}</span>
                    <span className={styles.itemData}>{evento.data}</span>
                  </div>
                  <p className={styles.itemDescricao}>{evento.descricao}</p>
                  <span className={styles.itemAutor}>{evento.autor}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
