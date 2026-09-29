import { useState } from "react";
import { usePortalData } from "../../store/usePortalData";
import { RegistrarPreenchimentoModal } from "./RegistrarPreenchimentoModal";
import { dataBrParaIso, formatarDataHora } from "../../domain/dates";
import type { EventoHistoricoMovimentacao, Movimentacao, Vaga } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

const ORIGEM_LABEL: Record<Vaga["origem"], string> = {
  substituicao: "Substituição",
  aumento_quadro: "Aumento de quadro",
};

const STATUS_LABEL: Record<Vaga["status"], string> = {
  pendente: "Pendente de preenchimento",
  aguardando_aprovacao_gestor: "Aguardando aprovação do gestor",
  preenchida: "Preenchimento concluído",
};

interface EventoVaga {
  chave: string;
  titulo: string;
  quando: string;
  autorLinha?: string;
  detalhe?: string;
}

/** ISO ("aaaa-mm-dd") pro formato numérico "dd/mm/aaaa" — o resto do app usa
 * "dd/mmm/aaaa" (mês abreviado), mas aqui adotamos o mesmo estilo numérico
 * das datas do histórico (formatarDataHora()), só apresentação. */
function formatarIsoNumerico(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

/** Converte "dd/mmm/aaaa" + "HH:MM" (formato de EventoHistoricoMovimentacao)
 * pro mesmo estilo numérico de formatarDataHora() ("dd/mm/aaaa, HH:MM"), pra
 * não misturar dois formatos de data na mesma lista cronológica. Reaproveita
 * dataBrParaIso() já existente — nenhuma lógica de data nova. */
function formatarEventoHistorico(dataBr: string, hora: string): { chave: string; quando: string } {
  const iso = dataBrParaIso(dataBr);
  if (!iso) return { chave: `${dataBr} ${hora}`, quando: `${dataBr}, ${hora}` };
  const [ano, mes, dia] = iso.split("-");
  return { chave: `${iso}T${hora}`, quando: `${dia}/${mes}/${ano}, ${hora}` };
}

/** Histórico completo do preenchimento de UMA vaga (RH, 2026-09) — combina os
 * dois momentos que já ficam gravados na própria vaga (registrado/aprovado)
 * com as edições gravadas no histórico da MP de origem (Movimentacao.historico
 * é da MP inteira; aqui filtramos só os eventos de preenchimento de vaga).
 * Puramente apresentação — não grava nada, não inventa evento que não exista.
 *
 * Limitação conhecida: se uma MP tiver mais de uma vaga (aumento de quadro),
 * os eventos de EDIÇÃO (vindos de Movimentacao.historico) não são gravados
 * com o id da vaga — nesse caso todas as vagas da mesma MP mostrariam as
 * mesmas edições. Não afeta os casos reais de hoje (uma vaga por MP). */
function eventosDaVaga(vaga: Vaga, historicoMp: EventoHistoricoMovimentacao[]): EventoVaga[] {
  const eventos: EventoVaga[] = [];
  if (vaga.registradoPor && vaga.registradoEm) {
    eventos.push({ chave: vaga.registradoEm, titulo: `Registrado por ${vaga.registradoPor}`, quando: formatarDataHora(vaga.registradoEm) });
  }
  if (vaga.aprovadoPor && vaga.aprovadoEm) {
    eventos.push({ chave: vaga.aprovadoEm, titulo: `Aprovado por ${vaga.aprovadoPor}`, quando: formatarDataHora(vaga.aprovadoEm) });
  }
  for (const h of historicoMp) {
    if (!h.acao.startsWith("Preenchimento de vaga editado")) continue;
    const { chave, quando } = formatarEventoHistorico(h.data, h.hora);
    eventos.push({ chave, titulo: h.acao, quando, autorLinha: `por ${h.autor}`, detalhe: h.detalhe });
  }
  return eventos.sort((a, b) => a.chave.localeCompare(b.chave));
}

function VagaItem({ vaga, movimentacao }: { vaga: Vaga; movimentacao: Movimentacao }) {
  const { perfil, conta, aprovarPreenchimento } = usePortalData();
  const [modalAberto, setModalAberto] = useState<"registrar" | "editar" | null>(null);

  const podeRegistrar = perfil === "RH" && vaga.status === "pendente";
  const podeEditar = perfil === "RH" && vaga.status === "aguardando_aprovacao_gestor";
  const podeAprovar = vaga.status === "aguardando_aprovacao_gestor" && (perfil === "RH" || movimentacao.solicitante === conta.nome);
  const eventos = eventosDaVaga(vaga, movimentacao.historico ?? []);

  return (
    <div className={styles.vagaCard}>
      <div className={styles.vagaTopo}>
        <div>
          <div className={styles.vagaOrigem}>{ORIGEM_LABEL[vaga.origem]}</div>
          {vaga.novoColaboradorNome ? (
            <>
              <div className={styles.vagaNome}>{vaga.novoColaboradorNome}</div>
              <div className={styles.vagaAdmissao}>Admissão prevista: {formatarIsoNumerico(vaga.admissaoPrevistaIso)}</div>
            </>
          ) : (
            <div className={styles.vagaNomePendente}>Aguardando indicação do RH</div>
          )}
        </div>
        <div className={styles.vagaAcoes}>
          <span className={vaga.status === "preenchida" ? styles.pillGerado : styles.pillPendente}>{STATUS_LABEL[vaga.status]}</span>
          <div className={styles.documentoAcoes}>
            {podeRegistrar && (
              <button type="button" className={styles.documentoAcaoBtn} onClick={() => setModalAberto("registrar")}>
                Registrar preenchimento
              </button>
            )}
            {podeEditar && (
              <button type="button" className={styles.documentoAcaoBtn} onClick={() => setModalAberto("editar")}>
                Editar preenchimento
              </button>
            )}
            {podeAprovar && (
              <button type="button" className={styles.documentoAcaoBtn} onClick={() => aprovarPreenchimento(vaga.id)}>
                Aprovar preenchimento
              </button>
            )}
          </div>
        </div>
      </div>

      {eventos.length > 0 && (
        <>
          <div className={styles.vagaHistoricoTitulo}>Histórico do preenchimento</div>
          <div className={styles.historicoList}>
            {eventos.map((ev, i) => (
              <div key={i} className={styles.historicoItem}>
                <div className={styles.historicoTopo}>
                  <span className={styles.historicoAcao}>{ev.titulo}</span>
                  <span className={styles.historicoData}>{ev.quando}</span>
                </div>
                {ev.autorLinha && <div className={styles.historicoAutor}>{ev.autorLinha}</div>}
                {ev.detalhe && <div className={styles.historicoDetalhe}>{ev.detalhe}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {modalAberto && <RegistrarPreenchimentoModal vaga={vaga} modo={modalAberto} onClose={() => setModalAberto(null)} />}
    </div>
  );
}

/** "VAGAS AUTORIZADAS" (RH, 2026-09) — uma MP (Desligamento com Substituição=
 * Sim, ou Admissão com Quantidade de vagas > 1) pode autorizar 1+ vagas;
 * cada uma é preenchida individualmente, sem abrir MP de Admissão nova (ver
 * Vaga em types/domain.ts). Some (retorna null) quando a MP não tem vaga
 * nenhuma — não aparece pra PRO/TRF nem pra Admissão/Desligamento comuns. */
export function VagasAutorizadasBloco({ movimentacao: m }: { movimentacao: Movimentacao }) {
  const { vagas } = usePortalData();
  const vagasDaMp = vagas.filter((v) => v.movimentacaoId === m.id);
  if (vagasDaMp.length === 0) return null;

  const preenchidas = vagasDaMp.filter((v) => v.status === "preenchida").length;
  const pendentes = vagasDaMp.length - preenchidas;
  const statusGeral = pendentes === 0 ? "Concluída" : preenchidas > 0 ? "Parcialmente atendida" : "Pendente";

  return (
    <div>
      <h4 className={styles.sectionTitle}>Vagas autorizadas</h4>
      <div className={styles.documentoNotaAntiga} style={{ marginBottom: 10 }}>
        {vagasDaMp.length} autorizada(s) · {preenchidas} preenchida(s) · {pendentes} pendente(s) — {statusGeral}
      </div>
      <div className={styles.documentosList}>
        {vagasDaMp.map((v) => (
          <VagaItem key={v.id} vaga={v} movimentacao={m} />
        ))}
      </div>
    </div>
  );
}
