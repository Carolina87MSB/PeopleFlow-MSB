import { useNavigate } from "react-router-dom";
import { usePortalData } from "../../store/usePortalData";
import type { Movimentacao } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

/** "REGISTRO LEGADO INCORPORADO" (RH, 2026-09) — aviso de destaque quando esta
 * MP (ex. uma Admissão antiga) foi incorporada a uma Vaga autorizada por outra
 * MP mais nova (ver Movimentacao.incorporadaEmVagaId em types/domain.ts).
 * Preserva a MP legada intacta e consultável — só avisa que ela deixou de ser
 * a fonte operacional dessa necessidade, evitando duplicidade sem apagar
 * nada. Some (retorna null) pra qualquer MP comum.
 *
 * Texto varia pelo status da vaga (RH, 2026-10 — caso M-2026-003/022): só
 * fala em "preenchimento" quando a vaga JÁ foi preenchida (vaga.status ===
 * "preenchida"); caso ainda esteja pendente, a MP legada incorporou apenas a
 * NECESSIDADE (não existe candidato real pra afirmar preenchimento nenhum —
 * nunca inventar isso). */
export function LegadoIncorporadoBloco({ movimentacao: m }: { movimentacao: Movimentacao }) {
  const { vagas } = usePortalData();
  const navigate = useNavigate();

  if (!m.incorporadaEmVagaId) return null;
  const vaga = vagas.find((v) => v.id === m.incorporadaEmVagaId);
  if (!vaga) return null;

  const link = (
    <button type="button" className={styles.legadoLink} onClick={() => navigate(`/aprovadas?mp=${encodeURIComponent(vaga.movimentacaoId)}`)}>
      {vaga.movimentacaoId}
    </button>
  );

  return (
    <div className={styles.legadoBox}>
      <div className={styles.legadoTitulo}>Registro legado incorporado</div>
      <p className={styles.legadoTexto}>
        {vaga.status === "preenchida" ? (
          <>Esta admissão foi incorporada como preenchimento da vaga autorizada pela {link}.</>
        ) : (
          <>Esta admissão foi incorporada como a necessidade que originou a vaga autorizada pela {link}, ainda pendente de preenchimento.</>
        )}
      </p>
    </div>
  );
}
