import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card, tableStyles } from "../../components/ui";
import { meuHistorico, responderReacao, type LinhaMeuHistorico } from "./devRepository";
import { Carregando, Erro, EstadoVazio, Selo, TagTeste } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarCarga, formatarData } from "./rotulos";
import { FormularioReacao } from "./FormularioReacao";
import { BlocoGravacaoColaborador } from "./ParticipacaoGravacao";
import styles from "./Desenvolvimento.module.css";
import mobile from "./MeusTreinamentos.module.css";

const PRESENCA = {
  presente: { rotulo: "Presente", tom: "success" },
  ausente: { rotulo: "Ausente", tom: "warning" },
  pendente: { rotulo: "A confirmar", tom: "neutral" },
} as const;

const SITUACAO = {
  realizado: { rotulo: "Realizado", tom: "success" },
  ausente: { rotulo: "Ausente", tom: "warning" },
  agendado: { rotulo: "Agendado", tom: "info" },
} as const;

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Texto do prazo da avaliação (7 dias corridos após a presença; vencida ainda pode ser respondida). */
const textoPrazo = (t: LinhaMeuHistorico) =>
  !t.avaliacao_prazo ? undefined : t.avaliacao === "vencida" ? `O prazo terminou em ${formatarData(t.avaliacao_prazo)}, mas você ainda pode responder.` : `Responda até ${formatarData(t.avaliacao_prazo)}.`;

/** Avaliação de reação: Pendente ou Vencida (com prazo e botão, também depois da conclusão), Respondida (data e hora) ou nada quando não se aplica. */
function CelulaAvaliacao({ t, onAvaliar }: { t: LinhaMeuHistorico; onAvaliar: () => void }) {
  if (t.avaliacao === "pendente" || t.avaliacao === "vencida") {
    const vencida = t.avaliacao === "vencida";
    return (
      <div className={mobile.avaliacao}>
        <div className={mobile.avaliacaoLinha}>
          <Selo tom={vencida ? "danger" : "warning"}>{vencida ? "Vencida" : "Pendente"}</Selo>
          {t.avaliacao_prazo && (
            <span className={mobile.avaliacaoPrazo}>
              {vencida ? "Prazo encerrado em " : "Prazo: "}
              <strong>{formatarData(t.avaliacao_prazo)}</strong>
            </span>
          )}
        </div>
        {vencida && <span className={mobile.avaliacaoPrazo}>Você ainda pode responder.</span>}
        <button type="button" className={mobile.responder} onClick={onAvaliar}>
          Responder avaliação
        </button>
      </div>
    );
  }
  if (t.avaliacao === "respondida")
    return (
      <div className={mobile.avaliacao}>
        <div className={mobile.avaliacaoLinha}>
          <Selo tom="success">Respondida</Selo>
        </div>
        {t.avaliacao_em && <span className={mobile.avaliacaoPrazo}>em {dataHora.format(new Date(t.avaliacao_em))}</span>}
      </div>
    );
  return <span className={styles.secundario}>—</span>;
}

/** "Meus treinamentos": consulta do próprio histórico por qualquer colaborador (o servidor identifica a pessoa pela conta). */
export default function MeusTreinamentosPage() {
  const consulta = useConsulta(() => meuHistorico(), []);
  const itens = consulta.dados?.treinamentos ?? [];
  const [avaliando, setAvaliando] = useState<string | null>(null);
  const alvo = itens.find((t) => t.codigo === avaliando && (t.avaliacao === "pendente" || t.avaliacao === "vencida")) ?? null;
  return (
    <>
      <Header />
      <Card>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>Meus treinamentos</h3>
            <p className={styles.cardSubtitle}>Treinamentos agendados e realizados por você, do mais recente para o mais antigo</p>
          </div>
        </div>
        {alvo && (
          <FormularioReacao
            titulo={alvo.titulo}
            textoPrazo={textoPrazo(alvo)}
            onCancelar={() => setAvaliando(null)}
            onEnviar={async (respostas) => {
              await responderReacao(alvo.codigo as string, respostas);
              setAvaliando(null);
              consulta.recarregar();
            }}
          />
        )}
        {consulta.erro ? (
          <Erro mensagem={consulta.erro} />
        ) : consulta.carregando || !consulta.dados ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <EstadoVazio icone={<GraduationCap size={26} strokeWidth={1.6} />} titulo="Nenhum treinamento registrado para você no PeopleFlow." descricao="Os treinamentos aparecem aqui depois que você é incluído na turma." />
        ) : (
          <>
            <div className={[tableStyles.wrap, mobile.tabela].join(" ")}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Treinamento</th>
                    <th>Documento</th>
                    <th>Data</th>
                    <th>Carga</th>
                    <th>Presença</th>
                    <th>Situação</th>
                    <th>Avaliação</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((t, i) => (
                    <tr key={`${t.codigo}-${i}`}>
                      <td>
                        {t.titulo}
                        {t.teste && <TagTeste />}
                        {t.codigo && <div className={styles.secundario}>{t.codigo}</div>}
                        {t.gravacao && t.codigo && <BlocoGravacaoColaborador codigo={t.codigo} link={t.gravacao.link} podeConfirmar={t.gravacao.pode_confirmar} onConfirmada={consulta.recarregar} />}
                      </td>
                      <td className={styles.secundario}>{t.documento ?? "—"}</td>
                      <td className={styles.mono}>{formatarData(t.data)}</td>
                      <td className={styles.mono}>{formatarCarga(t.carga_min)}</td>
                      <td>
                        <Selo tom={PRESENCA[t.presenca].tom}>{PRESENCA[t.presenca].rotulo}</Selo>
                      </td>
                      <td>
                        <Selo tom={SITUACAO[t.situacao].tom}>{SITUACAO[t.situacao].rotulo}</Selo>
                      </td>
                      <td>
                        <CelulaAvaliacao t={t} onAvaliar={() => setAvaliando(t.codigo)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={mobile.cartoes} aria-label="Meus treinamentos">
              {itens.map((t, i) => (
                <li key={`${t.codigo}-${i}`} className={mobile.cartao}>
                  <div className={mobile.topo}>
                    <h4 className={mobile.titulo}>
                      {t.titulo}
                      {t.teste && <TagTeste />}
                    </h4>
                    <Selo tom={SITUACAO[t.situacao].tom}>{SITUACAO[t.situacao].rotulo}</Selo>
                  </div>
                  {t.codigo && <span className={mobile.codigo}>{t.codigo}</span>}
                  <dl className={mobile.dados}>
                    <div className={mobile.cheio}>
                      <dt>Documento</dt>
                      <dd>{t.documento ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Data</dt>
                      <dd>{formatarData(t.data)}</dd>
                    </div>
                    <div>
                      <dt>Carga</dt>
                      <dd>{formatarCarga(t.carga_min)}</dd>
                    </div>
                    <div>
                      <dt>Presença</dt>
                      <dd>{PRESENCA[t.presenca].rotulo}</dd>
                    </div>
                    {t.avaliacao && (
                      <div className={mobile.cheio}>
                        <dt>Avaliação</dt>
                        <dd>
                          <CelulaAvaliacao t={t} onAvaliar={() => setAvaliando(t.codigo)} />
                        </dd>
                      </div>
                    )}
                  </dl>
                  {t.gravacao && t.codigo && <BlocoGravacaoColaborador codigo={t.codigo} link={t.gravacao.link} podeConfirmar={t.gravacao.pode_confirmar} onConfirmada={consulta.recarregar} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
