import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal } from "../../components/ui";
import { ordenarFeedbacks, TEMAS_FEEDBACK } from "../../domain/feedback";
import { formatarDataIso, hojeIso } from "../../domain/dates";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador, TemaFeedback } from "../../types/domain";
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
  const { feedbacksVisiveis, registrarFeedback } = usePortalData();
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
              <Card key={f.id} className={styles.historicoItem}>
                <div className={styles.historicoTopo}>
                  <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
                    {f.tema}
                  </Badge>
                  <span className={styles.historicoData}>{formatarDataIso(f.dataFeedback)}</span>
                </div>
                <p className={styles.historicoComentarios}>{f.comentarios}</p>
                <span className={styles.historicoAutor}>Registrado por {f.gestorNome}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
