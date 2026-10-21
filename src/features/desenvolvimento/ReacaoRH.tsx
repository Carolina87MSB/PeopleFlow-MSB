import { useNavigate } from "react-router-dom";
import { MessageSquareHeart } from "lucide-react";
import { Card, tableStyles } from "../../components/ui";
import { reacaoDetalhe, reacaoResumo, type IndicadorReacao } from "./devRepository";
import { Carregando, Erro, EstadoVazio, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";
import visual from "./ReacaoRH.module.css";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const pct = (t: number | null) => (t === null ? "—" : `${t}%`);
const nota = (n: number | null) => (n === null ? "—" : n.toFixed(1).replace(".", ","));

/** Controle de adesão: quem deve avaliar, quem respondeu, quem está pendente (no prazo) e quem está vencido. */
function Indicadores({ i }: { i: IndicadorReacao }) {
  const noPrazo = i.pendentes - i.vencidas;
  return (
    <div className={visual.indicadores}>
      <div>
        <span className={visual.numero}>{i.elegiveis}</span>
        <span className={visual.rotulo}>Devem avaliar</span>
      </div>
      <div>
        <span className={visual.numero}>{i.respondidos}</span>
        <span className={visual.rotulo}>Responderam</span>
      </div>
      <div>
        <span className={visual.numero}>{noPrazo}</span>
        <span className={visual.rotulo}>Pendentes (no prazo)</span>
      </div>
      <div>
        <span className={visual.numero}>{i.vencidas}</span>
        <span className={visual.rotulo}>Vencidas</span>
      </div>
      <div>
        <span className={visual.numero}>{pct(i.taxa)}</span>
        <span className={visual.rotulo}>Taxa de adesão</span>
      </div>
    </div>
  );
}

/** Notas SOMENTE consolidadas (médias por pergunta). Abaixo do mínimo de respostas não há número: ele identificaria quem respondeu. */
function Medias({ questoes, medias, minimo }: { questoes: string[]; medias: (number | null)[] | null; minimo: number }) {
  if (!medias) return <p className={visual.reserva}>As médias das notas aparecem a partir de {minimo} respostas, para que ninguém seja identificado pela própria nota.</p>;
  return (
    <>
      <p className={visual.reserva}>Notas consolidadas (média de 1 a 5). O RH não vê a nota de cada pessoa.</p>
      <ol className={visual.medias}>
        {questoes.map((q, i) => (
          <li key={i}>
            <span>{q}</span>
            <strong>{nota(medias[i] ?? null)}</strong>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Aba "Avaliação de reação" (só RH): adesão (respondidos, pendentes, vencidas, taxa) geral e por treinamento oficial; notas só consolidadas. Teste/homologação fora. */
export function ReacaoAba() {
  const navigate = useNavigate();
  const resumo = useConsulta(() => reacaoResumo(), []);
  const r = resumo.dados;
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Avaliação de reação</h3>
          <p className={styles.cardSubtitle}>
            Obrigatória para todo treinamento oficial, com prazo de {r?.prazo_dias ?? 7} dias corridos após a confirmação da presença (vencida ainda pode ser respondida). A conclusão do treinamento não depende dela.
            {r?.ativa_desde ? ` Vale para presenças confirmadas a partir de ${dataHora.format(new Date(r.ativa_desde))}.` : ""}
          </p>
        </div>
      </div>
      {resumo.erro ? (
        <Erro mensagem={resumo.erro} />
      ) : resumo.carregando || !r ? (
        <Carregando />
      ) : !r.ativa_desde ? (
        <EstadoVazio icone={<MessageSquareHeart size={26} strokeWidth={1.6} />} titulo="Avaliação de reação ainda não ativada." descricao="A estrutura de dados do recurso ainda não foi instalada no banco (supabase/desenvolvimento_avaliacao_reacao.sql)." />
      ) : (
        <>
          <Indicadores i={r.geral} />
          <Medias questoes={r.questoes} medias={r.geral.medias} minimo={r.minimo_respostas_para_medias} />
          {r.treinamentos.length === 0 ? (
            <EstadoVazio icone={<MessageSquareHeart size={26} strokeWidth={1.6} />} titulo="Nenhum treinamento oficial com participação confirmada desde a ativação." />
          ) : (
            <div className={tableStyles.wrap}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Treinamento</th>
                    <th>Data</th>
                    <th>Devem avaliar</th>
                    <th>Responderam</th>
                    <th>Pendentes</th>
                    <th>Vencidas</th>
                    <th>Adesão</th>
                  </tr>
                </thead>
                <tbody>
                  {r.treinamentos.map((t) => (
                    <tr key={t.id} className={styles.linhaClicavel} onClick={() => navigate(`/desenvolvimento/treinamento/${t.id}`)}>
                      <td>
                        {t.titulo}
                        <div className={styles.secundario}>{t.codigo}</div>
                      </td>
                      <td className={styles.mono}>{formatarData(t.data)}</td>
                      <td className={styles.mono}>{t.elegiveis}</td>
                      <td className={styles.mono}>{t.respondidos}</td>
                      <td className={styles.mono}>{t.pendentes - t.vencidas}</td>
                      <td className={styles.mono}>{t.vencidas}</td>
                      <td>
                        <Selo tom={t.pendentes === 0 ? "success" : t.vencidas > 0 ? "danger" : "warning"}>{pct(t.taxa)}</Selo>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const SITUACAO = {
  respondida: { rotulo: "Respondida", tom: "success" },
  pendente: { rotulo: "Pendente", tom: "warning" },
  vencida: { rotulo: "Vencida", tom: "danger" },
} as const;

/** Seção da página do treinamento (só RH, só oficial): controle de adesão (quem respondeu, pendentes, vencidas, prazo) e médias consolidadas. */
export function ReacaoDoTreinamento({ treinamentoId }: { treinamentoId: number }) {
  const det = useConsulta(() => reacaoDetalhe(treinamentoId), [treinamentoId]);
  const d = det.dados;
  if (det.erro) return <Erro mensagem={det.erro} />;
  if (det.carregando || !d) return <Carregando />;
  if (!d.ativa_desde || !d.treinamento || d.elegiveis === 0) return null;
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Avaliação de reação</h3>
          <p className={styles.cardSubtitle}>
            {d.respondidos} de {d.elegiveis} responderam ({pct(d.taxa)}) · {d.pendentes - d.vencidas} pendente{d.pendentes - d.vencidas === 1 ? "" : "s"} no prazo · {d.vencidas} vencida{d.vencidas === 1 ? "" : "s"}. Prazo de {d.prazo_dias} dias após a presença; vencida ainda pode ser respondida.
          </p>
        </div>
      </div>
      <Medias questoes={d.questoes} medias={d.medias} minimo={d.minimo_respostas_para_medias} />
      <div className={tableStyles.wrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Participante</th>
              <th>Situação</th>
              <th>Prazo</th>
              <th>Respondida em</th>
            </tr>
          </thead>
          <tbody>
            {d.participantes.map((p) => (
              <tr key={p.participante_id}>
                <td>
                  {p.nome}
                  <div className={styles.secundario}>{p.departamento}</div>
                </td>
                <td>
                  <Selo tom={SITUACAO[p.situacao].tom}>{SITUACAO[p.situacao].rotulo}</Selo>
                  {p.fora_do_prazo && <div className={styles.secundario}>Após o prazo</div>}
                </td>
                <td className={styles.mono}>{formatarData(p.prazo)}</td>
                <td className={styles.mono}>{p.respondido_em ? dataHora.format(new Date(p.respondido_em)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
