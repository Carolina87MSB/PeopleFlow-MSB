import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Badge, Button, Modal } from "../../components/ui";
import { CAMPOS_DESCRICAO_CARGO, descricaoCargoVazia } from "../../domain/descricaoCargo";
import type { CampoDescricaoCargo, CampoMeta } from "../../domain/descricaoCargo";
import { statusDescricaoCargoMeta } from "../../domain/colors";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { HistoricoDescricaoCargo } from "../../types/domain";
import styles from "./DescricaoCargoModal.module.css";

interface DescricaoCargoModalProps {
  cargoNome: string;
  onClose: () => void;
}

/** Ficha do formulário de descrição de cargo (POP-RH-001): todos os campos do
 * documento oficial, editáveis campo a campo — RH e Diretoria em todos os
 * grupos, Gestor só em "Sumário do cargo", "Principais responsabilidades",
 * "Requisitos do cargo" e "Competências e requisitos desejáveis", e só nos
 * cargos sob sua liderança (ver podeEditarSecaoDescricaoCargo em
 * usePortalData.ts).
 *
 * A edição do Gestor NUNCA vira conteúdo oficial direto: fica como proposta
 * em `descricao.pendente`, com `status` "Em revisão", até o RH/Diretoria
 * aprovar (aplica a proposta no oficial) ou rejeitar (descarta a proposta).
 * RH/Diretoria editando grava direto no oficial e já fica "Aprovada" — são a
 * própria autoridade de aprovação. Histórico de atualizações (com perfil de
 * quem editou) e o bloco final "Aprovações" (elaborado/revisado por +
 * aprovado por, cada um com data) documentam esse fluxo. Dados de controle
 * (código/revisão/data) ficam em destaque no topo por serem usados em
 * auditorias. */
export function DescricaoCargoModal({ cargoNome, onClose }: DescricaoCargoModalProps) {
  const {
    descricoesCargo,
    podeEditarSecaoDescricaoCargo,
    podeAprovarDescricaoCargo,
    aprovarDescricaoCargo,
    rejeitarDescricaoCargo,
    atualizarCampoDescricaoCargo,
    carregarHistoricoDescricaoCargo,
  } = usePortalData();

  const descricao = useMemo(
    () => descricoesCargo.find((d) => d.cargoNome === cargoNome) ?? descricaoCargoVazia(cargoNome),
    [descricoesCargo, cargoNome],
  );

  const [historico, setHistorico] = useState<HistoricoDescricaoCargo[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [processandoDecisao, setProcessandoDecisao] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregandoHistorico(true);
    carregarHistoricoDescricaoCargo(cargoNome)
      .then((h) => {
        if (!cancelado) setHistorico(h);
      })
      .finally(() => {
        if (!cancelado) setCarregandoHistorico(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cargoNome, carregarHistoricoDescricaoCargo]);

  const grupos = useMemo(() => {
    const map = new Map<string, CampoMeta[]>();
    CAMPOS_DESCRICAO_CARGO.forEach((c) => {
      const list = map.get(c.grupo) || [];
      list.push(c);
      map.set(c.grupo, list);
    });
    return [...map.entries()];
  }, []);

  async function handleSalvarCampo(campo: CampoDescricaoCargo, valorNovo: string) {
    const result = await atualizarCampoDescricaoCargo(cargoNome, campo, valorNovo);
    if (result.ok) {
      const h = await carregarHistoricoDescricaoCargo(cargoNome);
      setHistorico(h);
    }
    return result;
  }

  async function handleAprovar() {
    setProcessandoDecisao(true);
    const result = await aprovarDescricaoCargo(cargoNome);
    setProcessandoDecisao(false);
    if (result.ok) setHistorico(await carregarHistoricoDescricaoCargo(cargoNome));
  }

  async function handleRejeitar() {
    setProcessandoDecisao(true);
    const result = await rejeitarDescricaoCargo(cargoNome);
    setProcessandoDecisao(false);
    if (result.ok) setHistorico(await carregarHistoricoDescricaoCargo(cargoNome));
  }

  const statusMeta = statusDescricaoCargoMeta(descricao.status);
  const emRevisao = descricao.status === "Em revisão";
  const podeDecidir = podeAprovarDescricaoCargo && emRevisao;

  return (
    <Modal
      title={formatarNomeCargo(cargoNome)}
      titleExtra={
        <Badge bg={statusMeta.bg} fg={statusMeta.fg}>
          {descricao.status}
        </Badge>
      }
      subtitle="Descrição de cargo · POP-RH-001"
      onClose={onClose}
      width={640}
    >
      {emRevisao && (
        <div className={styles.bannerRevisao}>
          Existe uma alteração em revisão, enviada por {descricao.elaboradoPor || "—"} em{" "}
          {formatarDataHora(descricao.elaboradoEm)} — aguardando aprovação do RH/Diretoria. Os campos abaixo mostram o
          conteúdo oficial atual e, quando houver, a proposta pendente.
        </div>
      )}
      {descricao.status === "Rejeitada" && (
        <div className={styles.bannerRejeitada}>
          A última alteração proposta foi rejeitada pelo RH/Diretoria. O conteúdo abaixo é o último aprovado.
        </div>
      )}

      {grupos.map(([grupo, campos]) => {
        const compacto = grupo === "Dados do formulário (auditoria)";
        return (
          <div key={grupo} className={styles.grupo}>
            <h4 className={styles.sectionTitle}>{grupo}</h4>
            <div
              className={campos.length === 1 ? styles.camposGridFull : styles.camposGrid}
              style={campos.length === 1 ? undefined : { gridTemplateColumns: `repeat(${campos.length}, 1fr)` }}
            >
              {campos.map((campo) => (
                <CampoEditavel
                  key={campo.key}
                  meta={campo}
                  valorOficial={descricao[campo.key]}
                  valorPendente={descricao.pendente?.[campo.key]}
                  podeEditar={podeEditarSecaoDescricaoCargo(cargoNome, campo.grupo)}
                  onSalvar={(novo) => handleSalvarCampo(campo.key, novo)}
                  compacto={compacto}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className={styles.grupo}>
        <h4 className={styles.sectionTitle}>Aprovações</h4>
        <div className={styles.aprovacoesBloco}>
          <div className={styles.aprovacaoLinha}>
            <span className={styles.aprovacaoLabel}>Elaborador/Revisado por</span>
            <span className={styles.aprovacaoValor}>
              {descricao.elaboradoPor ? (
                <>
                  {descricao.elaboradoPor} <span className={styles.aprovacaoData}>· {formatarDataHora(descricao.elaboradoEm)}</span>
                </>
              ) : (
                <span className={styles.vazio}>Ainda não registrado</span>
              )}
            </span>
          </div>
          <div className={styles.aprovacaoLinha}>
            <span className={styles.aprovacaoLabel}>Aprovado por</span>
            <span className={styles.aprovacaoValor}>
              {descricao.aprovadoPor ? (
                <>
                  {descricao.aprovadoPor} <span className={styles.aprovacaoData}>· {formatarDataHora(descricao.aprovadoEm)}</span>
                </>
              ) : (
                <span className={styles.vazio}>Ainda não registrado</span>
              )}
            </span>
            {podeDecidir && (
              <div className={styles.aprovacaoAcoes}>
                <Button variant="danger" onClick={handleRejeitar} disabled={processandoDecisao}>
                  Rejeitar alteração
                </Button>
                <Button variant="primary" onClick={handleAprovar} disabled={processandoDecisao}>
                  Aprovar alteração
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.grupo}>
        <h4 className={styles.sectionTitle}>Histórico de atualizações{historico.length > 0 ? ` (${historico.length})` : ""}</h4>
        {carregandoHistorico ? (
          <div className={styles.semHistorico}>Carregando histórico...</div>
        ) : historico.length === 0 ? (
          <div className={styles.semHistorico}>Nenhuma alteração registrada ainda para esta descrição de cargo.</div>
        ) : (
          <div className={styles.timeline}>
            {historico.map((h) => (
              <div key={h.id} className={styles.item}>
                <span className={styles.dot} />
                <div className={styles.itemContent}>
                  <div className={styles.itemTopo}>
                    <span className={styles.itemTitulo}>{h.campoLabel}</span>
                    <span className={styles.itemData}>{formatarDataHora(h.editadoEm)}</span>
                  </div>
                  <p className={styles.itemDescricao}>
                    {h.valorAnterior ? (
                      <>
                        <s className={styles.valorAnterior}>{truncar(h.valorAnterior)}</s>{" "}
                      </>
                    ) : null}
                    {truncar(h.valorNovo) || "(vazio)"}
                  </p>
                  <p className={styles.itemAutor}>
                    por {h.editadoPor}
                    {h.perfil ? ` · ${h.perfil}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function truncar(s: string, max = 160): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface CampoEditavelProps {
  meta: CampoMeta;
  valorOficial: string;
  /** Proposta pendente (Gestor) pra este campo, se houver — `undefined` quando não há revisão em aberto tocando este campo. */
  valorPendente: string | undefined;
  podeEditar: boolean;
  onSalvar: (valorNovo: string) => Promise<{ ok: true } | { ok: false }>;
  /** "Dados do formulário (auditoria)" é metadado, não conteúdo do cargo — rótulo/valor menores, mesmo espírito da versão aprovada da tela. */
  compacto?: boolean;
}

function CampoEditavel({ meta, valorOficial, valorPendente, podeEditar, onSalvar, compacto }: CampoEditavelProps) {
  const temProposta = valorPendente !== undefined && valorPendente !== valorOficial;
  const valorEfetivo = temProposta ? (valorPendente as string) : valorOficial;

  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valorEfetivo);
  const [salvando, setSalvando] = useState(false);

  function iniciarEdicao() {
    setRascunho(valorEfetivo);
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    const result = await onSalvar(rascunho.trim());
    setSalvando(false);
    if (result.ok) setEditando(false);
  }

  return (
    <div className={styles.campo}>
      <div className={styles.campoTopo}>
        <span className={compacto ? styles.campoLabelCompacto : styles.campoLabel}>{meta.label}</span>
        {podeEditar && !editando ? (
          <button type="button" className={styles.editarBtn} onClick={iniciarEdicao} title={`Editar ${meta.label}`}>
            <Pencil size={12} />
          </button>
        ) : null}
      </div>
      {editando ? (
        <div className={styles.edicao}>
          {meta.multiline ? (
            <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={4} className={styles.textarea} />
          ) : (
            <input value={rascunho} onChange={(e) => setRascunho(e.target.value)} className={styles.input} />
          )}
          <div className={styles.edicaoAcoes}>
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={compacto ? styles.campoValorCompacto : styles.campoValor}>
            {valorOficial || <span className={styles.vazio}>Não preenchido</span>}
          </div>
          {temProposta && (
            <div className={styles.propostaPendente}>
              <span className={styles.propostaTag}>Proposta pendente de aprovação</span>
              <div className={styles.propostaValor}>{valorPendente}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
