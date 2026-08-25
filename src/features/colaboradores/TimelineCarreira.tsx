import { useMemo, useState } from "react";
import { ArrowLeftRight, BarChart3, ClipboardCheck, LogIn, LogOut, PiggyBank, Target, TrendingUp, UserCog, Wallet } from "lucide-react";
import { formatarDataIso } from "../../domain/dates";
import { podeVerSalario } from "../../domain/permissoes";
import { formatarPercentual, formatarValorMonetario } from "../../domain/salario";
import { montarTimelineCarreira } from "../../domain/timelineCarreira";
import type { EventoTimelineCarreira } from "../../domain/timelineCarreira";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador } from "../../types/domain";
import styles from "./TimelineCarreira.module.css";

interface TimelineCarreiraProps {
  colaborador: Colaborador;
}

const ICONE_POR_TIPO: Record<EventoTimelineCarreira["tipo"], { Icon: typeof LogIn; cor: string }> = {
  admissao: { Icon: LogIn, cor: "#2f8f6b" },
  alteracaoGestor: { Icon: UserCog, cor: "#6b7780" },
  transferencia: { Icon: ArrowLeftRight, cor: "#56A4BB" },
  promocao: { Icon: TrendingUp, cor: "#2c6679" },
  alteracaoSalarial: { Icon: Wallet, cor: "#c08a2e" },
  avaliacaoExperiencia: { Icon: ClipboardCheck, cor: "#5f89a1" },
  cicloAvaliacao: { Icon: BarChart3, cor: "#1f4e5e" },
  pdi: { Icon: Target, cor: "#56A4BB" },
  reajusteAvd: { Icon: PiggyBank, cor: "#2f8f4e" },
  desligamento: { Icon: LogOut, cor: "#c0584e" },
};

function tituloDoEvento(e: EventoTimelineCarreira): string {
  switch (e.tipo) {
    case "admissao":
      return "Admissão";
    case "alteracaoGestor":
      return "Alteração de gestor";
    case "transferencia":
      return "Transferência";
    case "promocao":
      return "Promoção";
    case "alteracaoSalarial":
      return "Alteração salarial";
    case "avaliacaoExperiencia":
      return "Avaliação de Experiência";
    case "cicloAvaliacao":
      return e.cicloNome || "Avaliação de Desempenho + Potencial";
    case "pdi":
      return "Plano de Desenvolvimento Individual — PDI";
    case "reajusteAvd":
      return `Reajuste Salarial — ${e.origem}`;
    case "desligamento":
      return "Desligamento";
  }
}

function resumoDoEvento(e: EventoTimelineCarreira, verSalario: boolean): string {
  switch (e.tipo) {
    case "admissao":
      return e.cargo;
    case "alteracaoGestor":
      return `${e.gestorAnterior} → ${e.novoGestor}`;
    case "transferencia":
      return `${e.deptoAnterior} → ${e.novoDepto}`;
    case "promocao":
      return `${e.cargoAnterior} → ${e.novoCargo}`;
    case "alteracaoSalarial":
      return verSalario ? `${e.salarioAnterior} → ${e.novoSalario}` : "Valores visíveis apenas para RH/Diretoria";
    case "avaliacaoExperiencia":
      return `${e.etapa} · ${e.resultado}`;
    case "cicloAvaliacao": {
      const partes: string[] = [];
      if (e.faixaDesempenho) partes.push(`Desempenho: ${e.faixaDesempenho}`);
      if (e.faixaPotencial) partes.push(`Potencial: ${e.faixaPotencial}`);
      return partes.join(" · ") || "Ciclo em andamento";
    }
    case "pdi":
      return e.objetivos.length ? e.objetivos.join(", ") : "Sem objetivos registrados";
    case "reajusteAvd":
      return verSalario
        ? `${formatarValorMonetario(e.salarioAnterior)} → ${formatarValorMonetario(e.novoSalario)} (${formatarPercentual(e.reajusteEfetivo)})`
        : "Valores visíveis apenas para RH/Diretoria";
    case "desligamento":
      return "Encerrado";
  }
}

function detalhesDoEvento(e: EventoTimelineCarreira, verSalario: boolean): { label: string; valor: string }[] {
  switch (e.tipo) {
    case "admissao":
      return [
        { label: "Data de admissão", valor: formatarDataIso(e.data) },
        { label: "Cargo", valor: e.cargo },
        { label: "Área", valor: e.depto },
        { label: "Gestor", valor: e.gestor || "—" },
      ];
    case "alteracaoGestor":
      return [
        { label: "Data", valor: formatarDataIso(e.data) },
        { label: "Gestor anterior", valor: e.gestorAnterior },
        { label: "Novo gestor", valor: e.novoGestor },
      ];
    case "transferencia": {
      const det = [
        { label: "Data", valor: formatarDataIso(e.data) },
        { label: "Setor anterior", valor: e.deptoAnterior },
        { label: "Novo setor", valor: e.novoDepto },
      ];
      if (e.cargo) det.push({ label: "Cargo", valor: e.cargo });
      return det;
    }
    case "promocao": {
      const det = [
        { label: "Data", valor: formatarDataIso(e.data) },
        { label: "Cargo anterior", valor: e.cargoAnterior },
        { label: "Novo cargo", valor: e.novoCargo },
      ];
      if (e.gestorResponsavel) det.push({ label: "Gestor", valor: e.gestorResponsavel });
      return det;
    }
    case "alteracaoSalarial": {
      const det = [{ label: "Data", valor: formatarDataIso(e.data) }];
      if (verSalario) {
        det.push({ label: "Salário anterior", valor: e.salarioAnterior }, { label: "Novo salário", valor: e.novoSalario });
      } else {
        det.push({ label: "Valores", valor: "Restrito a RH/Diretoria" });
      }
      if (e.motivo) det.push({ label: "Motivo", valor: e.motivo });
      return det;
    }
    case "avaliacaoExperiencia":
      return [
        { label: "Tipo/período", valor: e.etapa },
        { label: "Status", valor: "Concluída" },
        { label: "Resultado", valor: e.resultado },
        { label: "Concluída em", valor: formatarDataIso(e.concluidaEm) },
      ];
    case "cicloAvaliacao": {
      const det = [{ label: "Ciclo", valor: e.cicloNome }];
      if (e.periodo) det.push({ label: "Período avaliado", valor: e.periodo });
      if (e.faixaDesempenho) det.push({ label: "Desempenho", valor: `${e.faixaDesempenho}${e.notaDesempenho !== null ? ` (${e.notaDesempenho.toFixed(1)})` : ""}` });
      if (e.faixaPotencial) det.push({ label: "Potencial", valor: `${e.faixaPotencial}${e.notaPotencial !== null ? ` (${e.notaPotencial.toFixed(1)})` : ""}` });
      if (e.nomeQuadrante) det.push({ label: "9 Box", valor: e.nomeQuadrante });
      if (e.concluidoEm) det.push({ label: "Concluído em", valor: formatarDataIso(e.concluidoEm) });
      return det;
    }
    case "pdi": {
      const det = [{ label: "Criado em", valor: formatarDataIso(e.data) }];
      if (e.objetivos.length) det.push({ label: e.objetivos.length > 1 ? "Objetivos" : "Objetivo", valor: e.objetivos.join("; ") });
      if (e.prazo) det.push({ label: "Prazo", valor: formatarDataIso(e.prazo) });
      det.push({ label: "Status", valor: e.status });
      if (e.concluidoEm) det.push({ label: "Concluído em", valor: formatarDataIso(e.concluidoEm) });
      return det;
    }
    case "reajusteAvd": {
      const det = [
        { label: "Competência", valor: e.competencia },
        { label: "Origem", valor: e.origem },
      ];
      if (verSalario) {
        det.push(
          { label: "Salário anterior", valor: formatarValorMonetario(e.salarioAnterior) },
          { label: "Reajuste efetivo", valor: formatarPercentual(e.reajusteEfetivo) },
          { label: "Novo salário", valor: formatarValorMonetario(e.novoSalario) },
        );
      } else {
        det.push({ label: "Valores", valor: "Restrito a RH/Diretoria" });
      }
      return det;
    }
    case "desligamento": {
      const det = [
        { label: "Data do desligamento", valor: formatarDataIso(e.data) },
        { label: "Status", valor: "Encerrado" },
      ];
      if (e.motivo) det.push({ label: "Motivo", valor: e.motivo });
      return det;
    }
  }
}

/** Timeline da trajetória profissional do colaborador — substitui o antigo
 * "Histórico" (lista genérica de movimentações) na ficha de /colaboradores.
 * Só eventos de carreira (admissão, gestor, transferência, promoção, salário,
 * avaliação de experiência, ciclo de AVD+Potencial, PDI, desligamento) —
 * nunca documentos, treinamentos, descrição de cargo ou logs técnicos (ver
 * domain/timelineCarreira.ts). Mais recente primeiro; cada evento é
 * expansível pra não poluir a tela com todo o detalhe de uma vez. */
export function TimelineCarreira({ colaborador }: TimelineCarreiraProps) {
  const {
    movimentacoes,
    avaliacoesExperiencia,
    ciclosAvaliacaoDesempenho,
    avaliacoesDesempenho,
    avaliacoesPotencial,
    pdi,
    configAvaliacaoDesempenho,
    reajustesSalariais,
    perfil,
  } = usePortalData();
  const [expandido, setExpandido] = useState<string | null>(null);

  const verSalario = podeVerSalario(perfil);

  const eventos = useMemo(
    () =>
      montarTimelineCarreira(
        colaborador,
        movimentacoes,
        avaliacoesExperiencia,
        ciclosAvaliacaoDesempenho,
        avaliacoesDesempenho,
        avaliacoesPotencial,
        pdi,
        configAvaliacaoDesempenho,
        reajustesSalariais,
      ),
    [
      colaborador,
      movimentacoes,
      avaliacoesExperiencia,
      ciclosAvaliacaoDesempenho,
      avaliacoesDesempenho,
      avaliacoesPotencial,
      pdi,
      configAvaliacaoDesempenho,
      reajustesSalariais,
    ],
  );

  return (
    <div className={styles.secao}>
      <h4 className={styles.titulo}>Timeline da trajetória profissional</h4>
      {eventos.length === 0 ? (
        <p className={styles.vazio}>Nenhum evento registrado ainda.</p>
      ) : (
        <div className={styles.timeline}>
          {eventos.map((e) => {
            const { Icon, cor } = ICONE_POR_TIPO[e.tipo];
            const aberto = expandido === e.id;
            const detalhes = detalhesDoEvento(e, verSalario);
            return (
              <div key={e.id} className={styles.item}>
                <div className={styles.markerCol}>
                  <span className={styles.dot} style={{ background: cor }}>
                    <Icon size={12} color="#fff" strokeWidth={2.2} />
                  </span>
                  <span className={styles.line} />
                </div>
                <button type="button" className={styles.content} onClick={() => setExpandido(aberto ? null : e.id)}>
                  <div className={styles.topo}>
                    <span className={styles.itemTitulo}>{tituloDoEvento(e)}</span>
                    <span className={styles.itemData}>{formatarDataIso(e.data)}</span>
                  </div>
                  <p className={styles.itemResumo}>{resumoDoEvento(e, verSalario)}</p>
                  {aberto && (
                    <div className={styles.detalhes}>
                      {detalhes.map((d) => (
                        <div key={d.label} className={styles.detalheLinha}>
                          <span className={styles.detalheLabel}>{d.label}</span>
                          <span className={styles.detalheValor}>{d.valor}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
