import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Drawer } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { CompetenciaComportamental } from "../../types/domain";
import styles from "./CompetenciasComportamentaisTab.module.css";

interface CompetenciaComportamentalDrawerProps {
  competencia: CompetenciaComportamental;
  onClose: () => void;
}

function mover<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

/** Edição de uma competência comportamental do catálogo corporativo — nome,
 * descrição, status (ativa/inativa) e afirmações avaliativas. Cada afirmação
 * é um registro independente da lista, com botões pra incluir, excluir e
 * reordenar — não é mais um campo de texto único. A escala de avaliação (1 a
 * 5) é fixa/igual pra todas e não é editável aqui (ver
 * domain/avaliacaoDesempenho.ts). */
export function CompetenciaComportamentalDrawer({ competencia, onClose }: CompetenciaComportamentalDrawerProps) {
  const { salvarCompetenciaComportamental, podeEditarGestaoDesempenho } = usePortalData();

  const [nome, setNome] = useState(competencia.nome);
  const [descricao, setDescricao] = useState(competencia.descricao);
  const [ativo, setAtivo] = useState(competencia.ativo);
  const [afirmacoes, setAfirmacoes] = useState<string[]>(competencia.afirmacoes.length > 0 ? competencia.afirmacoes : ["", "", ""]);
  const [salvando, setSalvando] = useState(false);

  function atualizarAfirmacao(indice: number, valor: string) {
    setAfirmacoes(afirmacoes.map((a, i) => (i === indice ? valor : a)));
  }

  function removerAfirmacao(indice: number) {
    setAfirmacoes(afirmacoes.filter((_, i) => i !== indice));
  }

  function adicionarAfirmacao() {
    setAfirmacoes([...afirmacoes, ""]);
  }

  function moverAfirmacao(indice: number, direcao: -1 | 1) {
    setAfirmacoes(mover(afirmacoes, indice, direcao));
  }

  async function handleSalvar() {
    setSalvando(true);
    const afirmacoesLimpas = afirmacoes.map((a) => a.trim()).filter(Boolean);
    const result = await salvarCompetenciaComportamental({
      ...competencia,
      nome: nome.trim(),
      descricao: descricao.trim(),
      ativo,
      afirmacoes: afirmacoesLimpas,
    });
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
          rows={7}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          disabled={!podeEditarGestaoDesempenho}
        />
      </div>

      <div className={styles.campo}>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!podeEditarGestaoDesempenho} />
          Competência ativa
        </label>
      </div>

      <div className={styles.campo}>
        <span className={styles.label}>Afirmações avaliativas</span>
        <div className={styles.listaAfirmacoes}>
          {afirmacoes.map((afirmacao, indice) => (
            <div key={indice} className={styles.afirmacaoItem}>
              <input
                className={styles.input}
                value={afirmacao}
                onChange={(e) => atualizarAfirmacao(indice, e.target.value)}
                disabled={!podeEditarGestaoDesempenho}
                placeholder={`Afirmação ${indice + 1}`}
              />
              {podeEditarGestaoDesempenho && (
                <div className={styles.afirmacaoAcoes}>
                  <button type="button" className={styles.iconBtnPequeno} onClick={() => moverAfirmacao(indice, -1)} disabled={indice === 0} title="Mover para cima">
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtnPequeno}
                    onClick={() => moverAfirmacao(indice, 1)}
                    disabled={indice === afirmacoes.length - 1}
                    title="Mover para baixo"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button type="button" className={styles.iconBtnPequeno} onClick={() => removerAfirmacao(indice)} title="Excluir afirmação">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {podeEditarGestaoDesempenho && (
          <Button variant="secondary" icon={<Plus size={13} />} onClick={adicionarAfirmacao}>
            Adicionar afirmação
          </Button>
        )}
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
