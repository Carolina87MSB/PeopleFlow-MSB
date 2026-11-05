import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, tableStyles } from "../../components/ui";
import { listarPendencias, type Pendencias, type PendenciaReposicao } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Carregando, Erro, EstadoVazio, Selo, TagTeste } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import { TransferirResponsabilidade } from "./Habilitacoes";
import { SolicitacoesPendentesRH } from "./SolicitacoesHabilitacao";
import { CheckCircle2 } from "lucide-react";
import styles from "./Desenvolvimento.module.css";

const SITUACAO_REPOSICAO: Record<PendenciaReposicao["situacao"], { rotulo: string; tom: "danger" | "warning" | "info" }> = {
  sem_encaminhamento: { rotulo: "Sem encaminhamento", tom: "danger" },
  a_programar: { rotulo: "Reposição a programar", tom: "warning" },
  programada: { rotulo: "Reposição programada", tom: "info" },
};
const MOTIVO_SEM_RESPONSAVEL = {
  sem_responsavel: "Sem responsável definido",
  responsavel_desligado: "Responsável desligado",
  responsavel_sem_habilitacao: "Responsável sem habilitação ativa",
} as const;

/** Pendências: reposições individuais em aberto (a conclusão da sessão não as encerra), eficácia, treinamentos sem responsável habilitado e registros incompletos.
 * RH vê todas; a liderança, as da sua área; o responsável habilitado, as dos treinamentos que administra. */
export function PendenciasAba() {
  const { perfil } = useDesenvolvimento();
  const navigate = useNavigate();
  const [incluirTeste, setIncluirTeste] = useState(false);
  const consulta = useConsulta<Pendencias>(() => listarPendencias(incluirTeste), [incluirTeste]);
  const [transferindo, setTransferindo] = useState<number | null>(null);
  const ehRH = perfil === "RH";
  const d = consulta.dados;
  const abrir = (id: number) => navigate(`/desenvolvimento/treinamento/${id}`);
  const vazio = d && d.reposicoes.length + d.eficacia.length + d.sem_responsavel.length + d.inconsistencias.length === 0;
  return (
    <>
    {ehRH && <SolicitacoesPendentesRH />}
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Pendências de treinamentos</h3>
          <p className={styles.cardSubtitle}>
            {ehRH ? "Tudo o que segue em aberto na empresa: concluir a sessão não regulariza quem faltou." : perfil === "Gestor" ? "Pendências dos treinamentos da sua área." : "Pendências dos treinamentos que você administra."}
          </p>
        </div>
        {ehRH && (
          <label className={styles.check}>
            <input type="checkbox" checked={incluirTeste} onChange={(e) => setIncluirTeste(e.target.checked)} /> Incluir treinamentos de teste (homologação)
          </label>
        )}
      </div>
      {consulta.erro ? (
        <Erro mensagem={consulta.erro} />
      ) : consulta.carregando || !d ? (
        <Carregando />
      ) : vazio ? (
        <EstadoVazio icone={<CheckCircle2 size={26} strokeWidth={1.6} />} titulo="Nenhuma pendência." descricao="Reposições, eficácia e registros estão em dia." />
      ) : (
        <>
          <section className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Reposições individuais ({d.reposicoes.length})</h4>
            {d.reposicoes.length === 0 ? (
              <p className={styles.secundario}>Nenhum participante aguardando reposição.</p>
            ) : (
              <div className={tableStyles.wrap}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Treinamento original</th>
                      <th>Justificativa</th>
                      <th>Situação</th>
                      <th>Previsão</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.reposicoes.map((r) => (
                      <tr key={`${r.treinamento_id}-${r.colaborador_id}`}>
                        <td>{r.nome}</td>
                        <td>
                          {r.titulo}
                          {r.teste && <TagTeste />}
                          <div className={styles.secundario}>
                            {r.codigo} · realizado em {formatarData(r.data_realizacao)}
                          </div>
                        </td>
                        <td className={styles.secundario}>{r.justificativa || "—"}</td>
                        <td>
                          <Selo tom={SITUACAO_REPOSICAO[r.situacao].tom}>{SITUACAO_REPOSICAO[r.situacao].rotulo}</Selo>
                          {r.reposicao && (
                            <div className={styles.secundario}>
                              {r.reposicao.codigo} · {formatarData(r.reposicao.data_inicio)}
                            </div>
                          )}
                        </td>
                        <td className={styles.mono}>{r.prevista_em ? formatarData(r.prevista_em) : "—"}</td>
                        <td>
                          <button type="button" className={styles.linkAcao} onClick={() => abrir(r.treinamento_id)}>
                            Abrir treinamento
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {ehRH && (
            <section className={styles.secao}>
              <h4 className={styles.secaoTitulo}>Treinamentos sem responsável habilitado ({d.sem_responsavel.length})</h4>
              {d.sem_responsavel.length === 0 ? (
                <p className={styles.secundario}>Todos os treinamentos pendentes têm um responsável habilitado.</p>
              ) : (
                <ul className={styles.historico}>
                  {d.sem_responsavel.map((s) => (
                    <li key={s.treinamento_id}>
                      <strong>
                        {s.codigo} — {s.titulo}
                      </strong>{" "}
                      {s.teste && <TagTeste />}
                      <Selo tom="warning">{MOTIVO_SEM_RESPONSAVEL[s.motivo]}</Selo>
                      <div className={styles.secundario}>
                        {s.responsavel ? `Responsável: ${s.responsavel} · ` : ""}
                        {s.status.replace("_", " ")}{" "}
                        <button type="button" className={styles.linkAcao} onClick={() => abrir(s.treinamento_id)}>
                          Abrir
                        </button>{" "}
                        <button type="button" className={styles.linkAcao} onClick={() => setTransferindo(transferindo === s.treinamento_id ? null : s.treinamento_id)}>
                          {transferindo === s.treinamento_id ? "Fechar" : "Transferir responsabilidade"}
                        </button>
                      </div>
                      {transferindo === s.treinamento_id && (
                        <TransferirResponsabilidade
                          treinamentoId={s.treinamento_id}
                          tipoSugerido={s.motivo === "responsavel_desligado" ? "desligamento" : "revogacao"}
                          onTransferido={() => {
                            setTransferindo(null);
                            consulta.recarregar();
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Avaliação de eficácia pendente ({d.eficacia.length})</h4>
            {d.eficacia.length === 0 ? (
              <p className={styles.secundario}>Nenhuma avaliação de eficácia em aberto.</p>
            ) : (
              <ul className={styles.historico}>
                {d.eficacia.map((e) => (
                  <li key={e.treinamento_id}>
                    <strong>
                      {e.codigo} — {e.titulo}
                    </strong>{" "}
                    {e.vencida ? <Selo tom="danger">Prazo vencido</Selo> : <Selo tom="warning">Pendente</Selo>}
                    <div className={styles.secundario}>
                      {e.faltam} participante{e.faltam === 1 ? "" : "s"} sem avaliação{e.prazo ? ` · prazo ${formatarData(e.prazo)}` : ""} ·{" "}
                      <button type="button" className={styles.linkAcao} onClick={() => abrir(e.treinamento_id)}>
                        Abrir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ehRH && (
            <section className={styles.secao}>
              <h4 className={styles.secaoTitulo}>Registros incompletos ou inconsistentes ({d.inconsistencias.length})</h4>
              {d.inconsistencias.length === 0 ? (
                <p className={styles.secundario}>Nenhuma inconsistência encontrada.</p>
              ) : (
                <ul className={styles.historico}>
                  {d.inconsistencias.map((i) => (
                    <li key={`${i.treinamento_id}-${i.motivo}`}>
                      <strong>
                        {i.codigo} — {i.titulo}
                      </strong>
                      <div className={styles.secundario}>
                        {i.mensagem}{" "}
                        <button type="button" className={styles.linkAcao} onClick={() => abrir(i.treinamento_id)}>
                          Abrir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </Card>
    </>
  );
}
