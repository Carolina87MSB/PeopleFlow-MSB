import { useState } from "react";
import { Button, Card } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { decidirSolicitacaoHabilitacao, listarSolicitacoesHabilitacao, opcoesSolicitacaoHabilitacao, solicitarHabilitacao, type SolicitacaoHabilitacao } from "./devRepository";
import { Carregando, ConfirmarComMotivo, Erro, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const SITUACAO = {
  pendente: { rotulo: "Pendente", tom: "warning" },
  aprovada: { rotulo: "Aprovada", tom: "success" },
  rejeitada: { rotulo: "Rejeitada", tom: "danger" },
} as const;

/** Solicitações já decididas ou em andamento: quem pediu, a situação, a decisão do RH (autor, data e justificativa). */
function ListaSolicitacoes({ itens, mostrarSolicitante }: { itens: SolicitacaoHabilitacao[]; mostrarSolicitante: boolean }) {
  return (
    <ul className={styles.historico}>
      {itens.map((s) => (
        <li key={s.id}>
          <strong>{s.colaborador.nome}</strong> <Selo tom={SITUACAO[s.status].tom}>{SITUACAO[s.status].rotulo}</Selo>
          <div className={styles.secundario}>
            {s.departamento || "—"}
            {mostrarSolicitante ? ` · solicitada por ${s.solicitante.nome}` : ""} · em {formatarData(s.solicitado_em)}
            {s.status !== "pendente" ? ` · decidida em ${formatarData(s.decidido_em)}${s.decisor ? ` por ${s.decisor}` : ""}` : " · aguardando o RH"}
          </div>
          <div className={styles.dica}>Justificativa: {s.justificativa}</div>
          {s.decisao_justificativa && <div className={styles.dica}>Decisão do RH: {s.decisao_justificativa}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Gestor: pede ao RH a habilitação de um colaborador da sua equipe (colaborador + justificativa) e acompanha os seus pedidos. */
export function SolicitarHabilitacao() {
  const { flash } = useToast();
  const opcoes = useConsulta(() => opcoesSolicitacaoHabilitacao(), []);
  const minhas = useConsulta(() => listarSolicitacoesHabilitacao(), []);
  const [colaborador, setColaborador] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const lista = minhas.dados ?? [];

  return (
    <div className={styles.secao}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            const r = await solicitarHabilitacao(Number(colaborador), justificativa.trim());
            flash(r.notificacao.enviados > 0 ? "Solicitação enviada ao RH, que foi avisado por e-mail." : "Solicitação registrada. Não foi possível avisar o RH por e-mail; ele a verá em Pendências.");
            setColaborador("");
            setJustificativa("");
            minhas.recarregar();
            opcoes.recarregar();
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <h4 className={styles.secaoTitulo}>Solicitar habilitação</h4>
        <p className={styles.dica}>
          Você já registra e administra os treinamentos da sua área. Para que um colaborador da sua equipe também possa registrar e administrar treinamentos, solicite a habilitação: ela só vale depois da aprovação do RH.
        </p>
        <div className={styles.grid}>
          <label className={styles.campo}>
            Colaborador da equipe *
            <select value={colaborador} onChange={(e) => setColaborador(e.target.value)} required>
              <option value="">{opcoes.carregando && !opcoes.dados ? "Carregando..." : "Selecione"}</option>
              {(opcoes.dados ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} — {o.departamento || o.cargo}
                </option>
              ))}
            </select>
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa *
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={1000} required placeholder="Por que este colaborador precisa administrar treinamentos? Não registre dados de saúde." />
          </label>
        </div>
        {opcoes.erro && <Erro mensagem={opcoes.erro} />}
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={!colaborador || !justificativa.trim() || salvando}>
            {salvando ? "Enviando..." : "Solicitar habilitação"}
          </Button>
        </div>
      </form>

      <h4 className={styles.secaoTitulo}>Minhas solicitações ({lista.length})</h4>
      {minhas.erro ? <Erro mensagem={minhas.erro} /> : minhas.carregando && !minhas.dados ? <Carregando /> : lista.length === 0 ? <p className={styles.secundario}>Você ainda não fez solicitações.</p> : <ListaSolicitacoes itens={lista} mostrarSolicitante={false} />}
    </div>
  );
}

/** RH: histórico das solicitações já decididas (autor, data e justificativa da decisão). */
export function HistoricoSolicitacoes({ versao }: { versao?: number }) {
  const consulta = useConsulta(() => listarSolicitacoesHabilitacao(), [versao]);
  const decididas = (consulta.dados ?? []).filter((s) => s.status !== "pendente");
  return (
    <>
      <h4 className={styles.secaoTitulo}>Histórico de solicitações ({decididas.length})</h4>
      {consulta.erro ? <Erro mensagem={consulta.erro} /> : consulta.carregando && !consulta.dados ? <Carregando /> : decididas.length === 0 ? <p className={styles.secundario}>Nenhuma solicitação decidida.</p> : <ListaSolicitacoes itens={decididas} mostrarSolicitante />}
    </>
  );
}

/** RH (aba Pendências): solicitações de habilitação aguardando decisão, com Aprovar e Rejeitar (registra quem decidiu, quando e por quê). */
export function SolicitacoesPendentesRH() {
  const { flash } = useToast();
  const consulta = useConsulta(() => listarSolicitacoesHabilitacao(), []);
  const [criarAcesso, setCriarAcesso] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const pendentes = (consulta.dados ?? []).filter((s) => s.status === "pendente");

  async function decidir(s: SolicitacaoHabilitacao, decisao: "aprovar" | "rejeitar", justificativa: string) {
    setErro(null);
    try {
      await decidirSolicitacaoHabilitacao(s.id, decisao, justificativa, Boolean(criarAcesso[s.id]));
      flash(decisao === "aprovar" ? `Habilitação aprovada: ${s.colaborador.nome} já pode administrar treinamentos.` : "Solicitação rejeitada.");
      consulta.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Solicitações de habilitação pendentes ({pendentes.length})</h3>
          <p className={styles.cardSubtitle}>Gestores pedem a habilitação de colaboradores da equipe. A habilitação só vale depois da sua aprovação; a decisão fica registrada (autor, data e justificativa).</p>
        </div>
      </div>
      {consulta.erro ? (
        <Erro mensagem={consulta.erro} />
      ) : consulta.carregando && !consulta.dados ? (
        <Carregando />
      ) : pendentes.length === 0 ? (
        <p className={styles.secundario}>Nenhuma solicitação pendente.</p>
      ) : (
        <ul className={styles.historico}>
          {pendentes.map((s) => (
            <li key={s.id}>
              <strong>{s.colaborador.nome}</strong> <Selo tom="warning">Pendente</Selo>
              <div className={styles.secundario}>
                {s.departamento || "—"} · solicitada por {s.solicitante.nome} em {formatarData(s.solicitado_em)}
              </div>
              <div className={styles.dica}>Justificativa: {s.justificativa}</div>
              {s.ja_habilitado && <div className={styles.dica}>Este colaborador já foi habilitado por outro caminho: rejeite a solicitação para encerrá-la.</div>}
              {!s.ja_habilitado && s.tem_acesso === false && (
                <label className={styles.check}>
                  <input type="checkbox" checked={Boolean(criarAcesso[s.id])} onChange={(e) => setCriarAcesso((m) => ({ ...m, [s.id]: e.target.checked }))} /> Criar acesso ao portal (somente Treinamentos) — {s.colaborador.nome.split(" ")[0]} ainda não tem conta; não recebe AVD nem outros módulos
                </label>
              )}
              <div className={styles.acoes} style={{ justifyContent: "flex-start", marginTop: 8 }}>
                <ConfirmarComMotivo rotulo="Aprovar" confirmar="Aprovar habilitação" variante="success" motivoObrigatorio={false} desabilitado={Boolean(s.ja_habilitado) || (s.tem_acesso === false && !criarAcesso[s.id])} onConfirmar={(m) => decidir(s, "aprovar", m)} />
                <ConfirmarComMotivo rotulo="Rejeitar" confirmar="Rejeitar solicitação" variante="danger" motivoObrigatorio onConfirmar={(m) => decidir(s, "rejeitar", m)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {erro && <Erro mensagem={erro} />}
    </Card>
  );
}
