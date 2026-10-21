import { useState } from "react";
import { ESCALA, QUESTOES } from "../../domain/avaliacaoReacao";
import visual from "./FormularioReacao.module.css";

/** Formulário padronizado da Avaliação de Reação: 5 perguntas, escala de 1 a 5, uma resposta por participação.
 * Componente leve (sem dependência do portal): usado em "Meus treinamentos" e na página de presença por QR. */
export function FormularioReacao({ titulo, onEnviar, onCancelar }: { titulo: string; onEnviar: (respostas: number[]) => Promise<void>; onCancelar?: () => void }) {
  const [notas, setNotas] = useState<(number | null)[]>(() => QUESTOES.map(() => null));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const completo = notas.every((n) => n !== null);

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
      <div>
        <p className={visual.eyebrow}>Avaliação do treinamento</p>
        <h4 className={visual.titulo}>{titulo}</h4>
        <p className={visual.ajuda}>Dê uma nota de 1 a 5 para cada afirmação (1 = discordo totalmente, 5 = concordo totalmente). Você responde uma vez só.</p>
      </div>
      {QUESTOES.map((q, i) => (
        <fieldset key={i} className={visual.pergunta}>
          <legend className={visual.enunciado}>
            {i + 1}. {q}
          </legend>
          <div className={visual.escala} role="radiogroup" aria-label={q}>
            {ESCALA.map((e) => (
              <label key={e.valor} className={[visual.opcao, notas[i] === e.valor ? visual.marcada : ""].join(" ")} title={e.rotulo}>
                <input type="radio" name={`q${i + 1}`} value={e.valor} checked={notas[i] === e.valor} onChange={() => setNotas((n) => n.map((x, j) => (j === i ? e.valor : x)))} />
                <span>{e.valor}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {erro && (
        <p className={visual.erro} role="alert">
          {erro}
        </p>
      )}
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
    </form>
  );
}
