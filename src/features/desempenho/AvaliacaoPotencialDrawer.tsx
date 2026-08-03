import { useEffect, useState } from "react";
import { Badge, Button, Drawer } from "../../components/ui";
import { ESCALA_COMPORTAMENTAL } from "../../domain/avaliacaoDesempenho";
import { avaliacaoPotencialCompleta, calcularNotaPotencial, itensPendentesPotencial } from "../../domain/avaliacaoPotencial";
import { formatarDataHora, formatarHoraAtual } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoPotencial, StatusAvaliacaoDesempenho } from "../../types/domain";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

const AUTOSAVE_DEBOUNCE_MS = 1200;

interface AvaliacaoPotencialDrawerProps {
  avaliacao: AvaliacaoPotencial;
  onClose: () => void;
}

/** Ficha de preenchimento da Avaliação de Potencial (Etapa 4) — 5 perguntas
 * fixas (escala 1-5, mesma da AVD), nota = média simples, calculada ao vivo
 * (calcularNotaPotencial() em domain/avaliacaoPotencial.ts). Independente
 * da AVD — não altera nota_final nem o PDI. "Concluir" só disponível
 * quando as 5 perguntas têm nota; RH pode reabrir uma ficha concluída,
 * mesmo com o ciclo já encerrado (ver podeEditarAvaliacaoPotencial em
 * usePortalData.ts). */
export function AvaliacaoPotencialDrawer({ avaliacao, onClose }: AvaliacaoPotencialDrawerProps) {
  const { ciclosAvaliacaoDesempenho, perfil, salvarAvaliacaoPotencial, reabrirAvaliacaoPotencial, podeEditarAvaliacaoPotencial } =
    usePortalData();

  const podeEditar = podeEditarAvaliacaoPotencial(avaliacao);
  const cicloEncerrado = ciclosAvaliacaoDesempenho.find((c) => c.id === avaliacao.cicloId)?.status === "Encerrado";

  const [rascunho, setRascunho] = useState<AvaliacaoPotencial>(() => ({
    ...avaliacao,
    respostas: avaliacao.respostas.map((r) => ({ ...r })),
  }));
  const [salvando, setSalvando] = useState<"progresso" | "concluir" | "reabrir" | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [ultimoSalvoAutoHora, setUltimoSalvoAutoHora] = useState<string | null>(null);

  // Ponto único de cálculo — o mesmo usado ao salvar, pra este preview
  // nunca divergir do valor efetivamente gravado (ver calcularNotaPotencial()).
  const notaPotencial = calcularNotaPotencial(rascunho.respostas);
  const completa = avaliacaoPotencialCompleta(rascunho);
  const pendencias = itensPendentesPotencial(rascunho);

  async function persistir(status: StatusAvaliacaoDesempenho) {
    const atualizado: AvaliacaoPotencial = { ...rascunho, status };
    const result = await salvarAvaliacaoPotencial(atualizado);
    if (result.ok) {
      setRascunho(atualizado);
      setSujo(false);
    }
    return result;
  }

  // Autosave debounced — mesmo padrão da AVD: qualquer edição agenda uma
  // gravação silenciosa ~1,2s depois da última mudança; a 1ª gravação já
  // promove "Não iniciada" -> "Em andamento" sozinha.
  useEffect(() => {
    if (!podeEditar || !sujo || salvando !== null) return;
    const timer = setTimeout(async () => {
      setSalvandoAuto(true);
      const status = rascunho.status === "Não iniciada" ? "Em andamento" : rascunho.status;
      await persistir(status);
      setSalvandoAuto(false);
      setUltimoSalvoAutoHora(formatarHoraAtual());
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho, sujo, podeEditar, salvando]);

  function atualizarResposta(perguntaId: string, nota: number) {
    setRascunho((r) => ({
      ...r,
      respostas: r.respostas.map((resp) => (resp.perguntaId === perguntaId ? { ...resp, nota } : resp)),
    }));
    setSujo(true);
  }

  function atualizarComentario(valor: string) {
    setRascunho((r) => ({ ...r, comentario: valor }));
    setSujo(true);
  }

  async function handleSalvar(tipo: "progresso" | "concluir") {
    setSalvando(tipo);
    const status = tipo === "concluir" ? "Concluída" : rascunho.status === "Não iniciada" ? "Em andamento" : rascunho.status;
    const result = await persistir(status);
    setSalvando(null);
    if (result.ok && tipo === "concluir") onClose();
  }

  async function handleReabrir() {
    setSalvando("reabrir");
    const result = await reabrirAvaliacaoPotencial(rascunho);
    setSalvando(null);
    if (result.ok) setRascunho((r) => ({ ...r, status: "Em andamento", concluidoPor: "", concluidoEm: null }));
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{avaliacao.colaboradorNome}</div>
          <div className={styles.drawerSub}>
            Avaliação de Potencial · {avaliacao.cargo ? formatarNomeCargo(avaliacao.cargo) : "—"} · {avaliacao.ciclo}
          </div>
        </div>
      }
    >
      <div className={styles.statusRow}>
        <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
          {rascunho.status}
        </Badge>
        {rascunho.status === "Concluída" && (
          <span className={styles.trancada}>
            Concluída por {rascunho.concluidoPor || "—"} em {formatarDataHora(rascunho.concluidoEm)}.
          </span>
        )}
        {!podeEditar && rascunho.status !== "Concluída" && cicloEncerrado && (
          <span className={styles.trancada}>Ciclo encerrado — sem edição.</span>
        )}
        {!podeEditar && rascunho.status !== "Concluída" && !cicloEncerrado && (
          <span className={styles.trancada}>Somente leitura — quem preenche é {rascunho.gestorAvaliador || "outra pessoa"}.</span>
        )}
        {podeEditar && (salvandoAuto || ultimoSalvoAutoHora) && (
          <span className={styles.autosaveIndicador}>{salvandoAuto ? "Salvando..." : `Salvo automaticamente às ${ultimoSalvoAutoHora}`}</span>
        )}
      </div>

      <h4 className={styles.sectionTitle}>Perguntas Avaliativas</h4>
      <div className={styles.competenciaBloco}>
        <div className={styles.competenciaTopo}>
          <span className={styles.competenciaNome}>Potencial de crescimento</span>
          {notaPotencial !== null && <span className={styles.mediaPill}>Nota: {notaPotencial}</span>}
        </div>
        {rascunho.respostas.map((resposta) => (
          <div key={resposta.perguntaId} className={styles.afirmacaoRow}>
            <span className={styles.afirmacaoTexto}>{resposta.pergunta}</span>
            <div className={styles.escala}>
              {ESCALA_COMPORTAMENTAL.map(({ nota }) => (
                <button
                  key={nota}
                  type="button"
                  className={resposta.nota === nota ? styles.notaBotaoAtivo : styles.notaBotao}
                  onClick={() => atualizarResposta(resposta.perguntaId, nota)}
                  disabled={!podeEditar}
                  title={ESCALA_COMPORTAMENTAL.find((e) => e.nota === nota)?.significado}
                >
                  {nota}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.resumo}>
        <h4 className={styles.sectionTitle}>Resumo</h4>
        <div className={styles.resumoLinhaFinal}>
          <span>Nota Final de Potencial</span>
          <strong>{notaPotencial ?? "—"}</strong>
        </div>
      </div>

      <h4 className={styles.sectionTitle}>Comentários (opcional)</h4>
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="comentario-potencial">
          Pontos fortes, situações que justificam a avaliação, oportunidades de desenvolvimento
        </label>
        <textarea
          id="comentario-potencial"
          className={styles.textarea}
          rows={4}
          value={rascunho.comentario}
          onChange={(e) => atualizarComentario(e.target.value)}
          disabled={!podeEditar}
        />
      </div>

      {podeEditar && !completa && pendencias.length > 0 && (
        <div className={styles.pendencias}>
          <span className={styles.pendenciasTitulo}>Perguntas pendentes para concluir:</span>
          <ul className={styles.pendenciasLista}>
            {pendencias.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.edicaoAcoes}>
        {perfil === "RH" && rascunho.status === "Concluída" && (
          <Button variant="danger" onClick={handleReabrir} disabled={salvando !== null}>
            {salvando === "reabrir" ? "Reabrindo..." : "Reabrir avaliação"}
          </Button>
        )}
        {podeEditar && (
          <>
            <Button variant="secondary" onClick={() => handleSalvar("progresso")} disabled={salvando !== null}>
              {salvando === "progresso" ? "Salvando..." : "Salvar progresso"}
            </Button>
            <Button variant="primary" onClick={() => handleSalvar("concluir")} disabled={!completa || salvando !== null}>
              {salvando === "concluir" ? "Concluindo..." : "Concluir avaliação"}
            </Button>
          </>
        )}
      </div>
    </Drawer>
  );
}
