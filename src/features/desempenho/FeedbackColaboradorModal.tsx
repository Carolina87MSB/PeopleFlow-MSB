import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal } from "../../components/ui";
import { ordenarFeedbacks, TEMAS_FEEDBACK } from "../../domain/feedback";
import { formatarDataHora, formatarDataIso, hojeIso } from "../../domain/dates";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador, Feedback, TemaFeedback } from "../../types/domain";
import styles from "./FeedbackTab.module.css";

interface FeedbackColaboradorModalProps {
  colaborador: Colaborador;
  /** true quando aberto pelo botão "Registrar Feedback" da lista — pula
   * direto pro formulário em vez de mostrar primeiro o histórico. */
  abrirFormularioInicial: boolean;
  onClose: () => void;
}

/** Histórico de Feedback de um colaborador + formulário de novo registro, no
 * mesmo modal (item 3 + item 4 do pedido) — evita empilhar modal sobre
 * modal, mantendo o fluxo rápido pedido ("incentivar os gestores a
 * registrarem feedbacks ao longo do ano"). */
export function FeedbackColaboradorModal({ colaborador, abrirFormularioInicial, onClose }: FeedbackColaboradorModalProps) {
  const { feedbacksVisiveis, registrarFeedback, podeEditarFeedback, editarFeedback } = usePortalData();
  const [mostrarFormulario, setMostrarFormulario] = useState(abrirFormularioInicial);
  const [dataFeedback, setDataFeedback] = useState(() => hojeIso());
  const [tema, setTema] = useState<TemaFeedback>(TEMAS_FEEDBACK[0]);
  const [comentarios, setComentarios] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const historico = useMemo(
    () => ordenarFeedbacks(feedbacksVisiveis.filter((f) => f.colaboradorNome === colaborador.nome)),
    [feedbacksVisiveis, colaborador.nome],
  );

  function fecharFormulario() {
    setMostrarFormulario(false);
    setDataFeedback(hojeIso());
    setTema(TEMAS_FEEDBACK[0]);
    setComentarios("");
    setErro("");
  }

  async function handleSalvar() {
    if (!comentarios.trim()) {
      setErro("Descreva o feedback antes de salvar.");
      return;
    }
    setSalvando(true);
    setErro("");
    const resultado = await registrarFeedback({ colaboradorNome: colaborador.nome, dataFeedback, tema, comentarios: comentarios.trim() });
    setSalvando(false);
    if (resultado.ok) fecharFormulario();
  }

  return (
    <Modal title={colaborador.nome} subtitle={colaborador.cargo} onClose={onClose} width={620}>
      {!mostrarFormulario && (
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setMostrarFormulario(true)}>
          Registrar Feedback
        </Button>
      )}

      {mostrarFormulario && (
        <div className={styles.formulario}>
          <div className={styles.linha}>
            <div className={styles.campo}>
              <span className={styles.label}>Data do Feedback</span>
              <input type="date" className={styles.input} value={dataFeedback} onChange={(e) => setDataFeedback(e.target.value)} />
            </div>
            <div className={styles.campo}>
              <span className={styles.label}>Tema</span>
              <select className={styles.select} value={tema} onChange={(e) => setTema(e.target.value as TemaFeedback)}>
                {TEMAS_FEEDBACK.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.campo}>
            <span className={styles.label}>Comentários</span>
            <div className={styles.dicaBox}>
              <strong>Como registrar um bom feedback:</strong> descreva de forma objetiva o que aconteceu, o impacto ou
              resultado observado e, quando necessário, o que foi combinado ou esperado daqui para frente. Registre
              fatos e exemplos concretos, evitando julgamentos genéricos.
            </div>
            <textarea
              className={styles.textarea}
              rows={5}
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Ex.: Comente o que foi observado, dê exemplos concretos, registre a orientação realizada e os combinados definidos com o colaborador."
            />
          </div>

          {erro && <p className={styles.erro}>{erro}</p>}

          <div className={styles.formularioAcoes}>
            <Button variant="secondary" onClick={fecharFormulario} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar Feedback"}
            </Button>
          </div>
        </div>
      )}

      <div className={styles.historico}>
        <h3 className={styles.historicoTitulo}>Histórico</h3>
        {historico.length === 0 ? (
          <EmptyState
            message={
              <>
                <strong>Nenhum feedback registrado ainda.</strong>
                <br />
                Os feedbacks realizados ao longo da gestão podem ser registrados aqui para manter um histórico de
                acompanhamento do colaborador.
              </>
            }
          />
        ) : (
          <div className={styles.historicoLista}>
            {historico.map((f) => (
              <HistoricoFeedbackItem
                key={f.id}
                feedback={f}
                podeEditar={podeEditarFeedback(f)}
                onSalvar={(patch) => editarFeedback(f, patch)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface HistoricoFeedbackItemProps {
  feedback: Feedback;
  podeEditar: boolean;
  onSalvar: (patch: { dataFeedback: string; tema: TemaFeedback; comentarios: string }) => Promise<{ ok: true } | { ok: false }>;
}

function HistoricoFeedbackItem({ feedback, podeEditar, onSalvar }: HistoricoFeedbackItemProps) {
  const [editando, setEditando] = useState(false);
  const [dataFeedback, setDataFeedback] = useState(feedback.dataFeedback);
  const [tema, setTema] = useState<TemaFeedback>(feedback.tema);
  const [comentarios, setComentarios] = useState(feedback.comentarios);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function iniciarEdicao() {
    setDataFeedback(feedback.dataFeedback);
    setTema(feedback.tema);
    setComentarios(feedback.comentarios);
    setErro("");
    setEditando(true);
  }

  async function salvar() {
    if (!comentarios.trim()) {
      setErro("Descreva o feedback antes de salvar.");
      return;
    }
    setSalvando(true);
    setErro("");
    const resultado = await onSalvar({ dataFeedback, tema, comentarios: comentarios.trim() });
    setSalvando(false);
    if (resultado.ok) setEditando(false);
  }

  if (editando) {
    return (
      <Card className={styles.historicoItem}>
        <div className={styles.linha}>
          <div className={styles.campo}>
            <span className={styles.label}>Data do Feedback</span>
            <input type="date" className={styles.input} value={dataFeedback} onChange={(e) => setDataFeedback(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <span className={styles.label}>Tema</span>
            <select className={styles.select} value={tema} onChange={(e) => setTema(e.target.value as TemaFeedback)}>
              {TEMAS_FEEDBACK.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.campo}>
          <span className={styles.label}>Comentários</span>
          <textarea className={styles.textarea} rows={5} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </div>
        {erro && <p className={styles.erro}>{erro}</p>}
        <div className={styles.formularioAcoes}>
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar correção"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.historicoItem}>
      <div className={styles.historicoTopo}>
        <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
          {feedback.tema}
        </Badge>
        <div className={styles.historicoTopoDireita}>
          <span className={styles.historicoData}>{formatarDataIso(feedback.dataFeedback)}</span>
          {podeEditar && (
            <button type="button" className={styles.editarBtn} onClick={iniciarEdicao} title="Corrigir este feedback">
              <Pencil size={12} />
            </button>
          )}
        </div>
      </div>
      <p className={styles.historicoComentarios}>{feedback.comentarios}</p>
      <span className={styles.historicoAutor}>Registrado por {feedback.gestorNome}</span>
      {feedback.editadoPor && (
        <span className={styles.editadoTag}> · corrigido por {feedback.editadoPor} em {formatarDataHora(feedback.editadoEm)}</span>
      )}
    </Card>
  );
}
