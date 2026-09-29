import { useState } from "react";
import { usePortalData } from "../../store/usePortalData";
import { RegistrarPreenchimentoModal } from "./RegistrarPreenchimentoModal";
import { formatarDataHora, formatarDataIso } from "../../domain/dates";
import type { Movimentacao, Vaga } from "../../types/domain";
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

function VagaItem({ vaga, movimentacao }: { vaga: Vaga; movimentacao: Movimentacao }) {
  const { perfil, conta, aprovarPreenchimento } = usePortalData();
  const [modalAberto, setModalAberto] = useState<"registrar" | "editar" | null>(null);

  const podeRegistrar = perfil === "RH" && vaga.status === "pendente";
  // "Editar preenchimento" (RH, 2026-09) — só antes da conclusão; depois de
  // "preenchida" o registro fica congelado (rastreabilidade, sem alteração
  // silenciosa — ver editarPreenchimentoFn em store/usePortalData.ts).
  const podeEditar = perfil === "RH" && vaga.status === "aguardando_aprovacao_gestor";
  // Gestor: só quem é o solicitante desta MP de origem (não é escopo
  // hierárquico — é a pessoa específica que abriu a MP que autorizou a vaga).
  const podeAprovar = vaga.status === "aguardando_aprovacao_gestor" && (perfil === "RH" || movimentacao.solicitante === conta.nome);

  return (
    <div className={styles.documentoItem}>
      <div>
        <span className={styles.documentoNome}>{vaga.cargo ?? "Cargo a definir"}</span>
        <div className={styles.documentoNotaAntiga}>{ORIGEM_LABEL[vaga.origem]}</div>
        {vaga.status !== "pendente" && (
          <div className={styles.documentoNotaAntiga}>
            {vaga.novoColaboradorNome} · {vaga.cargoPreenchimento} · admissão prevista {formatarDataIso(vaga.admissaoPrevistaIso)}
            {vaga.observacao ? ` · "${vaga.observacao}"` : ""}
            <br />
            Registrado por {vaga.registradoPor} em {formatarDataHora(vaga.registradoEm)}
            {vaga.status === "preenchida" && (
              <>
                <br />
                Aprovado por {vaga.aprovadoPor} em {formatarDataHora(vaga.aprovadoEm)}
              </>
            )}
          </div>
        )}
      </div>
      <div className={styles.documentoDireita}>
        <span className={vaga.status === "preenchida" ? styles.pillGerado : styles.pillPendente}>{STATUS_LABEL[vaga.status]}</span>
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
