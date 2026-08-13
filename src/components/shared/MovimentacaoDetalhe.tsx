import { useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar, Button } from "../ui";
import { tipoColor } from "../../domain/colors";
import { docsFor } from "../../domain/documentos";
import { dataBrParaIso, formatarDataIso } from "../../domain/dates";
import { calcularPercentual, type EdicaoDadoMovimentacao } from "../../domain/workflow";
import type { DadoField, Movimentacao } from "../../types/domain";
import styles from "./MovimentacaoDetalhe.module.css";

/** Únicos campos de `dados` que o RH pode corrigir manualmente — Salário
 * (qualquer rótulo com "salário", cobre PRO e SAL) e Data prevista (PRO/TRF/
 * ADM, cada um com seu próprio rótulo). Nunca o "Percentual de alteração":
 * esse é sempre recalculado a partir do salário editado, nunca digitado. */
function ehCampoSalario(label: string): boolean {
  return /salário/i.test(label);
}
function ehCampoDataPrevista(label: string): boolean {
  return label === "Data prevista" || label === "Data prevista de admissão";
}
function ehCampoEditavel(label: string): boolean {
  return ehCampoSalario(label) || ehCampoDataPrevista(label);
}

interface MovimentacaoDetalheProps {
  movimentacao: Movimentacao;
  /** Quando informado, mostra o link "← Voltar" no topo (uso em página cheia — ver AprovadasPage.tsx).
   * Omitido quando usado dentro de um Drawer, que já tem seu próprio fechamento. */
  onVoltar?: () => void;
  /** true só quando o RH está com essa movimentação em mãos pra decidir (etapa
   * atual = RH, "Em Aprovação") — libera edição de Salário/Data prevista, ver
   * WorkflowPage.tsx. Sem `onSalvarEdicoes`, não tem efeito. */
  editavel?: boolean;
  onSalvarEdicoes?: (edicoes: EdicaoDadoMovimentacao[], novaDataPrevistaIso?: string) => void;
}

/** Ficha completa de uma movimentação — todos os campos do formulário, justificativa,
 * trilha de aprovações e documentos gerados. Usada tanto em Movimentações aprovadas
 * (página cheia) quanto no Workflow de aprovação (dentro de um Drawer, "Ver detalhes"). */
export function MovimentacaoDetalhe({ movimentacao: m, onVoltar, editavel, onSalvarEdicoes }: MovimentacaoDetalheProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const dados = m.dados ?? [];
  const dadosLabels = new Set(dados.map((d) => d.label));

  function iniciarEdicao() {
    const inicial: Record<string, string> = {};
    for (const d of dados) if (ehCampoEditavel(d.label)) inicial[d.label] = d.value;
    setRascunho(inicial);
    setEditando(true);
  }

  function cancelarEdicao() {
    setEditando(false);
    setRascunho({});
  }

  function salvarEdicao() {
    if (!onSalvarEdicoes) return;
    const edicoes: EdicaoDadoMovimentacao[] = [];
    let novaDataPrevistaIso: string | undefined;

    for (const d of dados) {
      if (!ehCampoEditavel(d.label)) continue;
      const valorNovo = rascunho[d.label];
      if (valorNovo === undefined || valorNovo === d.value) continue;
      edicoes.push({ label: d.label, valorAnterior: d.value, valorNovo });
      if (ehCampoDataPrevista(d.label)) novaDataPrevistaIso = dataBrParaIso(valorNovo) ?? undefined;
    }

    // "Percentual de alteração" (só existe no tipo Alteração Salarial) nunca é
    // digitado — recalcula sozinho quando salário atual/novo mudam.
    const percentual = dados.find((d) => d.label === "Percentual de alteração");
    if (percentual) {
      const salarioAtual = rascunho["Salário atual"] ?? dados.find((d) => d.label === "Salário atual")?.value ?? "";
      const salarioNovo = rascunho["Novo salário"] ?? dados.find((d) => d.label === "Novo salário")?.value ?? "";
      const novoPercentual = calcularPercentual(salarioAtual, salarioNovo);
      if (novoPercentual !== percentual.value) edicoes.push({ label: "Percentual de alteração", valorAnterior: percentual.value, valorNovo: novoPercentual });
    }

    if (edicoes.length > 0) onSalvarEdicoes(edicoes, novaDataPrevistaIso);
    setEditando(false);
    setRascunho({});
  }

  const camposBase: DadoField[] = [
    { label: "Tipo", value: m.tipo },
    { label: "Colaborador", value: m.colaborador },
    { label: "Departamento", value: m.depto },
    { label: "Gestor solicitante", value: m.solicitante },
    { label: "Data da solicitação", value: m.dataSolicitacao },
    { label: "Prioridade", value: m.prioridade },
  ].filter((c) => !dadosLabels.has(c.label));

  const camposGrid = [...dados, ...camposBase];
  const documentos = docsFor(m);

  return (
    <div className={styles.detalhe}>
      <div className={styles.detalheHeader}>
        {onVoltar && (
          <button type="button" className={styles.voltar} onClick={onVoltar}>
            ← Voltar
          </button>
        )}
        <div className={styles.detalheHeaderTop}>
          <div className={styles.detalheHeaderInfo}>
            <span className={styles.tipoBadgeGrande} style={{ background: tipoColor(m.tipoCod) }}>
              {m.tipoCod}
            </span>
            <div>
              <div className={styles.detalheNome}>
                {m.colaborador} <span className={styles.detalheId}>{m.id}</span>
              </div>
              <div className={styles.detalheDepto}>{m.depto}</div>
            </div>
          </div>
          <div className={styles.detalheHeaderRight}>
            <span className={styles.pillAprovado}>{m.status}</span>
            {m.aprovacaoFinal && (
              <div className={styles.detalheAprovacaoData}>
                {m.aprovacaoFinal.data} · {m.aprovacaoFinal.hora}
              </div>
            )}
            <div className={styles.detalhePrioridade}>Prioridade {m.prioridade}</div>
          </div>
        </div>
      </div>

      <div className={styles.detalheBody}>
        {editavel && onSalvarEdicoes && (
          <div className={styles.editarBar}>
            {editando ? (
              <>
                <Button variant="ghost" onClick={cancelarEdicao}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={salvarEdicao}>
                  Salvar alterações
                </Button>
              </>
            ) : (
              <Button variant="secondary" icon={<Pencil size={13} />} onClick={iniciarEdicao}>
                Editar salário / data prevista
              </Button>
            )}
          </div>
        )}

        <div className={styles.infoGrid}>
          {camposGrid.map((c) => {
            const editandoEsteCampo = editando && ehCampoEditavel(c.label);
            return (
              <div key={c.label} className={styles.infoItem}>
                <span className={styles.infoLabel}>{c.label}</span>
                {editandoEsteCampo && ehCampoDataPrevista(c.label) ? (
                  <input
                    type="date"
                    className={styles.infoInput}
                    value={dataBrParaIso(rascunho[c.label] ?? c.value) ?? ""}
                    onChange={(e) => setRascunho((prev) => ({ ...prev, [c.label]: formatarDataIso(e.target.value) }))}
                  />
                ) : editandoEsteCampo ? (
                  <input
                    type="text"
                    className={styles.infoInput}
                    value={rascunho[c.label] ?? c.value}
                    onChange={(e) => setRascunho((prev) => ({ ...prev, [c.label]: e.target.value }))}
                  />
                ) : (
                  <span className={styles.infoValue}>{c.value}</span>
                )}
              </div>
            );
          })}
        </div>

        {m.justificativa && (
          <div className={styles.justificativaBox}>
            <h4 className={styles.sectionTitle}>Justificativa da movimentação</h4>
            <p className={styles.justificativaTexto}>{m.justificativa}</p>
          </div>
        )}

        <div className={styles.duasColunas}>
          <div>
            <h4 className={styles.sectionTitle}>Aprovações</h4>
            <div className={styles.aprovacoesList}>
              {m.etapas.map((etapa, i) => (
                <div key={i} className={styles.aprovacaoItem}>
                  <Avatar nome={etapa.aprovador} size={34} />
                  <div className={styles.aprovacaoInfo}>
                    <div className={styles.aprovacaoTopo}>
                      <span className={styles.aprovacaoPapel}>{etapa.papel}</span>
                      <span className={styles.aprovacaoData}>
                        {etapa.data}
                        {etapa.hora ? ` · ${etapa.hora}` : ""}
                      </span>
                    </div>
                    <div className={styles.aprovacaoAprovador}>{etapa.aprovador}</div>
                    <div className={styles.aprovacaoStatus}>{etapa.status}</div>
                    {etapa.comentario && <div className={styles.aprovacaoComentario}>{etapa.comentario}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className={styles.sectionTitle}>Documentos gerados</h4>
            <div className={styles.documentosList}>
              {documentos.map((doc) => (
                <div key={doc.nome} className={styles.documentoItem}>
                  <span className={styles.documentoNome}>{doc.nome}</span>
                  <span className={doc.status === "Gerado" ? styles.pillGerado : styles.pillPendente}>{doc.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {m.historico && m.historico.length > 0 && (
          <div className={styles.historicoBox}>
            <h4 className={styles.sectionTitle}>Histórico de edições</h4>
            <div className={styles.historicoList}>
              {m.historico.map((h, i) => (
                <div key={i} className={styles.historicoItem}>
                  <div className={styles.historicoTopo}>
                    <span className={styles.historicoAcao}>{h.acao}</span>
                    <span className={styles.historicoData}>
                      {h.data} · {h.hora}
                    </span>
                  </div>
                  <div className={styles.historicoAutor}>por {h.autor}</div>
                  {h.detalhe && <div className={styles.historicoDetalhe}>{h.detalhe}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
