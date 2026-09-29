import { useNavigate } from "react-router-dom";
import { usePortalData } from "../../store/usePortalData";
import { STATUS_VAGA_LABEL } from "../../domain/vagas";
import type { Movimentacao, Vaga } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

interface Elo {
  direcao: "entrada" | "saida";
  vaga: Vaga;
  mpRelacionada?: Movimentacao;
}

/** Monta os elos da cadeia desta MP — sem tabela nova, só percorrendo os
 * vínculos por id já existentes em peopleflow_vagas (ver seção 39 do
 * schema.sql): `vaga_origem_id` (entrada: a vaga que ESTA MP preenche) e
 * `preenchido_por_movimentacao_id` (saída: qual MP preencheu uma vaga que
 * ESTA MP gerou). Suporta ramificação naturalmente — uma MP pode ter várias
 * vagas geradas, cada uma com seu próprio elo de saída independente. */
function elosDaCadeia(m: Movimentacao, vagas: Vaga[], movimentacoes: Movimentacao[]): Elo[] {
  const elos: Elo[] = [];

  if (m.vagaOrigemId) {
    const vagaOrigem = vagas.find((v) => v.id === m.vagaOrigemId);
    if (vagaOrigem) {
      elos.push({ direcao: "entrada", vaga: vagaOrigem, mpRelacionada: movimentacoes.find((mm) => mm.id === vagaOrigem.movimentacaoId) });
    }
  }

  const vagasGeradas = vagas.filter((v) => v.movimentacaoId === m.id && (v.preenchidoPorMovimentacaoId || v.novoColaboradorNome));
  for (const v of vagasGeradas) {
    elos.push({
      direcao: "saida",
      vaga: v,
      mpRelacionada: v.preenchidoPorMovimentacaoId ? movimentacoes.find((mm) => mm.id === v.preenchidoPorMovimentacaoId) : undefined,
    });
  }

  return elos;
}

/** "CADEIA DA MOVIMENTAÇÃO" (RH, 2026-09) — mostra de onde veio a
 * necessidade (esta MP preenche uma vaga gerada por outra) e como ela foi
 * resolvida (uma vaga que esta MP gerou, preenchida por outra MP ou
 * externamente). Some (retorna null) sem nenhum vínculo — não aparece pra
 * maioria das MPs. Não duplica dados completos: só resumo + link pra abrir a
 * MP relacionada com o comportamento já existente (ver `?mp=` em
 * AprovadasPage.tsx). */
export function CadeiaMovimentacaoBloco({ movimentacao: m }: { movimentacao: Movimentacao }) {
  const { vagas, movimentacoes } = usePortalData();
  const navigate = useNavigate();
  const elos = elosDaCadeia(m, vagas, movimentacoes);
  if (elos.length === 0) return null;

  return (
    <div className={styles.justificativaBox}>
      <h4 className={styles.sectionTitle}>Cadeia da movimentação</h4>
      <div className={styles.historicoList}>
        {elos.map((elo, i) => {
          const resumoMp = elo.mpRelacionada ? `${elo.mpRelacionada.id} — ${elo.mpRelacionada.tipo} — ${elo.mpRelacionada.colaborador}` : null;
          const titulo =
            elo.direcao === "entrada"
              ? "↑ Preenche vaga gerada por"
              : elo.mpRelacionada
                ? elo.vaga.status === "preenchida"
                  ? "↓ Gerou vaga, preenchida por"
                  : "↓ Gerou vaga, reservada por (aguardando aprovação)"
                : "↓ Gerou vaga, preenchida por";

          return (
            <div key={i} className={styles.historicoItem}>
              <div className={styles.historicoAcao}>{titulo}</div>
              {resumoMp ? (
                <button type="button" className={styles.documentoAcaoBtn} onClick={() => navigate(`/aprovadas?mp=${encodeURIComponent(elo.mpRelacionada!.id)}`)}>
                  {resumoMp}
                </button>
              ) : (
                <div className={styles.historicoAutor}>
                  {elo.vaga.novoColaboradorNome} — {STATUS_VAGA_LABEL[elo.vaga.status]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
