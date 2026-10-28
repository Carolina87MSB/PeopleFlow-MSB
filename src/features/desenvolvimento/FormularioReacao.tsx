import { useState } from "react";
import { ESCALA, QUESTOES } from "../../domain/avaliacaoReacao";
import visual from "./FormularioReacao.module.css";

/** Formulário padronizado da Avaliação de Reação: 5 perguntas, escala de 1 a 5, uma resposta por participação.
 * Componente leve (sem dependência do portal): usado em "Meus treinamentos" e na página de presença por QR. */
export function FormularioReacao({ titulo, textoPrazo, onEnviar, onCancelar }: { titulo: string; textoPrazo?: string; onEnviar: (respostas: number[]) => Promise<void>; onCancelar?: () => void }) {
  const [notas, setNotas] = useState<(number | null)[]>(() => QUESTOES.map(() => null));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const completo = notas.every((n) => n !== null);
  const respondidas = notas.filter((n) => n !== null).length;
  const primeira = ESCALA[0];
  const ultima = ESCALA[ESCALA.length - 1];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!completo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar(notas as number[]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <form className={visual.formulario} onSubmit={enviar} aria-label="Avaliação do treinamento">
      <div className={visual.cabecalho}>
        <p className={visual.eyebrow}>Avaliação do treinamento</p>
        <h4 className={visual.titulo}>{titulo}</h4>
        <p className={visual.ajuda}>Dê uma nota de 1 a 5 para cada afirmação. Você responde uma vez só.</p>
        <p className={visual.ajuda}>Suas notas são tratadas de forma consolidada: o RH sabe quem respondeu, mas não vê a nota de cada pessoa.</p>
        {textoPrazo && <p className={visual.prazo}>{textoPrazo}</p>}
      </div>
      <div className={visual.legenda} role="group" aria-label="Significado da escala">
        <span className={visual.legendaTitulo}>Escala de resposta</span>
        <ol className={visual.legendaLista}>
          {ESCALA.map((e) => (
            <li key={e.valor} className={visual.legendaItem}>
              <b className={visual.legendaNota}>{e.valor}</b>
              <span>{e.rotulo}</span>
            </li>
          ))}
        </ol>
      </div>
      {QUESTOES.map((q, i) => (
        <fieldset key={i} className={visual.pergunta}>
          <legend className={visual.enunciado}>
            <span className={visual.numero} aria-hidden="true">
              {i + 1}
            </span>
            <span>{q}</span>
          </legend>
          <div className={visual.escala} role="radiogroup" aria-label={q}>
            {ESCALA.map((e) => (
              <label key={e.valor} className={[visual.opcao, notas[i] === e.valor ? visual.marcada : ""].join(" ")} title={e.rotulo}>
                <input type="radio" name={`q${i + 1}`} value={e.valor} aria-label={`${e.valor} — ${e.rotulo}`} checked={notas[i] === e.valor} onChange={() => setNotas((n) => n.map((x, j) => (j === i ? e.valor : x)))} />
                <span className={visual.nota}>{e.valor}</span>
                <span className={visual.rotulo}>{e.rotulo}</span>
              </label>
            ))}
          </div>
          <div className={visual.extremos} aria-hidden="true">
            <span>
              {primeira.valor} = {primeira.rotulo}
            </span>
            <span>
              {ultima.valor} = {ultima.rotulo}
            </span>
          </div>
        </fieldset>
      ))}
      {erro && (
        <p className={visual.erro} role="alert">
          {erro}
        </p>
      )}
      <div className={visual.rodape}>
        <p className={visual.progresso} aria-live="polite">
          {completo ? "Todas as perguntas respondidas." : `${respondidas} de ${QUESTOES.length} perguntas respondidas.`}
        </p>
        <div className={visual.acoes}>
          <button type="submit" className={visual.enviar} disabled={!completo || enviando}>
            {enviando ? "Enviando…" : "Enviar avaliação"}
          </button>
          {onCancelar && (
            <button type="button" className={visual.cancelar} onClick={onCancelar} disabled={enviando}>
              Responder depois
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
