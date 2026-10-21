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

function Indicadores({ i }: { i: IndicadorReacao }) {
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
        <span className={visual.numero}>{i.pendentes}</span>
        <span className={visual.rotulo}>Pendentes</span>
      </div>
      <div>
        <span className={visual.numero}>{pct(i.taxa)}</span>
        <span className={visual.rotulo}>Taxa de adesão</span>
      </div>
    </div>
  );
}

function Medias({ questoes, medias }: { questoes: string[]; medias: (number | null)[] }) {
  return (
    <ol className={visual.medias}>
      {questoes.map((q, i) => (
        <li key={i}>
          <span>{q}</span>
          <strong>{nota(medias[i] ?? null)}</strong>
        </li>
      ))}
    </ol>
  );
}

/** Aba "Avaliação de reação" (só RH): respondidos, pendentes e taxa de adesão; geral e por treinamento oficial. Teste/homologação fora. */
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
            Obrigatória para todo treinamento oficial; fica disponível ao participante assim que a presença é confirmada.
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
          {r.geral.respondidos > 0 && <Medias questoes={r.questoes} medias={r.geral.medias} />}
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
                      <td className={styles.mono}>{t.pendentes}</td>
                      <td>
                        <Selo tom={t.pendentes === 0 ? "success" : "warning"}>{pct(t.taxa)}</Selo>
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

/** Seção da página do treinamento (só RH, só oficial): quem respondeu, quem está pendente, notas e médias. */
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
            {d.respondidos} de {d.elegiveis} responderam ({pct(d.taxa)}) · {d.pendentes} pendente{d.pendentes === 1 ? "" : "s"}. A conclusão do treinamento não depende das respostas.
          </p>
        </div>
      </div>
      {d.respondidos > 0 && <Medias questoes={d.questoes} medias={d.medias} />}
      <div className={tableStyles.wrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Participante</th>
              <th>Situação</th>
              <th>Respondida em</th>
              <th>Notas (1–5)</th>
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
                  <Selo tom={p.estado === "respondida" ? "success" : "warning"}>{p.estado === "respondida" ? "Respondida" : "Pendente"}</Selo>
                </td>
                <td className={styles.mono}>{p.respondido_em ? dataHora.format(new Date(p.respondido_em)) : "—"}</td>
                <td className={styles.mono}>{p.respostas ? p.respostas.join(" · ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
