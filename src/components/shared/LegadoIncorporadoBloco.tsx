import { useNavigate } from "react-router-dom";
import { usePortalData } from "../../store/usePortalData";
import type { Movimentacao } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

/** "REGISTRO LEGADO INCORPORADO" (RH, 2026-09) — aviso de destaque quando esta
 * MP (ex. uma Admissão antiga) foi incorporada como o preenchimento de uma
 * Vaga autorizada por outra MP mais nova (ver Movimentacao.incorporadaEmVagaId
 * em types/domain.ts). Preserva a MP legada intacta e consultável — só avisa
 * que ela deixou de ser a fonte operacional dessa necessidade, evitando
 * duplicidade sem apagar nada. Some (retorna null) pra qualquer MP comum. */
export function LegadoIncorporadoBloco({ movimentacao: m }: { movimentacao: Movimentacao }) {
  const { vagas } = usePortalData();
  const navigate = useNavigate();

  if (!m.incorporadaEmVagaId) return null;
  const vaga = vagas.find((v) => v.id === m.incorporadaEmVagaId);
  if (!vaga) return null;

  return (
    <div className={styles.legadoBox}>
      <div className={styles.legadoTitulo}>Registro legado incorporado</div>
      <p className={styles.legadoTexto}>
        Esta admissão foi incorporada como preenchimento da vaga autorizada pela{" "}
        <button type="button" className={styles.legadoLink} onClick={() => navigate(`/aprovadas?mp=${encodeURIComponent(vaga.movimentacaoId)}`)}>
          {vaga.movimentacaoId}
        </button>
        .
      </p>
    </div>
  );
}
