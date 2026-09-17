import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Modal } from "../../components/ui";
import { gerarIdPdiAcao, gerarIdPdiItem, pdiPodeSerConcluido, statusPdiAoSalvar, sugerirObjetivoEAcoes } from "../../domain/pdi";
import { formatarDataHora } from "../../domain/dates";
import { getEvidenciaPdiAcaoSignedUrl, removerEvidenciaPdiAcao, uploadEvidenciaPdiAcao } from "../../repositories/pdiRepository";
import { usePortalData } from "../../store/usePortalData";
import type { Pdi, PdiAcao, PdiItem, ResponsavelPdi, StatusItemPdi } from "../../types/domain";
import styles from "./PdiTab.module.css";

interface PdiModalProps {
  pdi: Pdi;
  onClose: () => void;
}

const STATUS_ITEM_OPCOES: StatusItemPdi[] = ["Não iniciada", "Em andamento", "Concluída", "Cancelada"];
const RESPONSAVEL_OPCOES: ResponsavelPdi[] = ["", "Colaborador", "Gestor", "Ambos"];

/** Textarea que cresce com o conteúdo em vez de rolar por dentro — usada
 * onde o texto precisa fluir naturalmente, nunca ser cortado (Objetivo de
 * desenvolvimento, descrição da ação). `rows={1}` é só o ponto de partida;
 * a altura real vem do `scrollHeight` recalculado a cada mudança de valor. */
function CampoAutoAjustavel({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function acaoVazia(itemId: string): PdiAcao {
  const agora = new Date().toISOString();
  return {
    id: gerarIdPdiAcao(),
    itemId,
    descricao: "",
    responsavel: "",
    dataInicio: null,
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
 * Concluída/Cancelada — ou, se não há nenhum item, quando o gestor declara
 * explicitamente que não há competência a desenvolver neste ciclo (ver
 * pdiPodeSerConcluido em domain/pdi.ts).
 *
 * Dois níveis de permissão (pedido da RH, 2026-09): `podeEditar` (RH/
 * gestorResponsavel) libera tudo, inclusive itens estruturais/diagnósticos
 * (objetivo de desenvolvimento, adicionar/remover competência, declarar
 * "sem competência", concluir o plano); `podeExecucao` (superset de
 * `podeEditar`, também libera o gestor ATUAL do colaborador) só libera
 * acompanhamento de execução — ações propostas, status/observações/datas
 * de cada item, comentários gerais — nunca os itens estruturais acima. */
export function PdiModal({ pdi, onClose }: PdiModalProps) {
  const { colaboradores, competenciasComportamentais, kpisCargo, pdiBiblioteca, perfil, conta, podeEditarPdi, podeAtualizarExecucaoPdi, salvarPdi, reabrirPdi } =
    usePortalData();

  const podeEditar = podeEditarPdi(pdi);
  const podeExecucao = podeAtualizarExecucaoPdi(pdi);
  const [rascunho, setRascunho] = useState<Pdi>(() => ({ ...pdi, itens: pdi.itens.map((i) => ({ ...i, acoes: i.acoes.map((a) => ({ ...a })) })) }));
  const [novaChave, setNovaChave] = useState("");
  const [salvando, setSalvando] = useState<"salvar" | "concluir" | "reabrir" | null>(null);
  // Itens cujo campo "Observações" foi aberto nesta sessão mesmo estando
  // vazio (clique em "Adicionar observação") — sem isso, a caixa de texto
  // sumiria de novo a cada re-render enquanto o usuário ainda não digitou nada.
  const [observacoesAbertas, setObservacoesAbertas] = useState<Set<string>>(new Set());

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
        dataInicio: null,
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
    <Modal
      title={pdi.colaboradorNome}
      titleExtra={
        <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
          {rascunho.status}
        </Badge>
      }
      subtitle={`PDI · ${pdi.ciclo}`}
      onClose={onClose}
      width={680}
    >
      {(rascunho.status === "Concluído" || !podeExecucao) && (
        <div className={styles.statusRow}>
          {rascunho.status === "Concluído" ? (
            <span className={styles.trancada}>
              Concluído por {rascunho.concluidoPor || "—"} em {formatarDataHora(rascunho.concluidoEm)}.
            </span>
          ) : (
            <span className={styles.trancada}>Somente leitura.</span>
          )}
        </div>
      )}

      {rascunho.itens.length === 0 && (
        <>
          <p className={styles.explicacao}>Nenhuma competência/KPI abaixo da nota mínima nesta avaliação — adicione manualmente, se necessário.</p>
          <label className={styles.declaracaoSemItens}>
            <input
              type="checkbox"
              checked={rascunho.semCompetenciaDesenvolvimento}
              disabled={!podeEditar}
              onChange={(e) => setRascunho((r) => ({ ...r, semCompetenciaDesenvolvimento: e.target.checked }))}
            />
            <span>Declaro que não há nenhuma competência a ser desenvolvida neste ciclo — só assim é possível concluir este PDI sem itens.</span>
          </label>
        </>
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
            <span className={styles.labelSimples}>Objetivo de desenvolvimento</span>
            <CampoAutoAjustavel
              className={styles.textoFluido}
              value={item.objetivoDesenvolvimento}
              onChange={(v) => atualizarItem(item.id, { objetivoDesenvolvimento: v })}
              disabled={!podeEditar}
            />
          </div>

          <div className={styles.campo}>
            <span className={styles.labelSimples}>Ações de desenvolvimento</span>
            <div className={styles.acoesLista}>
              {item.acoes.map((acao) => (
                <div key={acao.id} className={styles.acaoCard}>
                  <div className={styles.acaoItemTopo}>
                    <CampoAutoAjustavel
                      className={styles.acaoDescricao}
                      value={acao.descricao}
                      onChange={(v) => atualizarAcao(item.id, acao.id, { descricao: v })}
                      placeholder="Descrição da ação"
                      disabled={!podeExecucao}
                    />
                    {podeExecucao && (
                      <button type="button" className={styles.iconBtnPequeno} title="Remover ação" onClick={() => removerAcao(item.id, acao.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className={styles.acaoItemGrid}>
                    <div className={[styles.acaoCampo, styles.acaoCampoResponsavel].join(" ")}>
                      <span className={styles.labelSimples}>Responsável</span>
                      <select className={styles.select} value={acao.responsavel} onChange={(e) => atualizarAcao(item.id, acao.id, { responsavel: e.target.value as ResponsavelPdi })} disabled={!podeExecucao}>
                        {RESPONSAVEL_OPCOES.map((r) => (
                          <option key={r} value={r}>
                            {r || "—"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={[styles.acaoCampo, styles.acaoCampoData].join(" ")}>
                      <span className={styles.labelSimples}>Data início</span>
                      <input
                        type="date"
                        className={styles.input}
                        value={acao.dataInicio ?? ""}
                        onChange={(e) => atualizarAcao(item.id, acao.id, { dataInicio: e.target.value || null })}
                        disabled={!podeExecucao}
                      />
                    </div>
                    <div className={[styles.acaoCampo, styles.acaoCampoData].join(" ")}>
                      <span className={styles.labelSimples}>Data conclusão</span>
                      <input type="date" className={styles.input} value={acao.prazo ?? ""} onChange={(e) => atualizarAcao(item.id, acao.id, { prazo: e.target.value || null })} disabled={!podeExecucao} />
                    </div>
                    <div className={[styles.acaoCampo, styles.acaoCampoStatus].join(" ")}>
                      <span className={styles.labelSimples}>Status</span>
                      <select className={styles.select} value={acao.status} onChange={(e) => atualizarAcao(item.id, acao.id, { status: e.target.value as StatusItemPdi })} disabled={!podeExecucao}>
                        {STATUS_ITEM_OPCOES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <EvidenciaAcao acao={acao} podeEditar={podeExecucao} onAtualizar={(patch) => atualizarAcao(item.id, acao.id, patch)} autor={conta.nome} />
                  </div>
                </div>
              ))}
            </div>
            {podeExecucao && (
              <Button variant="ghost" icon={<Plus size={13} />} className={styles.botaoAlinhadoEsquerda} onClick={() => adicionarAcao(item.id)}>
                Adicionar ação
              </Button>
            )}
          </div>

          {item.observacoes !== "" || observacoesAbertas.has(item.id) ? (
            <div className={styles.campo}>
              <span className={styles.labelSimples}>Observações</span>
              <textarea className={styles.textarea} rows={2} value={item.observacoes} onChange={(e) => atualizarItem(item.id, { observacoes: e.target.value })} disabled={!podeExecucao} />
            </div>
          ) : (
            podeExecucao && (
              <Button
                variant="ghost"
                icon={<Plus size={13} />}
                className={styles.botaoAlinhadoEsquerda}
                onClick={() => setObservacoesAbertas((s) => new Set(s).add(item.id))}
              >
                Adicionar observação
              </Button>
            )
          )}
        </div>
      ))}

      {podeEditar && (competenciasDisponiveis.length > 0 || kpisDisponiveis.length > 0) && (
        <div className={styles.novoItemBox}>
          <div className={styles.campo}>
            <span className={styles.labelSimples}>Adicionar competência manualmente</span>
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
        <span className={styles.labelSimples}>Comentários</span>
        <textarea className={styles.textarea} rows={2} value={rascunho.comentarios} onChange={(e) => setRascunho((r) => ({ ...r, comentarios: e.target.value }))} disabled={!podeExecucao} />
      </div>

      <div className={styles.edicaoAcoes}>
        {perfil === "RH" && rascunho.status === "Concluído" && (
          <Button variant="danger" onClick={handleReabrir} disabled={salvando !== null}>
            {salvando === "reabrir" ? "Reabrindo..." : "Reabrir PDI"}
          </Button>
        )}
        {podeExecucao && (
          <Button variant="secondary" onClick={() => handleSalvar()} disabled={salvando !== null}>
            {salvando === "salvar" ? "Salvando..." : "Salvar"}
          </Button>
        )}
        {podeEditar && (
          <Button
            variant="primary"
            onClick={() => handleSalvar("Concluído")}
            disabled={!podeConcluir || salvando !== null}
            title={
              podeConcluir
                ? undefined
                : rascunho.itens.length === 0
                  ? "Marque a declaração acima confirmando que não há competência a desenvolver neste ciclo."
                  : "Só é possível concluir quando houver pelo menos 1 ação, todas concluídas ou canceladas."
            }
          >
            {salvando === "concluir" ? "Concluindo..." : "Concluir PDI"}
          </Button>
        )}
      </div>
    </Modal>
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
          <button type="button" className={styles.evidenciaIcone} title="Anexar evidência" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? <Loader2 size={14} className={styles.spin} /> : <Paperclip size={14} />}
          </button>
        )
      )}
      {erro && <span className={styles.evidenciaErro}>{erro}</span>}
    </div>
  );
}
