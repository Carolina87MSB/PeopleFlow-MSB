import { useMemo, useState } from "react";
import { Layers, ListChecks, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import {
  gravar,
  listarGrupos,
  listarNecessidades,
  obterNecessidade,
  requisitosVigentesDoCargo,
  type CategoriaNecessidade,
  type FiltroNecessidades,
  type Necessidade,
  type OrigemNecessidade,
  type Prioridade,
  type StatusNecessidade,
} from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Paginacao, Selo } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import { CATEGORIA_NECESSIDADE, formatarData, PRIORIDADE, ROTULO_ORIGEM, STATUS_NECESSIDADE } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const FILTROS_STATUS: { rotulo: string; status: StatusNecessidade[] }[] = [
  { rotulo: "Em aberto", status: ["sugerida", "validada", "planejada"] },
  { rotulo: "Sugeridas", status: ["sugerida"] },
  { rotulo: "Validadas", status: ["validada"] },
  { rotulo: "Atendidas", status: ["atendida"] },
  { rotulo: "Canceladas", status: ["cancelada"] },
  { rotulo: "Todas", status: ["sugerida", "validada", "planejada", "atendida", "cancelada"] },
];

type Selecao = { modo: "novo" } | { modo: "existente"; item: Necessidade };

export function NecessidadesAba() {
  const { perfil, pessoas, pessoaPorId } = useDesenvolvimento();
  const { state } = usePortalStore();
  const ehRH = perfil === "RH";
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState(FILTROS_STATUS[0].rotulo);
  const [origem, setOrigem] = useState("");
  const [categoria, setCategoria] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [colaborador, setColaborador] = useState("");
  const [gestor, setGestor] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [grupo, setGrupo] = useState("");
  const filtro: FiltroNecessidades = {
    status: FILTROS_STATUS.find((f) => f.rotulo === filtroStatus)!.status,
    busca: termo,
    origem: (origem || null) as OrigemNecessidade | null,
    categoria: (categoria || null) as CategoriaNecessidade | null,
    prioridade: (prioridade || null) as Prioridade | null,
    colaboradorId: colaborador ? Number(colaborador) : null,
    gestorId: gestor ? Number(gestor) : null,
    departamento: departamento || null,
    grupoId: grupo ? Number(grupo) : null,
  };
  const lista = usePaginado((p) => listarNecessidades(p, filtro), [termo, filtroStatus, origem, categoria, prioridade, colaborador, gestor, departamento, grupo]);
  const grupos = useConsulta(() => (ehRH ? listarGrupos() : Promise.resolve([])), [ehRH]);
  const nomeGrupo = useMemo(() => new Map((grupos.dados ?? []).map((g) => [g.id, g.titulo])), [grupos.dados]);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [consolidando, setConsolidando] = useState(false);

  // Opções dos filtros a partir de dados já carregados (sem consultas extras).
  const departamentos = useMemo(() => [...new Set(pessoas.map((p) => p.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [pessoas]);
  const gestores = useMemo(() => {
    const nomes = new Set(state.colaboradores.filter((c) => !c.desligado).map((c) => c.gestor));
    return pessoas.filter((p) => nomes.has(p.nome));
  }, [state.colaboradores, pessoas]);

  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Base de Necessidades de Desenvolvimento</h3>
          <p className={styles.cardSubtitle}>
            {ehRH ? "Todas as necessidades registradas — insumo para a LNT 2027" : "Necessidades dos seus liderados e as que você registrou"}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setSelecao({ modo: "novo" })}>
          Registrar necessidade
        </Button>
      </div>

      <div className={styles.toolbar}>
        <form
          className={styles.filtros}
          onSubmit={(e) => {
            e.preventDefault();
            setTermo(busca);
          }}
        >
          <input className={styles.input} type="search" placeholder="Buscar na necessidade, justificativa ou sugestão" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca)} />
        </form>
        <FilterChips options={FILTROS_STATUS.map((f) => f.rotulo)} value={filtroStatus} onChange={setFiltroStatus} />
      </div>
      <div className={styles.filtros} style={{ marginBottom: 14 }}>
        <select className={styles.select} style={{ minWidth: 170 }} value={colaborador} onChange={(e) => setColaborador(e.target.value)} aria-label="Colaborador">
          <option value="">Todos os colaboradores</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {ehRH && (
          <>
            <select className={styles.select} style={{ minWidth: 150 }} value={departamento} onChange={(e) => setDepartamento(e.target.value)} aria-label="Departamento">
              <option value="">Todos os departamentos</option>
              {departamentos.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select className={styles.select} style={{ minWidth: 150 }} value={gestor} onChange={(e) => setGestor(e.target.value)} aria-label="Gestor">
              <option value="">Todos os gestores</option>
              {gestores.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </>
        )}
        <select className={styles.select} style={{ minWidth: 140 }} value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>
          {(Object.keys(ROTULO_ORIGEM) as OrigemNecessidade[]).map((o) => (
            <option key={o} value={o}>
              {ROTULO_ORIGEM[o]}
            </option>
          ))}
        </select>
        <select className={styles.select} style={{ minWidth: 140 }} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_NECESSIDADE[c]}
            </option>
          ))}
        </select>
        <select className={styles.select} style={{ minWidth: 120 }} value={prioridade} onChange={(e) => setPrioridade(e.target.value)} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>
          {(Object.keys(PRIORIDADE) as Prioridade[]).map((p) => (
            <option key={p} value={p}>
              {PRIORIDADE[p].rotulo}
            </option>
          ))}
        </select>
        {ehRH && (grupos.dados?.length ?? 0) > 0 && (
          <select className={styles.select} style={{ minWidth: 150 }} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo">
            <option value="">Todos os grupos</option>
            {(grupos.dados ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.titulo}
              </option>
            ))}
          </select>
        )}
      </div>

      {ehRH && marcadas.size > 0 && (
        <div className={styles.toolbar} style={{ background: "var(--color-surface-alt)", padding: "10px 12px", borderRadius: "var(--radius-md)" }}>
          <span className={styles.secundario}>
            {marcadas.size} necessidade{marcadas.size > 1 ? "s" : ""} selecionada{marcadas.size > 1 ? "s" : ""}
          </span>
          <div className={styles.acoes}>
            <Button variant="ghost" onClick={() => setMarcadas(new Set())}>
              Limpar seleção
            </Button>
            <Button variant="primary" icon={<Layers size={16} />} onClick={() => setConsolidando(true)}>
              Consolidar
            </Button>
          </div>
        </div>
      )}

      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.itens.length === 0 ? (
        <EstadoVazio icone={<ListChecks size={26} strokeWidth={1.6} />} titulo="Nenhuma necessidade registrada." />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  {ehRH && <th style={{ width: 32 }} />}
                  <th>Colaborador</th>
                  <th>Necessidade</th>
                  <th>Categoria</th>
                  <th>Origem</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  {ehRH && <th>Grupo</th>}
                </tr>
              </thead>
              <tbody>
                {lista.dados.itens.map((n) => (
                  <tr key={n.id} className={[styles.linhaClicavel, n.status === "cancelada" ? styles.linhaInativa : ""].join(" ")} onClick={() => setSelecao({ modo: "existente", item: n })}>
                    {ehRH && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Selecionar" checked={marcadas.has(n.id)} disabled={n.status === "cancelada"} onChange={() => alternar(n.id)} />
                      </td>
                    )}
                    <td>
                      {n.colaborador_id ? (pessoaPorId.get(n.colaborador_id)?.nome ?? `Colaborador #${n.colaborador_id}`) : n.cargo_nome}
                      {n.departamento && <div className={styles.secundario}>{n.departamento}</div>}
                    </td>
                    <td>
                      {n.descricao}
                      {n.sugestao_capacitacao && <div className={styles.secundario}>Sugestão: {n.sugestao_capacitacao}</div>}
                    </td>
                    <td className={styles.secundario}>{n.categoria ? CATEGORIA_NECESSIDADE[n.categoria] : "—"}</td>
                    <td className={styles.secundario}>{ROTULO_ORIGEM[n.origem]}</td>
                    <td>{n.prioridade ? <Selo tom={PRIORIDADE[n.prioridade].tom}>{PRIORIDADE[n.prioridade].rotulo}</Selo> : "—"}</td>
                    <td>
                      <Selo tom={STATUS_NECESSIDADE[n.status].tom}>{STATUS_NECESSIDADE[n.status].rotulo}</Selo>
                    </td>
                    {ehRH && <td className={styles.secundario}>{n.grupo_id ? (nomeGrupo.get(n.grupo_id) ?? `Grupo #${n.grupo_id}`) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={lista.pagina} total={lista.dados.total} onChange={lista.setPagina} />
        </>
      )}

      {selecao?.modo === "novo" && (
        <RegistrarNecessidadeDrawer
          onFechar={() => setSelecao(null)}
          onSalvo={(n) => {
            lista.recarregar();
            setSelecao({ modo: "existente", item: n });
          }}
        />
      )}
      {selecao?.modo === "existente" && (
        <NecessidadeDrawer
          key={selecao.item.id}
          item={selecao.item}
          nomeGrupo={selecao.item.grupo_id ? nomeGrupo.get(selecao.item.grupo_id) : undefined}
          onFechar={() => setSelecao(null)}
          onSalvo={(n) => {
            if (filtro.status.includes(n.status)) lista.atualizarItem((i) => i.id === n.id, n);
            else lista.recarregar();
            setSelecao({ modo: "existente", item: n });
          }}
        />
      )}
      {consolidando && (
        <ConsolidarDrawer
          ids={[...marcadas]}
          grupos={grupos.dados ?? []}
          onFechar={() => setConsolidando(false)}
          onConcluido={() => {
            setConsolidando(false);
            setMarcadas(new Set());
            grupos.recarregar();
            lista.recarregar();
          }}
        />
      )}
    </Card>
  );
}

function CamposNecessidade(props: {
  form: { descricao: string; categoria: string; prioridade: string; sugestao_capacitacao: string; observacao: string };
  set: (k: "descricao" | "categoria" | "prioridade" | "sugestao_capacitacao" | "observacao") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  const { form, set } = props;
  return (
    <>
      <label className={[styles.campo, styles.cheio].join(" ")}>
        Necessidade *
        <input value={form.descricao} onChange={set("descricao")} maxLength={500} required placeholder="Ex.: Aprofundar Excel para análise de indicadores" />
      </label>
      <label className={styles.campo}>
        Categoria *
        <select value={form.categoria} onChange={set("categoria")} required>
          <option value="">Selecione</option>
          {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_NECESSIDADE[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.campo}>
        Prioridade inicial
        <select value={form.prioridade} onChange={set("prioridade")}>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </label>
      <label className={[styles.campo, styles.cheio].join(" ")}>
        Sugestão de treinamento / capacitação
        <input value={form.sugestao_capacitacao} onChange={set("sugestao_capacitacao")} maxLength={500} placeholder="Opcional — se já souber" />
      </label>
      <label className={[styles.campo, styles.cheio].join(" ")}>
        Observação
        <textarea value={form.observacao} onChange={set("observacao")} maxLength={2000} />
      </label>
    </>
  );
}

function RegistrarNecessidadeDrawer({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (n: Necessidade) => void }) {
  const { perfil, pessoas, colaboradorId } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  // Gestor registra para os liderados (não para si mesmo).
  const opcoes = ehRH ? pessoas : pessoas.filter((p) => p.id !== colaboradorId);
  const [form, setForm] = useState({ colaborador_id: "", descricao: "", categoria: "", prioridade: "media", justificativa: "", sugestao_capacitacao: "", observacao: "", origem: "rh", requisito_id: "" });
  const colab = opcoes.find((p) => String(p.id) === form.colaborador_id);
  const requisitos = useConsulta(() => (ehRH && colab ? requisitosVigentesDoCargo(colab.cargo) : Promise.resolve([])), [ehRH, colab?.cargo]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Base de Necessidades" titulo="Registrar necessidade" sub={ehRH ? "Registrada pelo RH entra como Validada" : "Entra como Sugerida e é validada pelo RH"} />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            const salvo = await gravar<Necessidade>("necessidade_registrar", { ...form, requisito_id: form.requisito_id || null });
            flash("Necessidade registrada.");
            onSalvo((await obterNecessidade(salvo.id)) ?? salvo);
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <div className={styles.grid}>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            {ehRH ? "Colaborador *" : "Liderado *"}
            <select value={form.colaborador_id} onChange={set("colaborador_id")} required>
              <option value="">Selecione</option>
              {opcoes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.cargo}
                </option>
              ))}
            </select>
          </label>
          <CamposNecessidade form={form} set={set} />
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa *
            <textarea value={form.justificativa} onChange={set("justificativa")} maxLength={2000} required placeholder="Por que essa necessidade existe?" />
          </label>
          {ehRH && (
            <>
              <label className={styles.campo}>
                Origem
                <select value={form.origem} onChange={set("origem")} disabled={Boolean(form.requisito_id)}>
                  <option value="rh">RH</option>
                  <option value="operacional">Operacional</option>
                </select>
              </label>
              <label className={styles.campo}>
                Requisito vigente do cargo
                <select value={form.requisito_id} onChange={set("requisito_id")} disabled={!colab}>
                  <option value="">{colab ? ((requisitos.dados?.length ?? 0) ? "Nenhum" : "Nenhum requisito vigente") : "Selecione o colaborador"}</option>
                  {(requisitos.dados ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.descricao}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Registrar"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function NecessidadeDrawer({ item, nomeGrupo, onFechar, onSalvo }: { item: Necessidade; nomeGrupo?: string; onFechar: () => void; onSalvo: (n: Necessidade) => void }) {
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const { state } = usePortalStore();
  const { flash } = useToast();
  const navigate = useNavigate();
  const ehRH = perfil === "RH";
  const [form, setForm] = useState({
    descricao: item.descricao,
    categoria: item.categoria ?? "",
    prioridade: item.prioridade ?? "media",
    sugestao_capacitacao: item.sugestao_capacitacao,
    observacao: item.observacao,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const nome = (id: number | null) => (id ? (pessoaPorId.get(id)?.nome ?? `Colaborador #${id}`) : "—");

  // Referência do PDI de origem: lida dos dados do PDI que o PeopleFlow já carrega (somente leitura).
  const pdi = item.pdi_id ? state.pdi.find((p) => p.id === item.pdi_id) : undefined;
  const pdiItem = pdi?.itens.find((i) => i.id === item.pdi_item_id);
  const pdiAcao = pdiItem?.acoes.find((a) => a.id === item.pdi_acao_id);

  async function executar(fn: () => Promise<unknown>, msg: string) {
    setErro(null);
    setSalvando(true);
    try {
      await fn();
      flash(msg);
      const atual = await obterNecessidade(item.id);
      if (atual) onSalvo(atual);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Necessidade de desenvolvimento" titulo={item.descricao} sub={nome(item.colaborador_id)} />}>
      <div className={styles.secao}>
        <dl className={styles.detalhe}>
          <dt>Status</dt>
          <dd>
            <Selo tom={STATUS_NECESSIDADE[item.status].tom}>{STATUS_NECESSIDADE[item.status].rotulo}</Selo>
          </dd>
          <dt>Origem</dt>
          <dd>{ROTULO_ORIGEM[item.origem]}</dd>
          <dt>Departamento</dt>
          <dd>{item.departamento ?? "—"}</dd>
          <dt>Gestor</dt>
          <dd>{nome(item.gestor_colaborador_id)}</dd>
          <dt>Registrada por</dt>
          <dd>
            {nome(item.solicitado_por_colaborador_id)} · {formatarData(item.created_at)}
          </dd>
          {item.justificativa && (
            <>
              <dt>Justificativa</dt>
              <dd>{item.justificativa}</dd>
            </>
          )}
          {item.status_motivo && (
            <>
              <dt>Motivo do status</dt>
              <dd>{item.status_motivo}</dd>
            </>
          )}
          {ehRH && (
            <>
              <dt>Grupo</dt>
              <dd>{item.grupo_id ? (nomeGrupo ?? `Grupo #${item.grupo_id}`) : "Não consolidada"}</dd>
            </>
          )}
        </dl>
      </div>

      {item.origem === "pdi" && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>PDI de origem</h4>
          {pdi ? (
            <dl className={styles.detalhe}>
              <dt>Ciclo</dt>
              <dd>{pdi.ciclo}</dd>
              <dt>{pdiItem?.tipoCompetencia === "Tecnica" ? "KPI" : "Competência"}</dt>
              <dd>{pdiItem?.competenciaNome ?? item.pdi_item_nome ?? "—"}</dd>
              <dt>Ação no PDI</dt>
              <dd>{pdiAcao ? `${pdiAcao.descricao} (${pdiAcao.status}${pdiAcao.prazo ? `, prazo ${formatarData(pdiAcao.prazo)}` : ""})` : "Ação não encontrada no PDI atual"}</dd>
              <dt>Gestor do PDI</dt>
              <dd>{pdi.gestorResponsavel}</dd>
            </dl>
          ) : (
            <span className={styles.dica}>PDI #{item.pdi_id} não está entre os PDIs visíveis para você.</span>
          )}
          <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
            <Button variant="secondary" onClick={() => navigate("/desempenho/pdi")}>
              Abrir PDIs
            </Button>
          </div>
        </div>
      )}

      {ehRH && item.status !== "cancelada" ? (
        <form
          className={styles.secao}
          onSubmit={(e) => {
            e.preventDefault();
            void executar(() => gravar("necessidade_editar", { id: item.id, ...form }), "Necessidade atualizada.").catch(() => undefined);
          }}
        >
          <h4 className={styles.secaoTitulo}>Classificação</h4>
          <div className={styles.grid}>
            <CamposNecessidade form={form} set={set} />
          </div>
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button type="submit" variant="primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.secao}>
          <dl className={styles.detalhe}>
            <dt>Categoria</dt>
            <dd>{item.categoria ? CATEGORIA_NECESSIDADE[item.categoria] : "—"}</dd>
            <dt>Prioridade</dt>
            <dd>{item.prioridade ? PRIORIDADE[item.prioridade].rotulo : "—"}</dd>
            {item.sugestao_capacitacao && (
              <>
                <dt>Sugestão</dt>
                <dd>{item.sugestao_capacitacao}</dd>
              </>
            )}
            {item.observacao && (
              <>
                <dt>Observação</dt>
                <dd>{item.observacao}</dd>
              </>
            )}
          </dl>
          {erro && <Erro mensagem={erro} />}
        </div>
      )}

      {ehRH && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Situação</h4>
          <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
            {item.status === "sugerida" && (
              <ConfirmarComMotivo
                rotulo="Validar"
                confirmar="Validar"
                variante="success"
                motivoObrigatorio={false}
                onConfirmar={(motivo) => executar(() => gravar("necessidade_status", { id: item.id, status: "validada", motivo }), "Necessidade validada.")}
              />
            )}
            {(item.status === "sugerida" || item.status === "validada") && (
              <ConfirmarComMotivo
                rotulo="Cancelar / rejeitar"
                confirmar="Confirmar"
                variante="danger"
                motivoObrigatorio
                onConfirmar={(motivo) => executar(() => gravar("necessidade_status", { id: item.id, status: "cancelada", motivo }), "Necessidade cancelada.")}
              />
            )}
            {item.status === "cancelada" && (
              <ConfirmarComMotivo
                rotulo="Reabrir"
                confirmar="Reabrir"
                variante="secondary"
                motivoObrigatorio={false}
                onConfirmar={(motivo) => executar(() => gravar("necessidade_status", { id: item.id, status: "sugerida", motivo }), "Necessidade reaberta.")}
              />
            )}
            {item.grupo_id && (
              <Button variant="ghost" disabled={salvando} onClick={() => void executar(() => gravar("necessidade_desagrupar", { id: item.id }), "Retirada do grupo.").catch(() => undefined)}>
                Retirar do grupo
              </Button>
            )}
          </div>
          <span className={styles.dica}>Planejada e Atendida passam a ser definidas automaticamente quando houver treinamento vinculado.</span>
        </div>
      )}
    </Drawer>
  );
}

function ConsolidarDrawer({ ids, grupos, onFechar, onConcluido }: { ids: number[]; grupos: { id: number; titulo: string }[]; onFechar: () => void; onConcluido: () => void }) {
  const { flash } = useToast();
  const [modo, setModo] = useState<"existente" | "novo">(grupos.length ? "existente" : "novo");
  const [grupoId, setGrupoId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Consolidação" titulo={`Consolidar ${ids.length} necessidade${ids.length > 1 ? "s" : ""}`} sub="Cada necessidade individual é preservada" />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            const r = await gravar<{ consolidadas: number; ignoradas: number }>(
              "necessidade_consolidar",
              modo === "existente" ? { ids, grupo_id: grupoId } : { ids, titulo, categoria: categoria || null },
            );
            flash(`${r.consolidadas} consolidada(s)${r.ignoradas ? `, ${r.ignoradas} ignorada(s)` : ""}.`);
            onConcluido();
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        {grupos.length > 0 && <FilterChips options={["Grupo existente", "Novo grupo"]} value={modo === "existente" ? "Grupo existente" : "Novo grupo"} onChange={(v) => setModo(v === "Novo grupo" ? "novo" : "existente")} />}
        <div className={styles.grid}>
          {modo === "existente" ? (
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Grupo *
              <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} required>
                <option value="">Selecione</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.titulo}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Título do grupo *
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required placeholder="Ex.: Excel intermediário" />
              </label>
              <label className={[styles.campo, styles.cheio].join(" ")}>
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
            </>
          )}
        </div>
        <span className={styles.dica}>O grupo reúne necessidades semelhantes para a futura LNT, mantendo colaborador, origem, gestor, justificativa, PDI e departamento de cada uma.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Consolidar"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
