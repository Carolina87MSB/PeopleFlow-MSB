import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatarDataHora, formatarDataIso } from "../../domain/dates";
import { cartaFinalizada, podeDarCienciaComoGestor, podeDarCienciaComoRH, podeMarcarEntregue, statusCarta } from "../../domain/cartaMovimentacao";
import { usePortalData } from "../../store/usePortalData";
import { MSB_LOGO_PNG_BASE64 } from "../../assets/msbLogo";
import type { Movimentacao } from "../../types/domain";
import styles from "./CartaMovimentacaoModal.module.css";

interface CartaMovimentacaoModalProps {
  movimentacao: Movimentacao;
  onClose: () => void;
}

function valorDado(m: Movimentacao, label: string): string | null {
  return m.dados?.find((d) => d.label === label)?.value ?? null;
}

/** Ficha completa da Carta de Movimentação — texto formatado conforme o
 * modelo institucional, blocos de ciência (gestor/RH/colaborador) e o botão
 * de PDF (window.print() sobre a área com CSS de impressão dedicado, mesmo
 * padrão já usado nos dashboards de Gestão de Desempenho). Nunca cria uma
 * movimentação nova — tudo aqui lê/grava em `movimentacao.cartaMovimentacao`. */
export function CartaMovimentacaoModal({ movimentacao: m, onClose }: CartaMovimentacaoModalProps) {
  const { conta, perfil, colaboradores, darCienciaCartaMovimentacao, marcarCartaMovimentacaoEntregue } = usePortalData();
  const carta = m.cartaMovimentacao;
  if (!carta) return null;

  const colaboradorAtual = colaboradores.find((c) => c.nome === m.colaborador);
  const cargoAtual = valorDado(m, "Cargo atual") ?? colaboradorAtual?.cargo ?? "—";
  const areaAtual = valorDado(m, "Departamento de origem") ?? valorDado(m, "Departamento atual") ?? m.depto;
  const novoCargo = m.atualizacaoInfo?.novoCargo || valorDado(m, "Novo cargo") || "";
  const novaArea = m.atualizacaoInfo?.novoDepto || valorDado(m, "Novo departamento") || valorDado(m, "Departamento de destino") || "";
  const dataEfetivacao = formatarDataIso(m.atualizacaoInfo?.dataPrevistaIso) !== "—"
    ? formatarDataIso(m.atualizacaoInfo?.dataPrevistaIso)
    : valorDado(m, "Data prevista") || "A definir";

  const finalizada = cartaFinalizada(carta);
  const podeAssinarGestor = podeDarCienciaComoGestor(m, conta.nome);
  const podeAssinarRH = podeDarCienciaComoRH(m, perfil === "RH");
  const podeEntregar = perfil === "RH" && podeMarcarEntregue(carta);

  return (
    <Modal title="Carta de Movimentação de Pessoal" subtitle={`${m.id} · ${m.colaborador}`} onClose={onClose} width={720}>
      <div className={styles.cartaWrap}>
        <div className={styles.papel}>
          <div className={styles.cabecalho}>
            <img src={`data:image/png;base64,${MSB_LOGO_PNG_BASE64}`} alt="MSB" className={styles.logo} />
            <div>
              <div className={styles.tituloCarta}>CARTA DE MOVIMENTAÇÃO DE PESSOAL</div>
              <div className={styles.subtituloCarta}>MSB – Medical System do Brasil</div>
            </div>
          </div>

          <div className={styles.dadosGrid}>
            <span>Data de emissão: {formatarDataHora(carta.emitidaEm)}</span>
            <span>Colaborador: {m.colaborador}</span>
            <span>Cargo atual: {cargoAtual}</span>
            <span>Área atual: {areaAtual}</span>
            {novoCargo && <span>Novo cargo: {novoCargo}</span>}
            {novaArea && <span>Nova área: {novaArea}</span>}
            <span>Tipo de movimentação: {m.tipo}</span>
            <span>Data de efetivação: {dataEfetivacao}</span>
          </div>

          <p className={styles.paragrafo}>Prezada(o) {m.colaborador},</p>
          <p className={styles.paragrafo}>
            Por meio desta, formalizamos sua movimentação de pessoal na MSB – Medical System do Brasil, conforme alteração aprovada no Portal
            PeopleFlow.
          </p>
          <p className={styles.paragrafo}>
            A partir de {dataEfetivacao}, sua condição funcional {carta.descricaoAlteracao}
          </p>
          <p className={styles.paragrafo}>
            A presente carta tem por finalidade formalizar a movimentação e registrar a ciência das partes envolvidas.
          </p>
          <p className={styles.paragrafo}>Atenciosamente,</p>

          <div className={styles.blocoAssinatura}>
            <div className={styles.blocoTitulo}>GESTOR RESPONSÁVEL</div>
            <div>Nome: {carta.assinaturaGestor.nome || "—"}</div>
            <div>Cargo: {carta.assinaturaGestor.cargo || "—"}</div>
            <div>Data: {carta.assinaturaGestor.data ? formatarDataHora(carta.assinaturaGestor.data) : "—"}</div>
            <div className={styles.linhaAssinatura}>Assinatura: ______________________________</div>
            <div className={styles.statusAssinatura}>{carta.assinaturaGestor.status === "Assinado" ? "Ciência registrada" : "Aguardando ciência"}</div>
          </div>

          <div className={styles.blocoAssinatura}>
            <div className={styles.blocoTitulo}>RECURSOS HUMANOS</div>
            <div>Nome: {carta.assinaturaRH.nome || "—"}</div>
            <div>Cargo: {carta.assinaturaRH.cargo || "—"}</div>
            <div>Data: {carta.assinaturaRH.data ? formatarDataHora(carta.assinaturaRH.data) : "—"}</div>
            <div className={styles.linhaAssinatura}>Assinatura: ______________________________</div>
            <div className={styles.statusAssinatura}>{carta.assinaturaRH.status === "Assinado" ? "Ciência registrada" : "Aguardando ciência"}</div>
          </div>

          <div className={styles.blocoAssinatura}>
            <div className={styles.blocoTitulo}>CIÊNCIA DO COLABORADOR</div>
            <div>Nome: {m.colaborador}</div>
            <div>Data: ______________________________</div>
            <div className={styles.linhaAssinatura}>Assinatura: ______________________________</div>
          </div>
        </div>

        <div className={styles.acoes}>
          <span className={styles.statusGeral}>Status: {statusCarta(carta)}</span>
          <div className={styles.acoesBotoes}>
            {podeAssinarGestor && <Button variant="primary" onClick={() => darCienciaCartaMovimentacao(m.id, "gestor")}>Dar ciência (Gestor)</Button>}
            {podeAssinarRH && <Button variant="primary" onClick={() => darCienciaCartaMovimentacao(m.id, "rh")}>Dar ciência (RH)</Button>}
            {podeEntregar && (
              <Button variant="secondary" onClick={() => marcarCartaMovimentacaoEntregue(m.id)}>
                Marcar como entregue ao colaborador
              </Button>
            )}
            <Button variant="secondary" disabled={!finalizada} onClick={() => window.print()}>
              Baixar Carta em PDF
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
