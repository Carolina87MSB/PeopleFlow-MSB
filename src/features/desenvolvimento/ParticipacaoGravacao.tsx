import { useState } from "react";
import { Video } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { AVISO_DECLARACAO_GRAVACAO, DECLARACAO_GRAVACAO, validarLinkGravacao } from "../../domain/gravacao";
import { confirmarPorGravacao, gravar, type ConfigGravacao } from "./devRepository";
import { Erro, Selo } from "./componentes";
import styles from "./Desenvolvimento.module.css";
import visual from "./ParticipacaoGravacao.module.css";

/** Seção "Participação por gravação" da página do treinamento (RH e quem conduz): habilita, informa o link do SharePoint e acompanha quem confirmou. */
export function GravacaoDoTreinamento({
  treinamentoId,
  status,
  config,
  podeConfigurar,
  ehRH,
  porGravacao,
  onAlterado,
}: {
  treinamentoId: number;
  status: string;
  config: ConfigGravacao | null;
  podeConfigurar: boolean;
  /** Depois da conclusão só o RH corrige o link (a confirmação já está encerrada). */
  ehRH: boolean;
  /** Quantos participantes confirmaram por gravação (RH identifica pelo método na lista de participantes). */
  porGravacao: number;
  onAlterado: () => void;
}) {
  const antesDaConclusao = status === "planejado" || status === "em_andamento";
  const editavel = podeConfigurar && antesDaConclusao;
  const podeCorrigirLink = editavel || (ehRH && status === "concluido");
  const [url, setUrl] = useState(config?.gravacao_url ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Recurso não ativado no banco, ou sem uso e sem permissão para configurar: a seção nem aparece.
  if (!config || (!config.permite_gravacao && !editavel)) return null;
  const encerrada = status === "concluido";

  async function salvar(corpo: { permitir?: boolean; url?: string | null }) {
    setErro(null);
    setSalvando(true);
    try {
      await gravar("gravacao_definir", { treinamento_id: treinamentoId, ...corpo });
      onAlterado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }
  const linkValido = url.trim() === "" || validarLinkGravacao(url) !== null;

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>
            <Video size={16} style={{ verticalAlign: "-2px" }} /> Participação por gravação
          </h3>
          <p className={styles.cardSubtitle}>
            {config.permite_gravacao ? "Habilitada: participantes da turma assistem à gravação e confirmam pelo PeopleFlow enquanto o treinamento estiver em andamento." : "Desabilitada para este treinamento."}
            {porGravacao > 0 ? ` ${porGravacao} confirmaram por gravação.` : ""}
          </p>
        </div>
        {config.permite_gravacao ? <Selo tom={config.gravacao_url ? "success" : "warning"}>{config.gravacao_url ? "Link disponível" : "Sem link"}</Selo> : <Selo tom="neutral">Desligada</Selo>}
      </div>
      {editavel && (
        <label className={styles.check} style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={config.permite_gravacao} disabled={salvando} onChange={(e) => void salvar({ permitir: e.target.checked })} /> Permitir participação por gravação
        </label>
      )}
      {config.permite_gravacao && (
        <>
          {podeCorrigirLink ? (
            <div className={visual.linha}>
              <input className={styles.input} type="url" inputMode="url" placeholder="https://suaempresa.sharepoint.com/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link da gravação no SharePoint" />
              <Button variant="primary" disabled={salvando || !linkValido || url.trim() === (config.gravacao_url ?? "")} onClick={() => void salvar({ url: url.trim() === "" ? null : url.trim() })}>
                {salvando ? "Salvando…" : "Salvar link"}
              </Button>
            </div>
          ) : null}
          {!linkValido && <p className={visual.aviso}>Use o link da gravação no SharePoint (https://…sharepoint.com/…).</p>}
          {config.gravacao_url && (
            <p className={styles.secundario} style={{ marginTop: 8 }}>
              <a href={config.gravacao_url} target="_blank" rel="noopener noreferrer" className={styles.linkAcao}>
                Abrir gravação
              </a>
            </p>
          )}
          <p className={styles.secundario} style={{ marginTop: 8 }}>
            {AVISO_DECLARACAO_GRAVACAO}{" "}
            {encerrada ? "Treinamento concluído: novas confirmações estão encerradas; a gravação continua acessível aos participantes." : "O RH decide quando concluir o treinamento; não há encerramento automático."}
          </p>
        </>
      )}
      {erro && <Erro mensagem={erro} />}
    </Card>
  );
}

/** Bloco do colaborador em "Meus treinamentos": assistir à gravação, declarar e confirmar a participação. */
export function BlocoGravacaoColaborador({ codigo, link, podeConfirmar, onConfirmada }: { codigo: string; link: string; podeConfirmar: boolean; onConfirmada: () => void }) {
  const [declaro, setDeclaro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      await confirmarPorGravacao(codigo);
      onConfirmada();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  }

  return (
    <div className={visual.bloco}>
      <a href={link} target="_blank" rel="noopener noreferrer" className={visual.assistir}>
        <Video size={16} /> Assistir à gravação
      </a>
      {podeConfirmar && (
        <>
          <label className={visual.declaracao}>
            <input type="checkbox" checked={declaro} onChange={(e) => setDeclaro(e.target.checked)} disabled={enviando} /> <span>{DECLARACAO_GRAVACAO}</span>
          </label>
          <p className={visual.aviso}>{AVISO_DECLARACAO_GRAVACAO}</p>
          <button type="button" className={visual.confirmar} disabled={!declaro || enviando} onClick={() => void confirmar()}>
            {enviando ? "Confirmando…" : "Confirmar participação"}
          </button>
        </>
      )}
      {erro && (
        <p className={visual.erro} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
