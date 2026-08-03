// Histórico da Gestão de Desempenho (Etapa 9) — funções puras de agregação sobre
// dados já existentes (AVD, Avaliação de Potencial, PDI, ciclos). Sem estado nem
// dependência de UI/Supabase. Ver README > "Gestão de Desempenho".
//
// 100% derivado, nada persistido: uma vez que uma ficha (AVD ou Potencial) chega a
// statusCalibracao "Homologada", não existe nenhum caminho no app que a edite de novo
// (ver domain/calibracao.ts e usePortalData.ts — podeCalibrarAvaliacaoDesempenho só
// libera "Aguardando Calibração", reabrirAvaliacaoPotencial bloqueia assim que
// statusCalibracao !== "Não iniciada", e a ficha AVD tipo GESTOR não tem nenhuma
// função de reabertura). A integridade histórica exigida pelo spec desta etapa já é
// garantida por essa arquitetura de permissões, sem precisar de tabela de auditoria.

import { posicionarMatriz9Box } from "./matriz9Box";
import type { PosicaoMatriz9Box } from "./matriz9Box";
import type {
  AvaliacaoDesempenho,
  AvaliacaoPotencial,
  CicloAvaliacaoDesempenho,
  ConfigAvaliacaoDesempenho,
  Pdi,
  StatusCalibracao,
  StatusCicloAvaliacaoDesempenho,
  StatusPdi,
} from "../types/domain";

export interface LinhaHistoricoCiclo {
  cicloId: string;
  cicloNome: string;
  dataInicio: string;
  dataEncerramento: string;
  statusCiclo: StatusCicloAvaliacaoDesempenho;
  /** Nota Oficial — null se a ficha GESTOR ainda não foi Homologada (ver `statusCalibracaoDesempenho` pro motivo). */
  notaDesempenho: number | null;
  statusCalibracaoDesempenho: StatusCalibracao;
  /** Nota Oficial — null se a ficha de Potencial ainda não foi Homologada. */
  notaPotencial: number | null;
  statusCalibracaoPotencial: StatusCalibracao;
  posicaoMatriz9Box: PosicaoMatriz9Box | null;
  /** null = colaborador não tem PDI pra esse ciclo (ex.: nunca concluiu a ficha GESTOR). */
  statusPdi: StatusPdi | null;
  dataDevolutiva: string | null;
}

/** Monta a linha do tempo completa de 1 colaborador — 1 linha por ciclo em que ele
 * tem pelo menos uma ficha (GESTOR ou Potencial), ordenado por `dataInicio` do
 * ciclo. Reaproveita `posicionarMatriz9Box()` (domain/matriz9Box.ts) — mesmos
 * limiares configuráveis já usados na Matriz 9 Box e no Dashboard; a posição é
 * sempre recalculada ao vivo com os limiares ATUAIS de `config` (mesmo
 * comportamento já aceito no resto do módulo — a posição nunca foi persistida em
 * nenhuma etapa anterior). */
export function montarHistoricoColaborador(
  colaboradorNome: string,
  ciclos: CicloAvaliacaoDesempenho[],
  avaliacoesDesempenho: AvaliacaoDesempenho[],
  avaliacoesPotencial: AvaliacaoPotencial[],
  pdis: Pdi[],
  config: ConfigAvaliacaoDesempenho | null,
): LinhaHistoricoCiclo[] {
  const fichaGestorPorCiclo = new Map(
    avaliacoesDesempenho.filter((a) => a.tipo === "GESTOR" && a.colaboradorNome === colaboradorNome).map((a) => [a.cicloId, a]),
  );
  const potencialPorCiclo = new Map(avaliacoesPotencial.filter((a) => a.colaboradorNome === colaboradorNome).map((a) => [a.cicloId, a]));
  const pdiPorCiclo = new Map(pdis.filter((p) => p.colaboradorNome === colaboradorNome).map((p) => [p.cicloId, p]));

  return ciclos
    .filter((c) => fichaGestorPorCiclo.has(c.id) || potencialPorCiclo.has(c.id))
    .slice()
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .map((ciclo) => {
      const avd = fichaGestorPorCiclo.get(ciclo.id) ?? null;
      const pot = potencialPorCiclo.get(ciclo.id) ?? null;
      const pdi = pdiPorCiclo.get(ciclo.id) ?? null;
      const notaDesempenho = avd?.statusCalibracao === "Homologada" ? avd.notaFinalOficial : null;
      const notaPotencial = pot?.statusCalibracao === "Homologada" ? pot.notaOficial : null;
      return {
        cicloId: ciclo.id,
        cicloNome: ciclo.nome,
        dataInicio: ciclo.dataInicio,
        dataEncerramento: ciclo.dataEncerramento,
        statusCiclo: ciclo.status,
        notaDesempenho,
        statusCalibracaoDesempenho: avd?.statusCalibracao ?? "Não iniciada",
        notaPotencial,
        statusCalibracaoPotencial: pot?.statusCalibracao ?? "Não iniciada",
        posicaoMatriz9Box: posicionarMatriz9Box(notaDesempenho, notaPotencial, config),
        statusPdi: pdi?.status ?? null,
        dataDevolutiva: avd?.devolutivaEm ?? null,
      };
    });
}
