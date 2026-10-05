import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Award, ClipboardCheck, ListPlus, Plus, UserRound } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Button, Card, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import {
  conformidadeDoColaborador,
  gravar,
  historicoDoColaborador,
  listarGaps,
  listarRequisitosDoCargo,
  titulosListaMestra,
  type LinhaConformidade,
  type Treinamento,
} from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Abas, Carregando, Erro, EstadoVazio, Paginacao, Selo, type AbaDef } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import { formatarCarga, formatarData, SITUACAO, SITUACAO_PARTICIPACAO } from "./rotulos";
import { RequisitosCargoAba } from "./RequisitosCargoAba";
import { CatalogoAba } from "./CatalogoAba";
import { TreinamentoDrawer } from "./TreinamentoForm";
import { RegistrarNecessidadeDrawer } from "./NecessidadesAba";
import { FILTROS_GAP, filtrarPessoas, tipoSugeridoParaGap, TODOS, valoresUnicos } from "./filtrosRequisitos";
import styles from "./Desenvolvimento.module.css";

type AbaHabilidades = "gaps" | "cargo" | "colaborador" | "catalogo";

const AJUDA: Record<AbaHabilidades, string> = {
  gaps: "Mostra requisitos do cargo que estão pendentes, vencidos, próximos do vencimento ou que exigem novo treinamento por revisão de documento.",
  cargo: "Mostra as habilidades e requisitos exigidos para cada cargo e permite acompanhar sua estruturação e validação.",
  colaborador: "Mostra a situação de cada colaborador em relação às habilidades e requisitos aplicáveis ao seu cargo.",
  catalogo: "Catálogos oficiais: habilidades técnicas utilizadas nos requisitos dos cargos e competências comportamentais utilizadas nas Descrições de Cargo.",
};

export default function HabilidadesPage() {
  const { perfil } = useDesenvolvimento();
  const { aba } = useParams<{ aba?: string }>();
  const abas: AbaDef<AbaHabilidades>[] = [
    { id: "gaps", rotulo: "Gaps", ajuda: AJUDA.gaps },
    { id: "cargo", rotulo: "Por cargo", ajuda: AJUDA.cargo },
    { id: "colaborador", rotulo: "Por colaborador", ajuda: AJUDA.colaborador },
    ...(perfil === "RH" ? [{ id: "catalogo" as const, rotulo: "Catálogo", ajuda: AJUDA.catalogo }] : []),
  ];
  const atual = abas.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/habilidades/gaps" replace />;

  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/habilidades" abas={abas} atual={atual} />
      {atual === "gaps" && <GapsAba />}
      {atual === "cargo" && <RequisitosCargoAba />}
      {atual === "colaborador" && <PorColaboradorAba />}
      {atual === "catalogo" && <CatalogoAba />}
    </>
  );
}

type LinhaComTitulo = LinhaConformidade & { titulo: string };

async function comTitulos(linhas: LinhaConformidade[]): Promise<LinhaComTitulo[]> {
  const titulos = await titulosListaMestra(linhas.map((l) => l.lista_mestra_codigo));
  return linhas.map((l) => ({ ...l, titulo: titulos.get(l.lista_mestra_codigo) ?? "" }));
}

/** Revisão exigida × revisão treinada, validade — o que ajuda a entender a situação. */
function DetalheSituacao({ l }: { l: LinhaConformidade }) {
  const partes = [
    l.revisao_atual ? `Rev. exigida ${l.revisao_atual}` : null,
    l.revisao_realizada ? `treinada na rev. ${l.revisao_realizada}` : l.ultima_realizacao ? null : "nunca treinado",
    l.ultima_realizacao ? `última realização ${formatarData(l.ultima_realizacao)}` : null,
    l.validade_ate ? `validade ${formatarData(l.validade_ate)}` : null,
  ].filter(Boolean);
  return <div className={styles.secundario}>{partes.join(" · ")}</div>;
}

function Filtros(props: {
  departamento: string;
  setDepartamento: (v: string) => void;
  cargo: string;
  setCargo: (v: string) => void;
  busca: string;
  setBusca: (v: string) => void;
  onBuscar?: () => void;
  placeholder: string;
}) {
  const { pessoas } = useDesenvolvimento();
  const departamentos = useMemo(() => valoresUnicos(pessoas, "departamento"), [pessoas]);
  const cargos = useMemo(() => valoresUnicos(pessoas, "cargo"), [pessoas]);
  return (
    <form
      className={styles.filtros}
      onSubmit={(e) => {
        e.preventDefault();
        props.onBuscar?.();
      }}
    >
      <input className={styles.input} type="search" placeholder={props.placeholder} value={props.busca} onChange={(e) => props.setBusca(e.target.value)} onBlur={() => props.onBuscar?.()} />
      <select className={styles.select} value={props.departamento} onChange={(e) => props.setDepartamento(e.target.value)} aria-label="Departamento/Setor">
        <option value={TODOS}>Todos os departamentos</option>
        {departamentos.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <select className={styles.select} value={props.cargo} onChange={(e) => props.setCargo(e.target.value)} aria-label="Cargo">
        <option value={TODOS}>Todos os cargos</option>
        {cargos.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </form>
  );
}

// ── Gaps: exceções (o que precisa de atenção) ─────────────────────────
function GapsAba() {
  const { perfil, pessoas, pessoaPorId, podeRegistrar } = useDesenvolvimento();
  const navigate = useNavigate();
  const { flash } = useToast();
  const [filtro, setFiltro] = useState(FILTROS_GAP[0].rotulo);
  const [departamento, setDepartamento] = useState(TODOS);
  const [cargo, setCargo] = useState(TODOS);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [registrar, setRegistrar] = useState<LinhaComTitulo | null>(null);
  const [necessidade, setNecessidade] = useState<LinhaComTitulo | null>(null);
  const situacoes = FILTROS_GAP.find((f) => f.rotulo === filtro)!.situacoes;
  const porEscopo = useMemo(() => filtrarPessoas(pessoas, { departamento, cargo: TODOS, busca: "" }), [pessoas, departamento]);
  const idsPorNome = useMemo(() => (termo.trim() ? filtrarPessoas(pessoas, { departamento: TODOS, cargo: TODOS, busca: termo }).map((p) => p.id) : []), [pessoas, termo]);
  const lista = usePaginado(
    async (p) => {
      const r = await listarGaps(p, { situacoes, colaboradorIds: departamento === TODOS ? null : porEscopo.map((x) => x.id), cargo: cargo || null, busca: termo, idsPorNome });
      return { total: r.total, itens: await comTitulos(r.itens) };
    },
    [filtro, departamento, cargo, termo],
  );
  const podeNecessidade = perfil === "RH" || perfil === "Gestor";

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Gaps de requisitos</h3>
          <p className={styles.cardSubtitle}>
            Diferenças entre os requisitos vigentes dos cargos e a situação atual dos colaboradores{perfil === "RH" ? "." : " da sua equipe."}
          </p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <Filtros
          departamento={departamento}
          setDepartamento={setDepartamento}
          cargo={cargo}
          setCargo={setCargo}
          busca={busca}
          setBusca={setBusca}
          onBuscar={() => setTermo(busca)}
          placeholder="Buscar colaborador ou requisito"
        />
        <FilterChips options={FILTROS_GAP.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
      </div>
      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.itens.length === 0 ? (
        <EstadoVazio
          icone={<ClipboardCheck size={26} strokeWidth={1.6} />}
          titulo="Nenhum gap encontrado."
          descricao="Os gaps aparecem quando há requisitos VIGENTES (validados pelo RH) para os cargos."
        />
      ) : (
        <>
          <div>
            {lista.dados.itens.map((g) => {
              const pessoa = pessoaPorId.get(g.colaborador_id);
              return (
                <div key={`${g.colaborador_id}-${g.requisito_id}`} className={styles.linhaReq}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{pessoa?.nome ?? `Colaborador #${g.colaborador_id}`}</strong>
                    <div className={styles.secundario}>
                      {g.cargo_nome}
                      {pessoa?.departamento ? ` · ${pessoa.departamento}` : ""}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {g.lista_mestra_codigo}
                    {g.titulo && <span className={styles.secundario}> · {g.titulo}</span>}
                    <div className={styles.secundario}>Treinamento / documento controlado</div>
                    <DetalheSituacao l={g} />
                  </div>
                  <div className={styles.linhaReqAcoes}>
                    <Selo tom={SITUACAO[g.situacao].tom}>{SITUACAO[g.situacao].rotulo}</Selo>
                    {podeRegistrar && g.situacao !== "agendado" && (
                      <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setRegistrar(g)}>
                        Registrar treinamento
                      </Button>
                    )}
                    {podeNecessidade && (
                      <Button variant="ghost" className={styles.botaoLongo} icon={<ListPlus size={15} />} onClick={() => setNecessidade(g)}>
                        Criar Necessidade de Desenvolvimento
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Paginacao pagina={lista.pagina} total={lista.dados.total} onChange={lista.setPagina} />
        </>
      )}
      {registrar && (
        <TreinamentoDrawer
          item={null}
          inicial={{ lista_mestra_codigo: registrar.lista_mestra_codigo, tipo: tipoSugeridoParaGap(registrar.situacao, registrar.lista_mestra_codigo) }}
          onFechar={() => setRegistrar(null)}
          onSalvo={async (t: Treinamento) => {
            // O colaborador do gap já entra na turma; a seleção abre para incluir outros.
            try {
              await gravar("participantes_adicionar", { treinamento_id: t.id, colaborador_ids: [registrar.colaborador_id] });
            } catch {
              flash("Treinamento registrado; inclua o participante na próxima tela.");
            }
            navigate(`/desenvolvimento/treinamento/${t.id}?participantes=1`);
          }}
        />
      )}
      {necessidade && (
        <RegistrarNecessidadeDrawer
          inicial={{
            colaborador_id: String(necessidade.colaborador_id),
            descricao: `${necessidade.lista_mestra_codigo}${necessidade.titulo ? ` — ${necessidade.titulo}` : ""} (${SITUACAO[necessidade.situacao].rotulo.toLowerCase()})`,
            requisito_id: perfil === "RH" ? String(necessidade.requisito_id) : "",
          }}
          onFechar={() => setNecessidade(null)}
          onSalvo={() => {
            setNecessidade(null);
            flash("Necessidade de Desenvolvimento registrada a partir do gap.");
          }}
        />
      )}
    </Card>
  );
}

// ── Por colaborador: situação completa (inclusive o que está atendido) ──
function PorColaboradorAba() {
  const { pessoas } = useDesenvolvimento();
  const [departamento, setDepartamento] = useState(TODOS);
  const [cargo, setCargo] = useState(TODOS);
  const [busca, setBusca] = useState("");
  const [id, setId] = useState<number | null>(null);
  const opcoes = useMemo(() => filtrarPessoas(pessoas, { departamento, cargo, busca }), [pessoas, departamento, cargo, busca]);
  const selecionado = pessoas.find((p) => p.id === id) ?? null;
  const conformidade = useConsulta(async () => (selecionado ? comTitulos(await conformidadeDoColaborador(selecionado.id)) : []), [selecionado?.id]);
  const habilidades = useConsulta(
    async () => (selecionado ? (await listarRequisitosDoCargo(selecionado.cargo, ["vigente"])).filter((r) => r.tipo_requisito === "habilidade") : []),
    [selecionado?.cargo],
  );
  const historico = useConsulta(() => (selecionado ? historicoDoColaborador(selecionado.id) : Promise.resolve([])), [selecionado?.id]);
  const atendidos = (conformidade.dados ?? []).filter((c) => c.situacao === "em_dia").length;

  return (
    <div className={styles.pilha}>
      <Card>
        <div className={styles.cardHeader} style={{ marginBottom: 8 }}>
          <div>
            <h3 className={styles.cardTitle}>{selecionado ? selecionado.nome : "Situação do colaborador"}</h3>
            <p className={styles.cardSubtitle}>
              {selecionado ? `${selecionado.cargo} · ${selecionado.departamento}` : "Habilidades e requisitos aplicáveis ao cargo — inclusive os já atendidos"}
            </p>
          </div>
        </div>
        <Filtros departamento={departamento} setDepartamento={setDepartamento} cargo={cargo} setCargo={setCargo} busca={busca} setBusca={setBusca} placeholder="Buscar colaborador" />
        <div className={styles.filtros} style={{ marginTop: 10 }}>
          <select className={styles.select} style={{ flex: "1 1 260px" }} value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)} aria-label="Colaborador">
            <option value="">{opcoes.length ? `Selecione um colaborador (${opcoes.length})` : "Nenhum colaborador com esses filtros"}</option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {p.cargo}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!selecionado ? (
        <Card>
          <EstadoVazio icone={<UserRound size={26} strokeWidth={1.6} />} titulo="Selecione um colaborador para ver a situação." />
        </Card>
      ) : (
        <>
          <Card>
            <h3 className={styles.cardTitle}>Requisitos obrigatórios / documentais</h3>
            <p className={styles.cardSubtitle}>
              {conformidade.dados ? `${atendidos} de ${conformidade.dados.length} atendido${atendidos === 1 ? "" : "s"}` : ""}
            </p>
            {conformidade.erro ? (
              <Erro mensagem={conformidade.erro} />
            ) : conformidade.carregando || !conformidade.dados ? (
              <Carregando />
            ) : conformidade.dados.length === 0 ? (
              <EstadoVazio icone={<ClipboardCheck size={24} strokeWidth={1.6} />} titulo="Nenhum requisito vigente para este cargo." />
            ) : (
              conformidade.dados.map((c) => (
                <div key={c.requisito_id} className={styles.linhaReq}>
                  <div style={{ minWidth: 0 }}>
                    {c.lista_mestra_codigo}
                    {c.titulo && <span className={styles.secundario}> · {c.titulo}</span>}
                    <div className={styles.secundario}>Treinamento / documento controlado</div>
                  </div>
                  <DetalheSituacao l={c} />
                  <div className={styles.linhaReqAcoes}>
                    <Selo tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Selo>
                  </div>
                </div>
              ))
            )}
          </Card>
          <Card>
            <h3 className={styles.cardTitle}>Habilidades técnicas do cargo</h3>
            <p className={styles.cardSubtitle}>A avaliação de domínio (níveis) será definida em etapa posterior.</p>
            {habilidades.erro ? (
              <Erro mensagem={habilidades.erro} />
            ) : habilidades.carregando || !habilidades.dados ? (
              <Carregando />
            ) : habilidades.dados.length === 0 ? (
              <p className={styles.secundario}>Nenhuma habilidade técnica vigente para este cargo.</p>
            ) : (
              habilidades.dados.map((h) => (
                <div key={h.id} className={styles.linhaReq}>
                  <div style={{ minWidth: 0 }}>
                    {h.habilidade?.nome ?? h.descricao_sugerida}
                    <div className={styles.secundario}>Habilidade técnica{h.obrigatorio ? " · obrigatória" : ""}</div>
                  </div>
                  <div className={styles.secundario}>Sem avaliação registrada</div>
                  <div className={styles.linhaReqAcoes}>
                    <Selo tom="neutral">Não avaliada</Selo>
                  </div>
                </div>
              ))
            )}
          </Card>
          <Card>
            <h3 className={styles.cardTitle}>Histórico de treinamentos</h3>
            <div style={{ marginTop: 14 }}>
              {historico.erro ? (
                <Erro mensagem={historico.erro} />
              ) : historico.carregando || !historico.dados ? (
                <Carregando />
              ) : historico.dados.length === 0 ? (
                <EstadoVazio icone={<Award size={24} strokeWidth={1.6} />} titulo="Nenhum treinamento registrado." />
              ) : (
                <div className={tableStyles.wrap}>
                  <table className={tableStyles.table}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Treinamento</th>
                        <th>Carga</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.dados.map((h) => (
                        <tr key={h.participante_id}>
                          <td className={styles.mono}>{formatarData(h.data_referencia)}</td>
                          <td>
                            {h.titulo}
                            {h.lista_mestra_codigo && (
                              <span className={styles.secundario}>
                                {" "}
                                · {h.lista_mestra_codigo}
                                {h.lista_mestra_revisao ? ` rev. ${h.lista_mestra_revisao}` : ""}
                              </span>
                            )}
                          </td>
                          <td className={styles.mono}>{formatarCarga(h.carga_horaria_min)}</td>
                          <td>
                            <Selo tom={SITUACAO_PARTICIPACAO[h.situacao].tom}>
                              {SITUACAO_PARTICIPACAO[h.situacao].rotulo}
                              {h.situacao === "realizado_reposicao" && h.reposicao_numero ? ` ${h.reposicao_numero}` : ""}
                            </Selo>
                            {h.reposto_em_treinamento_id && <div className={styles.secundario}>Realizado depois em reposição</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
