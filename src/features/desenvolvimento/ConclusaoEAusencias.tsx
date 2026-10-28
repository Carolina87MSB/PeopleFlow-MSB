import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { conferirConclusao, type Conferencia, type Participante, type Treinamento } from "./devRepository";
import { CabecalhoDrawer, Carregando, Erro, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

/** Situação da ausência na lista de participantes: o encaminhamento (reposição ou dispensa) e a data prevista. */
export function SituacaoAusencia({ x }: { x: Participante }) {
  if (x.presenca_status !== "ausente") return null;
  if (x.ausencia_encaminhamento === "dispensa")
    return (
      <div className={styles.secundario} title={x.dispensa_justificativa ?? undefined}>
        <Selo tom="neutral">Dispensado pelo RH</Selo>
      </div>
    );
  if (x.ausencia_encaminhamento === "reposicao")
    return (
      <div className={styles.secundario} title={x.ausencia_justificativa ?? undefined}>
        <Selo tom="warning">Reposição pendente</Selo>
        {x.reposicao_prevista_em ? ` · prevista para ${formatarData(x.reposicao_prevista_em)}` : " · sem data prevista"}
      </div>
    );
  return (
    <div className={styles.secundario}>
      <Selo tom="danger">Sem encaminhamento</Selo>
    </div>
  );
}

/** Justificar a ausência e encaminhá-la: reposição (data prevista opcional) ou, só pelo RH, dispensa com justificativa. Não altera a presença registrada. */
export function AusenciaDrawer({ participante, ehRH, onFechar, onSalvar }: { participante: Participante; ehRH: boolean; onFechar: () => void; onSalvar: (corpo: { justificativa: string; encaminhamento: "reposicao" | "dispensa"; reposicao_prevista_em?: string }) => Promise<void> }) {
  const jaDispensado = participante.ausencia_encaminhamento === "dispensa";
  const [justificativa, setJustificativa] = useState(participante.ausencia_justificativa ?? participante.presenca_motivo ?? "");
  const [encaminhamento, setEncaminhamento] = useState<"reposicao" | "dispensa">(participante.ausencia_encaminhamento === "dispensa" ? "dispensa" : "reposicao");
  const [prevista, setPrevista] = useState(participante.reposicao_prevista_em?.slice(0, 10) ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Ausência" titulo={participante.pessoa?.nome ?? `#${participante.colaborador_id}`} sub="A conclusão da sessão não encerra a pendência deste participante: ela segue aberta até a reposição ou a dispensa." />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            await onSalvar({ justificativa: justificativa.trim(), encaminhamento, ...(encaminhamento === "reposicao" && prevista ? { reposicao_prevista_em: prevista } : {}) });
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
            setSalvando(false);
          }
        }}
      >
        {jaDispensado ? (
          <p className={styles.dica}>Dispensa já registrada pelo RH (registro histórico, não é alterado).</p>
        ) : (
          <>
            <label className={styles.campo}>
              Justificativa da ausência *
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={1000} required />
              <span className={styles.dica}>Não registre dados de saúde: use termos como "afastamento" ou "licença".</span>
            </label>
            <fieldset className={styles.secao} style={{ border: 0, padding: 0 }}>
              <label className={styles.check}>
                <input type="radio" name="encaminhamento" checked={encaminhamento === "reposicao"} onChange={() => setEncaminhamento("reposicao")} /> Haverá reposição
              </label>
              {encaminhamento === "reposicao" && (
                <label className={styles.campo}>
                  Data prevista da reposição (se já souber)
                  <input type="date" value={prevista} onChange={(e) => setPrevista(e.target.value)} />
                </label>
              )}
              {ehRH && (
                <label className={styles.check}>
                  <input type="radio" name="encaminhamento" checked={encaminhamento === "dispensa"} onChange={() => setEncaminhamento("dispensa")} /> Dispensar da reposição (autorização do RH, com a justificativa acima)
                </label>
              )}
              {!ehRH && <p className={styles.dica}>A dispensa de reposição é autorizada pelo RH, com justificativa.</p>}
            </fieldset>
          </>
        )}
        {erro && <Erro mensagem={erro} />}
        {!jaDispensado && (
          <div className={styles.acoes}>
            <Button type="submit" variant="primary" disabled={!justificativa.trim() || salvando}>
              {salvando ? "Salvando..." : "Salvar encaminhamento"}
            </Button>
          </div>
        )}
      </form>
    </Drawer>
  );
}

/** Conferência antes de concluir a SESSÃO: o que impede e o que permanece pendente depois. */
export function PainelConclusao({ t, versao, onConcluir }: { t: Treinamento; versao: number; onConcluir: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const conf = useConsulta<Conferencia | null>(() => (aberto ? conferirConclusao(t.id) : Promise.resolve(null)), [t.id, aberto, versao]);
  if (!aberto)
    return (
      <Button variant="success" onClick={() => setAberto(true)}>
        Conferir e concluir
      </Button>
    );
  const c = conf.dados;
  return (
    <div className={styles.realizacao} style={{ flexBasis: "100%" }}>
      <strong>Conferência antes da conclusão</strong>
      {conf.erro ? (
        <Erro mensagem={conf.erro} />
      ) : conf.carregando || !c ? (
        <Carregando />
      ) : (
        <>
          <div className={styles.secundario}>
            {c.resumo.presentes} presente{c.resumo.presentes === 1 ? "" : "s"} · {c.resumo.ausentes} ausente{c.resumo.ausentes === 1 ? "" : "s"} · {c.resumo.pendentes} pendente{c.resumo.pendentes === 1 ? "" : "s"} de registro
          </div>
          {c.impedimentos.length === 0 ? (
            <p>
              <Selo tom="success">Pronto para concluir</Selo> A conclusão registra quem concluiu, a data e o horário.
            </p>
          ) : (
            <>
              <p>
                <Selo tom="danger">Impede a conclusão</Selo>
              </p>
              <ul className={styles.historico}>
                {c.impedimentos.map((i) => (
                  <li key={i.codigo + i.mensagem}>{i.mensagem}</li>
                ))}
              </ul>
            </>
          )}
          {c.pendencias_apos.length > 0 && (
            <>
              <p>
                <Selo tom="warning">Permanece pendente depois de concluir</Selo>
              </p>
              <ul className={styles.historico}>
                {c.pendencias_apos.map((i) => (
                  <li key={i.codigo}>{i.mensagem}</li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.dica}>Concluir a sessão não encerra a reposição individual de quem faltou, a avaliação de reação nem a avaliação de eficácia.</p>
        </>
      )}
      <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
        <Button
          variant="success"
          disabled={!c?.pode_concluir || concluindo}
          onClick={() => {
            setConcluindo(true);
            void onConcluir()
              .then(() => setAberto(false))
              .catch(() => undefined)
              .finally(() => setConcluindo(false));
          }}
        >
          {concluindo ? "Concluindo..." : "Concluir treinamento"}
        </Button>
        <Button variant="ghost" onClick={() => conf.recarregar()}>
          Conferir novamente
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
