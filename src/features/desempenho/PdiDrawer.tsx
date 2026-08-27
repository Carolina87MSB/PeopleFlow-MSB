import { useRef, useState } from "react";
import { Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Drawer } from "../../components/ui";
import { gerarIdPdiAcao, gerarIdPdiItem, pdiPodeSerConcluido, statusPdiAoSalvar, sugerirObjetivoEAcoes } from "../../domain/pdi";
import { formatarDataHora } from "../../domain/dates";
import { getEvidenciaPdiAcaoSignedUrl, removerEvidenciaPdiAcao, uploadEvidenciaPdiAcao } from "../../repositories/pdiRepository";
import { usePortalData } from "../../store/usePortalData";
import type { Pdi, PdiAcao, PdiItem, ResponsavelPdi, StatusItemPdi } from "../../types/domain";
import styles from "./PdiTab.module.css";

interface PdiDrawerProps {
  pdi: Pdi;
  onClose: () => void;
}

const STATUS_ITEM_OPCOES: StatusItemPdi[] = ["Não iniciada", "Em andamento", "Concluída", "Cancelada"];
const RESPONSAVEL_OPCOES: ResponsavelPdi[] = ["", "Colaborador", "Gestor", "Ambos"];

function acaoVazia(itemId: string): PdiAcao {
  const agora = new Date().toISOString();
  return {
    id: gerarIdPdiAcao(),
    itemId,
    descricao: "",
    responsavel: "",
    prazo: null,
    status: "Não iniciada",
    ordem: 0,
    evidenciaStoragePath: null,
    evidenciaFileName: null,
    evidenciaUploadedEm: null,
    evidenciaUploadedPor: null,
    criadoEm: agora,
    updatedAt: agora,
  };
}

/** Plano de Desenvolvimento Individual — itens automáticos (competências/KPIs
 * abaixo da nota mínima na avaliação GESTOR) ou adicionados manualmente pelo
 * gestor, cada um com uma lista de ações de desenvolvimento. "Concluir" só
 * fica disponível quando há pelo menos 1 ação e todas estão
 * Concluída/Cancelada (ver pdiPodeSerConcluido em domain/pdi.ts). */
export function PdiDrawer({ pdi, onClose }: PdiDrawerProps) {
  const { colaboradores, competenciasComportamentais, kpisCargo, pdiBiblioteca, perfil, conta, podeEditarPdi, salvarPdi, reabrirPdi } = usePortalData();

  const podeEditar = podeEditarPdi(pdi);
  const [rascunho, setRascunho] = useState<Pdi>(() => ({ ...pdi, itens: pdi.itens.map((i) => ({ ...i, acoes: i.acoes.map((a) => ({ ...a })) })) }));
  const [novaChave, setNovaChave] = useState("");
  const [salvando, setSalvando] = useState<"salvar" | "concluir" | "reabrir" | null>(null);

  const colaborador = colaboradores.find((c) => c.nome === pdi.colaboradorNome);
  const competenciasDisponiveis = competenciasComportamentais.filter((c) => c.ativo && c.categoria !== "Lideranca");
  const kpisDisponiveis = colaborador ? kpisCargo.filter((k) => k.cargoNome === colaborador.cargo) : [];

  function atualizarItem(itemId: string, patch: Partial<PdiItem>) {
    setRascunho((r) => ({ ...r, itens: r.itens.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));
  }

  function removerItem(itemId: string) {
    setRascunho((r) => ({ ...r, itens: r.itens.filter((i) => i.id !== itemId) }));
  }

  function adicionarAcao(itemId: string) {
    setRascunho((r) => ({ ...r, itens: r.itens.map((i) => (i.id === itemId ? { ...i, acoes: [...i.acoes, acaoVazia(itemId)] } : i)) }));
  }

  function atualizarAcao(itemId: string, acaoId: string, patch: Partial<PdiAcao>) {
    setRascunho((r) => ({
      ...r,
      itens: r.itens.map((i) => (i.id === itemId ? { ...i, acoes: i.acoes.map((a) => (a.id === acaoId ? { ...a, ...patch } : a)) } : i)),
    }));
  }

  function removerAcao(itemId: string, acaoId: string) {
    setRascunho((r) => ({ ...r, itens: r.itens.map((i) => (i.id === itemId ? { ...i, acoes: i.acoes.filter((a) => a.id !== acaoId) } : i)) }));
  }

  function adicionarCompetenciaManual() {
    if (!novaChave) return;
    const [tipo, chave] = novaChave.split("::") as ["Comportamental" | "Tecnica", string];
    const agora = new Date().toISOString();
    const itemId = gerarIdPdiItem();
    let nome = chave;
    let competenciaId = "";
    if (tipo === "Comportamental") {
      const competencia = competenciasDisponiveis.find((c) => c.id === chave);
      if (!competencia) return;
      nome = competencia.nome;
      competenciaId = competencia.id;
    }
    const { objetivo, acoesSugeridas } = sugerirObjetivoEAcoes(chave, tipo, nome, pdiBiblioteca);
    const novoItem: PdiItem = {
      id: itemId,
      pdiId: rascunho.id,
      competenciaId,
      competenciaNome: nome,
      tipoCompetencia: tipo,
      notaObtida: null,
      origemManual: true,
      objetivoDesenvolvimento: objetivo,
      responsavel: "",
      dataInicio: null,
      dataPrevistaConclusao: null,
      status: "Não iniciada",
      observacoes: "",
      ordem: rascunho.itens.length,
      acoes: acoesSugeridas.map((descricao, i) => ({
        id: gerarIdPdiAcao(),
        itemId,
        descricao,
        responsavel: "" as ResponsavelPdi,
        prazo: null,
        status: "Não iniciada" as const,
        ordem: i,
        evidenciaStoragePath: null,
        evidenciaFileName: null,
        evidenciaUploadedEm: null,
        evidenciaUploadedPor: null,
        criadoEm: agora,
        updatedAt: agora,
      })),
      criadoEm: agora,
      updatedAt: agora,
    };
    setRascunho((r) => ({ ...r, itens: [...r.itens, novoItem] }));
    setNovaChave("");
  }

  async function handleSalvar(novoStatus?: "Concluído") {
    setSalvando(novoStatus === "Concluído" ? "concluir" : "salvar");
    const result = await salvarPdi({ ...rascunho, status: novoStatus ?? statusPdiAoSalvar(rascunho.status) });
    setSalvando(null);
    if (result.ok) {
      setRascunho({ ...result.pdi, itens: result.pdi.itens.map((i) => ({ ...i, acoes: i.acoes.map((a) => ({ ...a })) })) });
      if (novoStatus) onClose();
    }
  }

  async function handleReabrir() {
    setSalvando("reabrir");
    const result = await reabrirPdi(rascunho);
    setSalvando(null);
    if (result.ok) setRascunho({ ...result.pdi, itens: result.pdi.itens.map((i) => ({ ...i, acoes: i.acoes.map((a) => ({ ...a })) })) });
  }

  const podeConcluir = podeEditar && rascunho.status !== "Concluído" && pdiPodeSerConcluido(rascunho);

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{pdi.colaboradorNome}</div>
          <div className={styles.drawerSub}>PDI · {pdi.ciclo}</div>
        </div>
      }
    >
      <div className={styles.statusRow}>
        <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
          {rascunho.status}
        </Badge>
        {rascunho.status === "Concluído" && (
          <span className={styles.trancada}>
            Concluído por {rascunho.concluidoPor || "—"} em {formatarDataHora(rascunho.concluidoEm)}.
          </span>
        )}
        {!podeEditar && rascunho.status !== "Concluído" && <span className={styles.trancada}>Somente leitura.</span>}
      </div>

      {rascunho.itens.length === 0 && (
        <p className={styles.explicacao}>Nenhuma competência/KPI abaixo da nota mínima nesta avaliação — adicione manualmente, se necessário.</p>
      )}

      {rascunho.itens.map((item) => (
        <div key={item.id} className={styles.itemBloco}>
          <div className={styles.itemTopo}>
            <span className={styles.itemNome}>{item.competenciaNome}</span>
            <div className={styles.itemBadges}>
              {item.notaObtida !== null && <span className={styles.notaPill}>Nota: {item.notaObtida}</span>}
              <Badge bg="var(--color-surface, #f6fafb)" fg="var(--color-muted)">
                {item.origemManual ? "Manual" : "Automático"}
              </Badge>
              {podeEditar && (
                <button type="button" className={styles.iconBtnPequeno} title="Remover item" onClick={() => removerItem(item.id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className={styles.campo}>
            <span className={styles.label}>Objetivo de desenvolvimento</span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={item.objetivoDesenvolvimento}
              onChange={(e) => atualizarItem(item.id, { objetivoDesenvolvimento: e.target.value })}
              disabled={!podeEditar}
            />
          </div>

          <div className={styles.linha}>
            <div className={styles.campo}>
              <span className={styles.label}>Responsável</span>
              <select className={styles.select} value={item.responsavel} onChange={(e) => atualizarItem(item.id, { responsavel: e.target.value as ResponsavelPdi })} disabled={!podeEditar}>
                {RESPONSAVEL_OPCOES.map((r) => (
                  <option key={r} value={r}>
                    {r || "—"}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.campo}>
              <span className={styles.label}>Status</span>
              <select className={styles.select} value={item.status} onChange={(e) => atualizarItem(item.id, { status: e.target.value as StatusItemPdi })} disabled={!podeEditar}>
                {STATUS_ITEM_OPCOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.linha}>
            <div className={styles.campo}>
              <span className={styles.label}>Data início</span>
              <input type="date" className={styles.input} value={item.dataInicio ?? ""} onChange={(e) => atualizarItem(item.id, { dataInicio: e.target.value || null })} disabled={!podeEditar} />
            </div>
            <div className={styles.campo}>
              <span className={styles.label}>Data prevista de conclusão</span>
              <input
                type="date"
                className={styles.input}
                value={item.dataPrevistaConclusao ?? ""}
                onChange={(e) => atualizarItem(item.id, { dataPrevistaConclusao: e.target.value || null })}
                disabled={!podeEditar}
              />
            </div>
          </div>

          <div className={styles.campo}>
            <span className={styles.label}>Ações de desenvolvimento</span>
            <div className={styles.acoesLista}>
              {item.acoes.map((acao) => (
                <div key={acao.id} className={styles.acaoItem}>
                  <div className={styles.acaoItemLinha}>
                    <input
                      className={styles.input}
                      placeholder="Descrição da ação"
                      value={acao.descricao}
                      onChange={(e) => atualizarAcao(item.id, acao.id, { descricao: e.target.value })}
                      disabled={!podeEditar}
                    />
                    <select className={styles.select} value={acao.responsavel} onChange={(e) => atualizarAcao(item.id, acao.id, { responsavel: e.target.value as ResponsavelPdi })} disabled={!podeEditar}>
                      {RESPONSAVEL_OPCOES.map((r) => (
                        <option key={r} value={r}>
                          {r || "—"}
                        </option>
                      ))}
                    </select>
                    <input type="date" className={styles.input} value={acao.prazo ?? ""} onChange={(e) => atualizarAcao(item.id, acao.id, { prazo: e.target.value || null })} disabled={!podeEditar} />
                    <select className={styles.select} value={acao.status} onChange={(e) => atualizarAcao(item.id, acao.id, { status: e.target.value as StatusItemPdi })} disabled={!podeEditar}>
                      {STATUS_ITEM_OPCOES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {podeEditar && (
                      <button type="button" className={styles.iconBtnPequeno} title="Remover ação" onClick={() => removerAcao(item.id, acao.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <EvidenciaAcao acao={acao} podeEditar={podeEditar} onAtualizar={(patch) => atualizarAcao(item.id, acao.id, patch)} autor={conta.nome} />
                </div>
              ))}
            </div>
            {podeEditar && (
              <Button variant="secondary" icon={<Plus size={13} />} onClick={() => adicionarAcao(item.id)}>
                Adicionar ação
              </Button>
            )}
          </div>

          <div className={styles.campo}>
            <span className={styles.label}>Observações</span>
            <textarea className={styles.textarea} rows={2} value={item.observacoes} onChange={(e) => atualizarItem(item.id, { observacoes: e.target.value })} disabled={!podeEditar} />
          </div>
        </div>
      ))}

      {podeEditar && (competenciasDisponiveis.length > 0 || kpisDisponiveis.length > 0) && (
        <div className={styles.novoItemBox}>
          <div className={styles.campo}>
            <span className={styles.label}>Adicionar competência manualmente</span>
            <select className={styles.select} value={novaChave} onChange={(e) => setNovaChave(e.target.value)}>
              <option value="">Selecione...</option>
              {competenciasDisponiveis.length > 0 && (
                <optgroup label="Competências Comportamentais">
                  {competenciasDisponiveis.map((c) => (
                    <option key={c.id} value={`Comportamental::${c.id}`}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              {kpisDisponiveis.length > 0 && (
                <optgroup label="KPIs do cargo">
                  {kpisDisponiveis.map((k) => (
                    <option key={k.id} value={`Tecnica::${k.nomeIndicador}`}>
                      {k.nomeIndicador}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <Button variant="secondary" icon={<Plus size={13} />} onClick={adicionarCompetenciaManual} disabled={!novaChave}>
            Adicionar
          </Button>
        </div>
      )}

      <div className={styles.campo}>
        <span className={styles.label}>Comentários</span>
        <textarea className={styles.textarea} rows={2} value={rascunho.comentarios} onChange={(e) => setRascunho((r) => ({ ...r, comentarios: e.target.value }))} disabled={!podeEditar} />
      </div>

      <div className={styles.edicaoAcoes}>
        {perfil === "RH" && rascunho.status === "Concluído" && (
          <Button variant="danger" onClick={handleReabrir} disabled={salvando !== null}>
            {salvando === "reabrir" ? "Reabrindo..." : "Reabrir PDI"}
          </Button>
        )}
        {podeEditar && (
          <>
            <Button variant="secondary" onClick={() => handleSalvar()} disabled={salvando !== null}>
              {salvando === "salvar" ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="primary" onClick={() => handleSalvar("Concluído")} disabled={!podeConcluir || salvando !== null} title={!podeConcluir ? "Só é possível concluir quando houver pelo menos 1 ação, todas concluídas ou canceladas." : undefined}>
              {salvando === "concluir" ? "Concluindo..." : "Concluir PDI"}
            </Button>
          </>
        )}
      </div>
    </Drawer>
  );
}

interface EvidenciaAcaoProps {
  acao: PdiAcao;
  podeEditar: boolean;
  autor: string;
  onAtualizar: (patch: Partial<PdiAcao>) => void;
}

/** Comprovação de que a ação foi de fato executada — arquivo único por
 * ação (upload substitui o anterior), guardado no bucket privado
 * `pdi-evidencias`. Envia direto pro Storage ao escolher o arquivo, mas só
 * fica de fato vinculado à ação quando o PDI é salvo (mesmo princípio de
 * rascunho-até-salvar do resto do formulário) — por isso, se a ficha for
 * fechada sem salvar depois de anexar, o arquivo enviado fica órfão no
 * bucket (aceitável: raro, e sem risco de dado sensível vazado, o bucket é
 * privado). */
function EvidenciaAcao({ acao, podeEditar, autor, onAtualizar }: EvidenciaAcaoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");

  async function handleArquivoEscolhido(file: File) {
    setEnviando(true);
    setErro("");
    try {
      const { path } = await uploadEvidenciaPdiAcao(acao.id, file);
      onAtualizar({
        evidenciaStoragePath: path,
        evidenciaFileName: file.name,
        evidenciaUploadedEm: new Date().toISOString(),
        evidenciaUploadedPor: autor,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar evidência.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleVerEvidencia() {
    if (!acao.evidenciaStoragePath) return;
    setAbrindo(true);
    setErro("");
    try {
      const url = await getEvidenciaPdiAcaoSignedUrl(acao.evidenciaStoragePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao abrir evidência.");
    } finally {
      setAbrindo(false);
    }
  }

  async function handleRemoverEvidencia() {
    if (!acao.evidenciaStoragePath) return;
    setErro("");
    try {
      await removerEvidenciaPdiAcao(acao.evidenciaStoragePath);
      onAtualizar({ evidenciaStoragePath: null, evidenciaFileName: null, evidenciaUploadedEm: null, evidenciaUploadedPor: null });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao remover evidência.");
    }
  }

  return (
    <div className={styles.acaoItemEvidencia}>
      <input
        ref={inputRef}
        type="file"
        className={styles.arquivoOculto}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleArquivoEscolhido(file);
        }}
      />

      {acao.evidenciaStoragePath ? (
        <div className={styles.evidenciaAnexada}>
          <Paperclip size={12} />
          <button type="button" className={styles.evidenciaLink} onClick={handleVerEvidencia} disabled={abrindo}>
            {abrindo ? "Abrindo..." : acao.evidenciaFileName || "Evidência anexada"}
          </button>
          {acao.evidenciaUploadedEm && (
            <span className={styles.evidenciaMeta}>
              · {formatarDataHora(acao.evidenciaUploadedEm)}
              {acao.evidenciaUploadedPor ? ` · ${acao.evidenciaUploadedPor}` : ""}
            </span>
          )}
          {podeEditar && (
            <button type="button" className={styles.iconBtnPequeno} title="Remover evidência" onClick={handleRemoverEvidencia}>
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        podeEditar && (
          <button type="button" className={styles.evidenciaBtn} onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 size={12} className={styles.spin} /> : <Paperclip size={12} />}
            {enviando ? "Enviando..." : "Anexar evidência"}
          </button>
        )
      )}
      {erro && <span className={styles.evidenciaErro}>{erro}</span>}
    </div>
  );
}
