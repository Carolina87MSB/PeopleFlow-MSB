import { Badge, EmptyState, tableStyles } from "../../components/ui";
import { formatarDataHora, formatarDataIso } from "../../domain/dates";
import type { LinhaHistoricoCiclo } from "../../domain/historicoDesempenho";
import { STATUS_CALIBRACAO_TONE } from "./CalibracaoTab";

const CICLO_TONE: Record<string, { bg: string; fg: string }> = {
  Aberto: { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
  Encerrado: { bg: "var(--color-surface, #f6fafb)", fg: "var(--color-muted)" },
};

function celulaNota(nota: number | null, statusCalibracao: LinhaHistoricoCiclo["statusCalibracaoDesempenho"]) {
  if (nota !== null) return <strong>{nota}</strong>;
  const tone = STATUS_CALIBRACAO_TONE[statusCalibracao];
  return (
    <Badge bg={tone.bg} fg={tone.fg}>
      {statusCalibracao}
    </Badge>
  );
}

interface HistoricoLinhaDoTempoProps {
  linhas: LinhaHistoricoCiclo[];
}

/** Tabela read-only da linha do tempo de um colaborador (Etapa 9) — 1 linha por
 * ciclo em que ele tem pelo menos uma ficha. Usada tanto standalone (perfil
 * Colaborador, direto em HistoricoTab.tsx) quanto dentro de HistoricoDrawer.tsx
 * (RH/Gestor/Diretoria). Nota Oficial só aparece quando a ficha já está
 * Homologada — antes disso, mostra o próprio status de calibração, pra ficar
 * claro o motivo do "—" (mesma regra de transparência da Matriz 9 Box/Dashboard). */
export function HistoricoLinhaDoTempo({ linhas }: HistoricoLinhaDoTempoProps) {
  if (linhas.length === 0) {
    return <EmptyState message="Nenhum ciclo de Avaliação de Desempenho encontrado ainda." />;
  }

  return (
    <div className={tableStyles.wrap}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th>Ciclo</th>
            <th>Início</th>
            <th>Encerramento</th>
            <th>Status do Ciclo</th>
            <th className={tableStyles.right}>Nota Desempenho</th>
            <th className={tableStyles.right}>Nota Potencial</th>
            <th>Matriz 9 Box</th>
            <th>PDI</th>
            <th>Devolutiva</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const cicloTone = CICLO_TONE[linha.statusCiclo] ?? CICLO_TONE.Aberto;
            return (
              <tr key={linha.cicloId}>
                <td>{linha.cicloNome}</td>
                <td>{formatarDataIso(linha.dataInicio)}</td>
                <td>{formatarDataIso(linha.dataEncerramento)}</td>
                <td>
                  <Badge bg={cicloTone.bg} fg={cicloTone.fg}>
                    {linha.statusCiclo}
                  </Badge>
                </td>
                <td className={tableStyles.right}>{celulaNota(linha.notaDesempenho, linha.statusCalibracaoDesempenho)}</td>
                <td className={tableStyles.right}>{celulaNota(linha.notaPotencial, linha.statusCalibracaoPotencial)}</td>
                <td>{linha.posicaoMatriz9Box?.nomeQuadrante ?? "—"}</td>
                <td>{linha.statusPdi ?? "—"}</td>
                <td>{linha.dataDevolutiva ? formatarDataHora(linha.dataDevolutiva) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
