import { useMemo, useState } from "react";
import { Badge, Button, Drawer } from "../../components/ui";
import { calcularNotaOficialAvd, calcularNotaOficialPotencial, validarCalibracao } from "../../domain/calibracao";
import { fichasIrmasDe } from "../../domain/avaliacaoDesempenho";
import { posicionarMatriz9Box } from "../../domain/matriz9Box";
import { formatarDataHora } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { ParCalibracao } from "./CalibracaoTab";
import { STATUS_CALIBRACAO_TONE } from "./CalibracaoTab";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

interface CalibracaoDrawerProps {
  par: ParCalibracao;
  onClose: () => void;
}

function paraNumeroOuNulo(valor: string): number | null {
  if (valor.trim() === "") return null;
  const n = Number(valor.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Comitê de Calibração (Etapa 6) — RH revisa dados congelados da AVD/
 * Potencial (só leitura), vê a posição atual na Matriz 9 Box (recalculada
 * ao vivo conforme digita), e pode calibrar a média comportamental e/ou a
 * nota de potencial antes de homologar — 1 ação só, sem rascunho salvo à
 * parte. Depois de "Homologada", tudo vira histórico travado: sem edição,
 * sem reabertura (o spec não pede uma para este fluxo). */
export function CalibracaoDrawer({ par, onClose }: CalibracaoDrawerProps) {
  const { configAvaliacaoDesempenho, avaliacoesDesempenho, podeCalibrarAvaliacaoDesempenho, homologarCalibracao } = usePortalData();
  const { avaliacaoDesempenho: avd, avaliacaoPotencial: potencial } = par;

  // Ficha de Autoavaliação irmã (mesmo colaborador/ciclo) — a Média
  // Comportamental do gestor acima já é a consolidada entre GESTOR e
  // AUTOAVALIACAO (ver mediaComportamentalConsolidada em
  // domain/avaliacaoDesempenho.ts — LIDERANCA nunca entra nessa conta);
  // aqui só exibimos a composição, pro Comitê ver de onde veio o número
  // antes de calibrar/homologar.
  const irmas = useMemo(() => fichasIrmasDe(avaliacoesDesempenho, avd), [avaliacoesDesempenho, avd]);
  const autoavaliacao = irmas.find((a) => a.tipo === "AUTOAVALIACAO");

  const podeCalibrar = podeCalibrarAvaliacaoDesempenho(avd);
  const [mediaComportamentalInput, setMediaComportamentalInput] = useState("");
  const [notaPotencialInput, setNotaPotencialInput] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);

  const mediaComportamentalCalibrada = paraNumeroOuNulo(mediaComportamentalInput);
  const notaPotencialCalibrada = paraNumeroOuNulo(notaPotencialInput);

  const validacao = validarCalibracao(avd.mediaComportamental, mediaComportamentalCalibrada, potencial.notaPotencial, notaPotencialCalibrada, justificativa);

  const notaFinalOficialPreview =
    avd.statusCalibracao === "Homologada"
      ? avd.notaFinalOficial
      : calcularNotaOficialAvd(avd.mediaTecnica, avd.mediaComportamental, mediaComportamentalCalibrada, configAvaliacaoDesempenho);
  const notaOficialPreview =
    avd.statusCalibracao === "Homologada" ? potencial.notaOficial : calcularNotaOficialPotencial(potencial.notaPotencial, notaPotencialCalibrada);
  const posicaoPreview = posicionarMatriz9Box(notaFinalOficialPreview, notaOficialPreview, configAvaliacaoDesempenho);

  async function handleHomologar() {
    setSalvando(true);
    const result = await homologarCalibracao(avd, potencial, { mediaComportamentalCalibrada, notaPotencialCalibrada, justificativa });
    setSalvando(false);
    if (result.ok) onClose();
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{avd.colaboradorNome}</div>
          <div className={styles.drawerSub}>
            {formatarNomeCargo(avd.cargo)} · {avd.departamento} · Gestor: {avd.gestorAvaliador || "—"} · {avd.ciclo}
          </div>
        </div>
      }
    >
      <div className={styles.statusRow}>
        <Badge bg={STATUS_CALIBRACAO_TONE[avd.statusCalibracao].bg} fg={STATUS_CALIBRACAO_TONE[avd.statusCalibracao].fg}>
          {avd.statusCalibracao}
        </Badge>
        {!podeCalibrar && avd.statusCalibracao === "Aguardando Calibração" && <span className={styles.trancada}>Somente RH pode calibrar.</span>}
      </div>

      <h4 className={styles.sectionTitle}>Avaliação de Desempenho (gestor)</h4>
      <div className={styles.resumo}>
        <div className={styles.resumoLinha}>
          <span>Média Técnica (KPIs)</span>
          <strong>{avd.mediaTecnica ?? "—"}</strong>
        </div>
        {autoavaliacao && (
          <div className={styles.resumoLinha}>
            <span>Autoavaliação (comportamental){autoavaliacao.status !== "Concluída" ? " — não concluída, não entra na média" : ""}</span>
            <strong>{autoavaliacao.mediaComportamental ?? "—"}</strong>
          </div>
        )}
        <div className={styles.resumoLinha}>
          <span>Média Comportamental{autoavaliacao ? " (consolidada)" : ""}</span>
          <strong>{avd.mediaComportamental ?? "—"}</strong>
        </div>
        <div className={styles.resumoLinhaFinal}>
          <span>Nota Final (gestor)</span>
          <strong>{avd.notaFinal ?? "—"}</strong>
        </div>
      </div>
      {avd.mediaComportamental === null && (
        <p className={styles.competenciaDescricao}>
          Média Comportamental indisponível — nenhuma competência ativa no momento da criação do ciclo.
        </p>
      )}

      <h4 className={styles.sectionTitle}>Avaliação de Potencial</h4>
      <div className={styles.resumo}>
        <div className={styles.resumoLinhaFinal}>
          <span>Nota Final de Potencial (gestor)</span>
          <strong>{potencial.notaPotencial ?? "—"}</strong>
        </div>
      </div>

      <h4 className={styles.sectionTitle}>Posição na Matriz 9 Box {avd.statusCalibracao !== "Homologada" && "(prévia)"}</h4>
      <div className={styles.resumo}>
        <div className={styles.resumoLinhaFinal}>
          <span>Quadrante</span>
          <strong>{posicaoPreview?.nomeQuadrante ?? "Sem posição (nota indisponível)"}</strong>
        </div>
      </div>

      {avd.statusCalibracao === "Homologada" ? (
        <>
          <h4 className={styles.sectionTitle}>Histórico da calibração</h4>
          <div className={styles.resumo}>
            <div className={styles.resumoLinha}>
              <span>Nota Inicial do Gestor (AVD)</span>
              <strong>{avd.notaFinal ?? "—"}</strong>
            </div>
            <div className={styles.resumoLinha}>
              <span>Nota Oficial (AVD)</span>
              <strong>{avd.notaFinalOficial ?? "—"}</strong>
            </div>
            <div className={styles.resumoLinha}>
              <span>Nota Inicial do Gestor (Potencial)</span>
              <strong>{potencial.notaPotencial ?? "—"}</strong>
            </div>
            <div className={styles.resumoLinha}>
              <span>Nota Oficial (Potencial)</span>
              <strong>{potencial.notaOficial ?? "—"}</strong>
            </div>
            {avd.justificativaCalibracao && (
              <div className={styles.resumoLinha}>
                <span>Justificativa</span>
                <strong>{avd.justificativaCalibracao}</strong>
              </div>
            )}
            <div className={styles.resumoLinha}>
              <span>Calibrado por</span>
              <strong>
                {avd.calibradoPor || "—"} em {formatarDataHora(avd.calibradoEm)}
              </strong>
            </div>
            <div className={styles.resumoLinhaFinal}>
              <span>Homologado por</span>
              <strong>
                {avd.homologadoPor || "—"} em {formatarDataHora(avd.homologadoEm)}
              </strong>
            </div>
          </div>
        </>
      ) : (
        podeCalibrar && (
          <>
            <h4 className={styles.sectionTitle}>Calibração (opcional)</h4>
            <div className={styles.campo}>
              <label className={styles.label} htmlFor="calibracao-comportamental">
                Média Comportamental calibrada (deixe em branco pra manter {avd.mediaComportamental ?? "—"})
              </label>
              <input
                id="calibracao-comportamental"
                className={styles.input}
                value={mediaComportamentalInput}
                onChange={(e) => setMediaComportamentalInput(e.target.value)}
                inputMode="decimal"
                placeholder={String(avd.mediaComportamental ?? "")}
              />
            </div>
            <div className={styles.campo}>
              <label className={styles.label} htmlFor="calibracao-potencial">
                Nota de Potencial calibrada (deixe em branco pra manter {potencial.notaPotencial ?? "—"})
              </label>
              <input
                id="calibracao-potencial"
                className={styles.input}
                value={notaPotencialInput}
                onChange={(e) => setNotaPotencialInput(e.target.value)}
                inputMode="decimal"
                placeholder={String(potencial.notaPotencial ?? "")}
              />
            </div>
            <div className={styles.campo}>
              <label className={styles.label} htmlFor="calibracao-justificativa">
                Justificativa {!validacao.ok && <span className={styles.trancada}>— obrigatória, alguma nota foi alterada</span>}
              </label>
              <textarea
                id="calibracao-justificativa"
                className={styles.textarea}
                rows={3}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>

            <div className={styles.edicaoAcoes}>
              <Button variant="primary" onClick={handleHomologar} disabled={!validacao.ok || salvando}>
                {salvando ? "Homologando..." : "Homologar Avaliação"}
              </Button>
            </div>
          </>
        )
      )}
    </Drawer>
  );
}
