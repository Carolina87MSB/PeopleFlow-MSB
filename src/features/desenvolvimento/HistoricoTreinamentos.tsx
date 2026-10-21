import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award } from "lucide-react";
import { tableStyles } from "../../components/ui";
import { gravar, type LinhaHistorico } from "./devRepository";
import { Erro, EstadoVazio, Selo } from "./componentes";
import { evidenciasDaParticipacao, situacaoEficacia } from "./historicoColaborador";
import { formatarCarga, formatarData, hojeISO, METODO_PRESENCA, PRESENCA, SITUACAO_PARTICIPACAO } from "./rotulos";
import styles from "./Desenvolvimento.module.css";
import visual from "./HistoricoTreinamentos.module.css";

/** Histórico de treinamentos de UM colaborador, para RH e Gestor (aba "Por colaborador"). Tabela no desktop; cartões no celular/tablet estreito. */
export function HistoricoTreinamentos({ linhas }: { linhas: LinhaHistorico[] }) {
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeISO();

  async function abrirEvidencia(id: number) {
    setErro(null);
    try {
      // Link temporário emitido pelo servidor, que reconfere a permissão (RH; Gestor só da própria equipe).
      const { url } = await gravar<{ url: string }>("evidencia_url", { id, visualizar: true });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (linhas.length === 0) return <EstadoVazio icone={<Award size={24} strokeWidth={1.6} />} titulo="Nenhum treinamento registrado." />;

  const itens = linhas.map((h) => ({
    h,
    eficacia: situacaoEficacia(h, hoje),
    evidencias: evidenciasDaParticipacao(h, h.evidencias),
  }));
  const presencaDe = (h: LinhaHistorico) => PRESENCA[h.presenca_status];
  const metodoDe = (h: LinhaHistorico) => (h.presenca_status !== "pendente" && h.presenca_metodo ? (METODO_PRESENCA[h.presenca_metodo] ?? h.presenca_metodo) : null);
  const abrirTreinamento = (id: number) => navigate(`/desenvolvimento/treinamento/${id}`);

  return (
    <>
      {erro && <Erro mensagem={erro} />}
      <div className={[tableStyles.wrap, visual.tabela].join(" ")}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Treinamento</th>
              <th>Carga</th>
              <th>Situação</th>
              <th>Presença</th>
              <th>Eficácia</th>
              <th>Evidências</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(({ h, eficacia, evidencias }) => (
              <tr key={h.participante_id}>
                <td className={styles.mono}>{formatarData(h.data_referencia)}</td>
                <td>
                  {h.titulo}
                  <div className={styles.secundario}>
                    {h.treinamento_codigo}
                    {h.lista_mestra_codigo ? ` · ${h.lista_mestra_codigo}${h.lista_mestra_revisao ? ` rev. ${h.lista_mestra_revisao}` : ""}` : ""}
                  </div>
                  <button type="button" className={styles.linkAcao} onClick={() => abrirTreinamento(h.treinamento_id)}>
                    Abrir treinamento
                  </button>
                </td>
                <td className={styles.mono}>{formatarCarga(h.carga_horaria_min)}</td>
                <td>
                  <Selo tom={SITUACAO_PARTICIPACAO[h.situacao].tom}>
                    {SITUACAO_PARTICIPACAO[h.situacao].rotulo}
                    {h.situacao === "realizado_reposicao" && h.reposicao_numero ? ` ${h.reposicao_numero}` : ""}
                  </Selo>
                  {h.reposto_em_treinamento_id && <div className={styles.secundario}>Realizado depois em reposição</div>}
                </td>
                <td>
                  <Selo tom={presencaDe(h).tom}>{presencaDe(h).rotulo}</Selo>
                  {metodoDe(h) && <div className={styles.secundario}>{metodoDe(h)}</div>}
                </td>
                <td>
                  <Selo tom={eficacia.tom}>{eficacia.texto}</Selo>
                  {eficacia.prazo && <div className={styles.secundario}>{eficacia.vencida ? "Venceu em" : "Prazo"} {formatarData(eficacia.prazo)}</div>}
                </td>
                <td>
                  {evidencias.length === 0 ? (
                    <span className={styles.secundario}>—</span>
                  ) : (
                    <div className={visual.evidencias}>
                      {evidencias.map((e) => (
                        <button key={e.id} type="button" className={styles.linkAcao} onClick={() => void abrirEvidencia(e.id)}>
                          {e.rotulo}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={visual.cartoes} aria-label="Histórico de treinamentos">
        {itens.map(({ h, eficacia, evidencias }) => (
          <li key={h.participante_id} className={visual.cartao}>
            <div className={visual.topo}>
              <h4 className={visual.titulo}>{h.titulo}</h4>
              <Selo tom={SITUACAO_PARTICIPACAO[h.situacao].tom}>
                {SITUACAO_PARTICIPACAO[h.situacao].rotulo}
                {h.situacao === "realizado_reposicao" && h.reposicao_numero ? ` ${h.reposicao_numero}` : ""}
              </Selo>
            </div>
            <span className={visual.codigo}>
              {h.treinamento_codigo}
              {h.lista_mestra_codigo ? ` · ${h.lista_mestra_codigo}${h.lista_mestra_revisao ? ` rev. ${h.lista_mestra_revisao}` : ""}` : ""}
            </span>
            {h.reposto_em_treinamento_id && <span className={visual.codigo}>Realizado depois em reposição</span>}
            <dl className={visual.dados}>
              <div>
                <dt>Data</dt>
                <dd>{formatarData(h.data_referencia)}</dd>
              </div>
              <div>
                <dt>Carga</dt>
                <dd>{formatarCarga(h.carga_horaria_min)}</dd>
              </div>
              <div>
                <dt>Presença</dt>
                <dd>
                  {presencaDe(h).rotulo}
                  {metodoDe(h) ? ` · ${metodoDe(h)}` : ""}
                </dd>
              </div>
              <div>
                <dt>Eficácia</dt>
                <dd>
                  {eficacia.texto}
                  {eficacia.prazo ? ` · ${eficacia.vencida ? "venceu em" : "prazo"} ${formatarData(eficacia.prazo)}` : ""}
                </dd>
              </div>
            </dl>
            <div className={visual.acoes}>
              <button type="button" className={styles.linkAcao} onClick={() => abrirTreinamento(h.treinamento_id)}>
                Abrir treinamento
              </button>
              {evidencias.map((e) => (
                <button key={e.id} type="button" className={styles.linkAcao} onClick={() => void abrirEvidencia(e.id)}>
                  {e.rotulo}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
