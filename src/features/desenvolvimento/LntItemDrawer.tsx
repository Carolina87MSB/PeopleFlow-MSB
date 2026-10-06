import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, FilterChips, Button } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import type { Direcionador, PrioridadeLnt } from "../../domain/lnt";
import type { CategoriaNecessidade } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, ConfirmarComMotivo, Erro, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { CATEGORIA_NECESSIDADE, PRIORIDADE } from "./rotulos";
import { eventosDaLnt, lnt, type CicloLnt, type ItemLnt, type NecessidadeNoCicloComViva } from "./lntRepository";
import { membrosDoItem, resumoDoItem, type DadosCiclo } from "./lntDados";
import { dataCurta, mensagemDeErro, plural, quemEhANecessidade, ROTULO_DIRECIONADOR, ROTULO_EVENTO, ROTULO_SITUACAO_ITEM, TEXTO_DEMANDA_DIRETA } from "./lntRotulos";
import { LntNecessidadeDrawer } from "./LntNecessidadeDrawer";
import { SeletorDirecionadores } from "./LntItens";
import styles from "./Desenvolvimento.module.css";

type Modo = "detalhe" | "editar" | "prioridade";

interface Props {
  ciclo: CicloLnt;
  dados: DadosCiclo;
  itemId: number;
  podeEditar: boolean;
  onFechar: () => void;
  recarregar: () => void;
}

export function LntItemDrawer({ ciclo, dados, itemId, podeEditar, onFechar, recarregar }: Props) {
  const { flash } = useToast();
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const item = dados.itens.find((i) => i.id === itemId);
  const [modo, setModo] = useState<Modo>("detalhe");
  const [erro, setErro] = useState<string | null>(null);
  const [necessidadeAberta, setNecessidadeAberta] = useState<NecessidadeNoCicloComViva | null>(null);
  const [retirando, setRetirando] = useState<number | null>(null);
  // Histórico: a auditoria só é legível pelo RH; para os demais perfis a seção não aparece.
  const historico = useConsulta(() => (perfil === "RH" ? eventosDaLnt("item", itemId) : Promise.resolve([])), [itemId, perfil, item?.updated_at]);

  const membros = useMemo(() => membrosDoItem(dados, itemId), [dados, itemId]);
  if (!item) return null;
  const resumo = resumoDoItem(dados, item);
  const direto = item.origem_item === "direto";

  async function executar(fn: () => Promise<unknown>, mensagem: string) {
    setErro(null);
    try {
      await fn();
      flash(mensagem);
      setModo("detalhe");
      recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
      throw e;
    }
  }

  const faltaPrioridade = !item.prioridade || item.direcionadores.length === 0;
  const quem = (colaboradorId: number | null) => (colaboradorId != null ? (pessoaPorId.get(colaboradorId)?.nome ?? null) : null);

  return (
    <>
      <Drawer
        onClose={onFechar}
        header={
          <CabecalhoDrawer
            eyebrow="Item da LNT"
            titulo={item.titulo}
            sub={
              <>
                <Selo tom={ROTULO_SITUACAO_ITEM[item.situacao].tom}>{ROTULO_SITUACAO_ITEM[item.situacao].rotulo}</Selo>
                {direto && <span style={{ marginLeft: 8 }}>{TEXTO_DEMANDA_DIRETA}</span>}
              </>
            }
          />
        }
      >
        {modo === "editar" && podeEditar ? (
          <FormEdicao item={item} onCancelar={() => { setModo("detalhe"); setErro(null); }} onSalvar={(campos) => executar(() => lnt.editarItem({ id: item.id, ...campos }), "Item atualizado.")} erro={erro} />
        ) : modo === "prioridade" && podeEditar ? (
          <FormPrioridade item={item} pessoas={resumo.pessoas} departamentos={resumo.departamentos.length} onCancelar={() => { setModo("detalhe"); setErro(null); }} onSalvar={(d) => executar(() => lnt.definirPrioridade({ id: item.id, ...d }), "Prioridade definida.")} erro={erro} />
        ) : (
          <>
            <div className={styles.secao}>
              <h4 className={styles.secaoTitulo}>Resumo</h4>
              <dl className={styles.detalhe}>
                <dt>Categoria</dt>
                <dd>{item.categoria ? CATEGORIA_NECESSIDADE[item.categoria] : "—"}</dd>
                <dt>Descrição</dt>
                <dd>{item.descricao || "—"}</dd>
                {(direto || item.justificativa) && (
                  <>
                    <dt>Justificativa</dt>
                    <dd>{item.justificativa || "—"}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className={styles.secao}>
              <h4 className={styles.secaoTitulo}>Prioridade</h4>
              <dl className={styles.detalhe}>
                <dt>Prioridade</dt>
                <dd>{item.prioridade ? <Selo tom={PRIORIDADE[item.prioridade].tom}>{PRIORIDADE[item.prioridade].rotulo}</Selo> : "A definir"}</dd>
                <dt>Justificativa</dt>
                <dd>{item.justificativa_prioridade || "—"}</dd>
                <dt>Direcionadores</dt>
                <dd>{item.direcionadores.length > 0 ? <div className={styles.selos}>{item.direcionadores.map((d) => <Selo key={d} tom="neutral">{ROTULO_DIRECIONADOR[d]}</Selo>)}</div> : "A definir"}</dd>
              </dl>
            </div>

            <div className={styles.secao}>
              <h4 className={styles.secaoTitulo}>Público</h4>
              <dl className={styles.detalhe}>
                {direto ? (
                  <>
                    <dt>Estimado</dt>
                    <dd>{item.publico_estimado ? plural(item.publico_estimado, "pessoa", "pessoas") : "—"}</dd>
                    <dt>Quem</dt>
                    <dd>{item.publico_descricao || "—"}</dd>
                  </>
                ) : (
                  <>
                    <dt>Pessoas</dt>
                    <dd>{resumo.pessoas}</dd>
                    <dt>Departamentos</dt>
                    <dd>{resumo.departamentos.join(", ") || "—"}</dd>
                  </>
                )}
              </dl>
              <span className={styles.dica}>Números de apoio à decisão: não formam pontuação.</span>
            </div>

            {item.situacao !== "em_analise" && (
              <div className={styles.secao}>
                <h4 className={styles.secaoTitulo}>Decisão</h4>
                <dl className={styles.detalhe}>
                  <dt>Situação</dt>
                  <dd>{ROTULO_SITUACAO_ITEM[item.situacao].rotulo}</dd>
                  <dt>Motivo</dt>
                  <dd>{item.motivo_decisao || "—"}</dd>
                  <dt>Em</dt>
                  <dd>{dataCurta(item.decidido_em)}</dd>
                </dl>
                {item.situacao === "nao_priorizado" && <span className={styles.dica}>As necessidades de origem continuam registradas na Base de Necessidades.</span>}
              </div>
            )}

            {!direto && (
              <div className={styles.secao}>
                <h4 className={styles.secaoTitulo}>Necessidades de origem ({membros.length})</h4>
                {membros.length === 0 ? (
                  <span className={styles.dica}>Nenhuma necessidade neste item.</span>
                ) : (
                  <ul className={styles.origens}>
                    {membros.map((m) => {
                      const nome = quemEhANecessidade(m, pessoaPorId);
                      return (
                        <li key={m.id} className={styles.origem}>
                          <div className={styles.origemCorpo}>
                            <div className={styles.origemQuem}>
                              <strong>{nome}</strong>
                              {m.departamento_na_carga && <span className={styles.secundario}>{m.departamento_na_carga}</span>}
                              {m.mudou_desde_carga_em && <Selo tom="info">Atualizada após a carga</Selo>}
                            </div>
                            <button type="button" className={styles.origemDescricao} onClick={() => setNecessidadeAberta(m)}>
                              {m.descricao_na_carga}
                            </button>
                          </div>
                          {podeEditar && (
                            <button
                              type="button"
                              className={styles.botaoLixeira}
                              title="Retirar deste item"
                              aria-label={`Retirar deste item a necessidade de ${nome}`}
                              disabled={retirando === m.necessidade_id}
                              onClick={() => setRetirando(m.necessidade_id)}
                            >
                              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                            </button>
                          )}
                          {podeEditar && retirando === m.necessidade_id && (
                            <div className={styles.origemConfirmacao} role="alertdialog" aria-label="Confirmar retirada da necessidade">
                              <span>
                                Retirar a necessidade de <strong>{nome}</strong> deste item? Ela não será excluída nem alterada: apenas sai deste item e volta para a Base para análise deste ciclo.
                              </span>
                              <div className={styles.acoes}>
                                <Button variant="ghost" onClick={() => setRetirando(null)}>
                                  Cancelar
                                </Button>
                                <Button
                                  variant="danger"
                                  onClick={() => executar(() => lnt.desfazerConsolidacao(ciclo.id, [m.necessidade_id]), "Necessidade retirada do item.").then(() => setRetirando(null), () => setRetirando(null))}
                                >
                                  Confirmar retirada
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {podeEditar && membros.length > 0 && <span className={styles.dica}>Retirar uma necessidade a devolve para a Base para análise. Ela não é apagada nem alterada.</span>}
              </div>
            )}

            {perfil === "RH" && (historico.dados?.length ?? 0) > 0 && (
              <div className={styles.secao}>
                <h4 className={styles.secaoTitulo}>Histórico</h4>
                <ul className={styles.historico}>
                  {historico.dados!.map((ev) => (
                    <li key={ev.id}>
                      <strong>{ROTULO_EVENTO[ev.acao] ?? ev.acao}</strong>
                      <span className={styles.secundario}>
                        {dataCurta(ev.ts)}
                        {quem(ev.colaborador_id) ? ` · ${quem(ev.colaborador_id)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erro && <Erro mensagem={erro} />}
            {podeEditar && (
              <div className={styles.secao}>
                <h4 className={styles.secaoTitulo}>Ações</h4>
                <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
                  <Button variant="secondary" onClick={() => { setErro(null); setModo("editar"); }}>
                    Editar item
                  </Button>
                  <Button variant="secondary" onClick={() => { setErro(null); setModo("prioridade"); }}>
                    Definir prioridade
                  </Button>
                  {item.situacao !== "incluido" && (
                    <ConfirmarComMotivo
                      rotulo={item.situacao === "nao_priorizado" ? "Reconsiderar e incluir" : "Incluir na LNT"}
                      confirmar="Incluir"
                      variante="success"
                      motivoObrigatorio={false}
                      desabilitado={faltaPrioridade}
                      onConfirmar={(motivo) => executar(() => lnt.incluirItem(item.id, motivo), "Item incluído na LNT.")}
                    />
                  )}
                  {item.situacao !== "nao_priorizado" && (
                    <ConfirmarComMotivo rotulo="Não priorizar" confirmar="Não priorizar" variante="danger" motivoObrigatorio onConfirmar={(motivo) => executar(() => lnt.naoPriorizarItem(item.id, motivo), "Item não priorizado.")} />
                  )}
                </div>
                {faltaPrioridade && item.situacao !== "incluido" && <span className={styles.dica}>Para incluir, defina antes a prioridade e ao menos um direcionador.</span>}
                <span className={styles.dica}>Não priorizar não cancela as necessidades: elas continuam na Base de Necessidades e poderão ser consideradas em outro ciclo.</span>
              </div>
            )}
          </>
        )}
      </Drawer>
      {necessidadeAberta && <LntNecessidadeDrawer linha={dados.linhas.find((l) => l.id === necessidadeAberta.id) ?? necessidadeAberta} onFechar={() => setNecessidadeAberta(null)} />}
    </>
  );
}

// ── Edição ──────────────────────────────────────────────────────────────
function FormEdicao({ item, onCancelar, onSalvar, erro }: { item: ItemLnt; onCancelar: () => void; onSalvar: (c: { titulo: string; descricao: string; categoria: CategoriaNecessidade | ""; justificativa: string; publico_estimado: number | null; publico_descricao: string }) => Promise<unknown>; erro: string | null }) {
  const direto = item.origem_item === "direto";
  const [titulo, setTitulo] = useState(item.titulo);
  const [descricao, setDescricao] = useState(item.descricao);
  const [categoria, setCategoria] = useState<string>(item.categoria ?? "");
  const [justificativa, setJustificativa] = useState(item.justificativa);
  const [publico, setPublico] = useState(item.publico_estimado ? String(item.publico_estimado) : "");
  const [publicoDescricao, setPublicoDescricao] = useState(item.publico_descricao);
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className={styles.secao}
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await onSalvar({ titulo, descricao, categoria: categoria as CategoriaNecessidade | "", justificativa, publico_estimado: publico ? Number(publico) : null, publico_descricao: publicoDescricao });
        } catch {
          // o erro é exibido abaixo
        } finally {
          setSalvando(false);
        }
      }}
    >
      <h4 className={styles.secaoTitulo}>Editar item</h4>
      <div className={styles.grid}>
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Título *
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required />
        </label>
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Descrição
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
        </label>
        <label className={styles.campo}>
          Categoria
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">—</option>
            {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_NECESSIDADE[c]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          Público estimado (pessoas){direto ? " *" : ""}
          <input type="number" min={1} max={100000} value={publico} onChange={(e) => setPublico(e.target.value)} required={direto} />
        </label>
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Descrição do público
          <input value={publicoDescricao} onChange={(e) => setPublicoDescricao(e.target.value)} maxLength={500} />
        </label>
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Justificativa{direto ? " *" : ""}
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={2000} required={direto} />
        </label>
      </div>
      {erro && <Erro mensagem={erro} />}
      <div className={styles.acoes}>
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

// ── Prioridade e direcionadores ─────────────────────────────────────────
const OPCOES_PRIORIDADE: { rotulo: string; valor: PrioridadeLnt }[] = [
  { rotulo: "Alta", valor: "alta" },
  { rotulo: "Média", valor: "media" },
  { rotulo: "Baixa", valor: "baixa" },
];

function FormPrioridade({ item, pessoas, departamentos, onCancelar, onSalvar, erro }: { item: ItemLnt; pessoas: number; departamentos: number; onCancelar: () => void; onSalvar: (d: { prioridade: PrioridadeLnt; direcionadores: Direcionador[]; justificativa_prioridade: string }) => Promise<unknown>; erro: string | null }) {
  const [prioridade, setPrioridade] = useState<PrioridadeLnt | "">(item.prioridade ?? "");
  const [direcionadores, setDirecionadores] = useState<Direcionador[]>(item.direcionadores);
  const [justificativa, setJustificativa] = useState(item.justificativa_prioridade);
  const [salvando, setSalvando] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  return (
    <form
      className={styles.secao}
      onSubmit={async (e) => {
        e.preventDefault();
        setLocal(null);
        if (!prioridade) return setLocal("Escolha a prioridade.");
        if (direcionadores.length === 0) return setLocal("Escolha ao menos um direcionador.");
        if (prioridade === "alta" && !justificativa.trim()) return setLocal("Informe a justificativa da prioridade Alta.");
        setSalvando(true);
        try {
          await onSalvar({ prioridade, direcionadores, justificativa_prioridade: justificativa.trim() });
        } catch {
          // o erro é exibido abaixo
        } finally {
          setSalvando(false);
        }
      }}
    >
      <h4 className={styles.secaoTitulo}>Definir prioridade</h4>
      <span className={styles.dica}>
        Para decidir: {plural(pessoas, "pessoa", "pessoas")} e {plural(departamentos, "departamento", "departamentos")} neste item. Sem pontuação: a decisão é da RH.
      </span>
      <FilterChips options={OPCOES_PRIORIDADE.map((o) => o.rotulo)} value={OPCOES_PRIORIDADE.find((o) => o.valor === prioridade)?.rotulo ?? ""} onChange={(r) => setPrioridade(OPCOES_PRIORIDADE.find((o) => o.rotulo === r)!.valor)} />
      <h4 className={styles.secaoTitulo}>Direcionadores *</h4>
      <SeletorDirecionadores valor={direcionadores} onChange={setDirecionadores} />
      <label className={styles.campo}>
        Justificativa da prioridade{prioridade === "alta" ? " *" : ""}
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={2000} />
      </label>
      {(local || erro) && <Erro mensagem={local ?? erro ?? ""} />}
      <div className={styles.acoes}>
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar prioridade"}
        </Button>
      </div>
    </form>
  );
}
