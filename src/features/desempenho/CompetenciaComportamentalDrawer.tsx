import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { CompetenciaComportamental } from "../../types/domain";
import styles from "./CompetenciasComportamentaisTab.module.css";

interface CompetenciaComportamentalDrawerProps {
  competencia: CompetenciaComportamental;
  onClose: () => void;
}

/** Edição de uma competência comportamental do catálogo corporativo — nome,
 * descrição e afirmações avaliativas (uma por linha). A escala de avaliação
 * (1 a 5) é fixa/igual pra todas e não é editável aqui (ver
 * domain/avaliacaoDesempenho.ts). */
export function CompetenciaComportamentalDrawer({ competencia, onClose }: CompetenciaComportamentalDrawerProps) {
  const { salvarCompetenciaComportamental, podeEditarGestaoDesempenho } = usePortalData();

  const [nome, setNome] = useState(competencia.nome);
  const [descricao, setDescricao] = useState(competencia.descricao);
  const [afirmacoesTexto, setAfirmacoesTexto] = useState(competencia.afirmacoes.join("\n"));
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    setSalvando(true);
    const afirmacoes = afirmacoesTexto
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
    const result = await salvarCompetenciaComportamental({ ...competencia, nome: nome.trim(), descricao: descricao.trim(), afirmacoes });
    setSalvando(false);
    if (result.ok) onClose();
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{competencia.nome || "Nova competência"}</div>
          <div className={styles.drawerSub}>Competência comportamental</div>
        </div>
      }
    >
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="cc-nome">
          Nome
        </label>
        <input id="cc-nome" className={styles.input} value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditarGestaoDesempenho} />
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor="cc-descricao">
          Descrição
        </label>
        <textarea
          id="cc-descricao"
          className={styles.textarea}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          disabled={!podeEditarGestaoDesempenho}
        />
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor="cc-afirmacoes">
          Afirmações avaliativas (uma por linha)
        </label>
        <textarea
          id="cc-afirmacoes"
          className={styles.textarea}
          rows={6}
          value={afirmacoesTexto}
          onChange={(e) => setAfirmacoesTexto(e.target.value)}
          disabled={!podeEditarGestaoDesempenho}
          placeholder="Ainda sem afirmações cadastradas"
        />
      </div>

      {podeEditarGestaoDesempenho && (
        <div className={styles.edicaoAcoes}>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSalvar} disabled={salvando || !nome.trim()}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
