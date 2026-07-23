import { useMemo, useState } from "react";
import { Avatar, Button, Drawer } from "../../components/ui";
import {
  META_45_DIAS,
  META_90_DIAS,
  PERGUNTAS_AVALIACAO_EXPERIENCIA,
  calcularIndicacao,
  calcularNotaFinalPct,
  opcoesDecisao,
} from "../../domain/avaliacaoExperiencia";
import type { Colaborador, EtapaAvaliacaoExperiencia, ResultadoAvaliacaoExperiencia } from "../../types/domain";
import styles from "./AvaliacaoExperienciaDrawer.module.css";

const ESCALA = [1, 2, 3, 4, 5];

interface AvaliacaoExperienciaDrawerProps {
  colaborador: Colaborador;
  etapa: EtapaAvaliacaoExperiencia;
  onClose: () => void;
  onSalvar: (
    respostas: { perguntaId: string; nota: number }[],
    decisaoFinal: ResultadoAvaliacaoExperiencia,
    justificativaDivergencia: string,
  ) => Promise<{ ok: true } | { ok: false }>;
}

/** Formulário das ~20 perguntas da avaliação de experiência (45 ou 90 dias) —
 * nota final = média das respostas (1 a 5) em %, indicação automática pela
 * meta (ver domain/avaliacaoExperiencia.ts), decisão final sempre do gestor. */
export function AvaliacaoExperienciaDrawer({ colaborador, etapa, onClose, onSalvar }: AvaliacaoExperienciaDrawerProps) {
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  // Só guarda a escolha manual do gestor — enquanto ele não tocar num botão,
  // a decisão efetiva (abaixo) cai de volta pra indicação automática.
  const [decisaoManual, setDecisaoManual] = useState<ResultadoAvaliacaoExperiencia | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof PERGUNTAS_AVALIACAO_EXPERIENCIA>();
    PERGUNTAS_AVALIACAO_EXPERIENCIA.forEach((p) => {
      const lista = map.get(p.categoria) || [];
      lista.push(p);
      map.set(p.categoria, lista);
    });
    return [...map.entries()];
  }, []);

  const totalRespondidas = Object.keys(respostas).length;
  const todasRespondidas = totalRespondidas === PERGUNTAS_AVALIACAO_EXPERIENCIA.length;

  const notaFinalPct = useMemo(
    () => (todasRespondidas ? calcularNotaFinalPct(PERGUNTAS_AVALIACAO_EXPERIENCIA.map((p) => ({ perguntaId: p.id, nota: respostas[p.id] }))) : null),
    [respostas, todasRespondidas],
  );

  const indicacao = useMemo(() => (notaFinalPct !== null ? calcularIndicacao(etapa, notaFinalPct) : null), [etapa, notaFinalPct]);

  // Enquanto o gestor não escolher manualmente, a decisão efetiva acompanha a
  // indicação automática (que só existe depois de responder tudo).
  const decisaoFinal = decisaoManual ?? indicacao;

  const opcoes = opcoesDecisao(etapa);
  const divergente = decisaoFinal !== null && indicacao !== null && decisaoFinal !== indicacao;
  const canSubmit = todasRespondidas && decisaoFinal !== null && (!divergente || justificativa.trim().length > 0) && !salvando;

  async function handleSalvar() {
    if (!canSubmit || decisaoFinal === null) return;
    setSalvando(true);
    setErro(null);
    const payload = PERGUNTAS_AVALIACAO_EXPERIENCIA.map((p) => ({ perguntaId: p.id, nota: respostas[p.id] }));
    const result = await onSalvar(payload, decisaoFinal, divergente ? justificativa.trim() : "");
    setSalvando(false);
    if (!result.ok) {
      setErro("Falha ao salvar a avaliação — tente novamente.");
      return;
    }
    onClose();
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <Avatar nome={colaborador.nome} size={40} />
          <div>
            <div className={styles.drawerNome}>{colaborador.nome}</div>
            <div className={styles.drawerSub}>
              Avaliação de experiência · {etapa} · {colaborador.cargo}
            </div>
          </div>
        </div>
      }
    >
      <div className={styles.progresso}>
        {totalRespondidas} de {PERGUNTAS_AVALIACAO_EXPERIENCIA.length} perguntas respondidas
      </div>

      {grupos.map(([categoria, perguntas]) => (
        <div key={categoria} className={styles.grupo}>
          <h4 className={styles.sectionTitle}>{categoria}</h4>
          {perguntas.map((p) => (
            <div key={p.id} className={styles.pergunta}>
              <div className={styles.perguntaTexto}>{p.texto}</div>
              <div className={styles.escala}>
                {ESCALA.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.escalaBotao} ${respostas[p.id] === n ? styles.escalaBotaoAtivo : ""}`}
                    onClick={() => setRespostas((r) => ({ ...r, [p.id]: n }))}
                    title={n === 1 ? "Insatisfatório" : n === 5 ? "Excelente" : undefined}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className={styles.resultado}>
        <h4 className={styles.sectionTitle}>Resultado</h4>
        {notaFinalPct === null ? (
          <div className={styles.resultadoVazio}>Responda todas as perguntas para calcular a nota.</div>
        ) : (
          <>
            <div className={styles.notaLinha}>
              <span>Nota final</span>
              <strong>{notaFinalPct.toFixed(1)}%</strong>
            </div>
            <div className={styles.notaLinha}>
              <span>Meta ({etapa})</span>
              <strong>{etapa === "45 dias" ? META_45_DIAS : META_90_DIAS}%</strong>
            </div>
            <div className={styles.indicacaoLinha}>
              Indicação automática:{" "}
              <span className={indicacao === "Desligar" ? styles.indicacaoNegativa : styles.indicacaoPositiva}>{indicacao}</span>
            </div>
          </>
        )}
      </div>

      <div className={styles.decisao}>
        <h4 className={styles.sectionTitle}>Decisão final do gestor</h4>
        <div className={styles.decisaoOpcoes}>
          {opcoes.map((op) => (
            <Button
              key={op}
              type="button"
              variant={decisaoFinal === op ? "primary" : "secondary"}
              disabled={!todasRespondidas}
              onClick={() => setDecisaoManual(op)}
            >
              {op}
            </Button>
          ))}
        </div>

        {divergente ? (
          <label className={styles.justificativaCampo}>
            <span>Justificativa (decisão diferente da indicação automática)</span>
            <textarea
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Explique por que a decisão final diverge da indicação calculada pela nota."
            />
          </label>
        ) : null}
      </div>

      {erro && <div className={styles.erro}>{erro}</div>}

      <div className={styles.acoes}>
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={!canSubmit} onClick={handleSalvar}>
          {salvando ? "Salvando..." : "Salvar avaliação"}
        </Button>
      </div>
    </Drawer>
  );
}
