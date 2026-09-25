import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, FileText, Laptop, Link2, MapPin, Pencil, Plus, QrCode, SearchX, Upload, UserRound, Users } from "lucide-react";
import qrcode from "qrcode-generator";
import { Header } from "../../components/layout/Header";
import { Button, Card, Drawer, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import {
  enviarEvidencia,
  gravar,
  listarEvidencias,
  listarNecessidades,
  listarParticipantes,
  listarReposicoes,
  listarVinculos,
  obterTreinamento,
  opcoesParticipantes,
  pessoasPorId,
  type AcaoGravacao,
  type Participante,
  type ResultadoEficacia,
  type TipoEvidencia,
  type Treinamento,
} from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Paginacao, Selo, TagTeste } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import {
  CATEGORIA_NECESSIDADE,
  EFICACIA,
  formatarCarga,
  formatarData,
  FORMATO,
  METODO_PRESENCA,
  MODALIDADE,
  TIPO_TREINAMENTO,
  PRESENCA,
  PRIORIDADE,
  STATUS_NECESSIDADE,
  STATUS_TREINAMENTO,
  TIPO_EVIDENCIA,
} from "./rotulos";
import { TreinamentoDrawer } from "./TreinamentoForm";
import { alternar as alternarSelecao, departamentosDe, desmarcarTodos, filtrarOpcoes, selecionarTodos, TODOS_DEPARTAMENTOS } from "./selecaoParticipantes";
import styles from "./Desenvolvimento.module.css";

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function mensagem(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Permissões exibidas na tela — espelho das regras do servidor, que sempre confere de novo. */
function permissoes(t: Treinamento, perfil: string, colaboradorId: number) {
  const ehRH = perfil === "RH";
  const conduz = t.responsavel_colaborador_id === colaboradorId || t.instrutor_colaborador_id === colaboradorId;
  const solicitante = t.solicitado_por_colaborador_id === colaboradorId;
  const encerrado = t.status === "concluido" || t.status === "cancelado";
  const externo = t.modalidade === "externo";
  return {
    ehRH,
    conduz,
    podeEditar: t.status !== "cancelado" && (ehRH || (t.status === "solicitado" && solicitante)),
    // Montar a turma: RH, quem conduz ou quem solicitou (qualquer colaborador ativo, de qualquer área).
    podeParticipantes: !encerrado && (ehRH || conduz || solicitante),
    podeCancelar: !encerrado && (ehRH || (t.status === "solicitado" && solicitante)),
    podePresenca: ((ehRH || conduz) && (t.status === "em_andamento" || (externo && t.status === "planejado"))) || (ehRH && t.status === "concluido"),
    podeRealizacao: (ehRH || conduz) && (t.status === "planejado" || t.status === "em_andamento"),
    podeQr: (ehRH || conduz) && !externo && t.status === "em_andamento",
    podeRepor: (ehRH || conduz) && t.status === "concluido",
    podeAnexar: (ehRH || conduz) && t.status !== "cancelado" && (t.status !== "concluido" || ehRH),
    veNecessidades: ehRH || perfil === "Gestor",
  };
}

export default function TreinamentoPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  const { perfil, colaboradorId } = useDesenvolvimento();
  const navigate = useNavigate();
  const { flash } = useToast();
  const treino = useConsulta(() => obterTreinamento(tid), [tid]);
  const participantes = useConsulta(() => listarParticipantes(tid), [tid]);
  const t = treino.dados;
  const pessoasDoTreino = useConsulta(
    () => (t ? pessoasPorId([t.responsavel_colaborador_id, t.instrutor_colaborador_id, t.solicitado_por_colaborador_id].filter((x): x is number => x != null)) : Promise.resolve(new Map())),
    [t?.responsavel_colaborador_id, t?.instrutor_colaborador_id, t?.solicitado_por_colaborador_id],
  );
  const [editando, setEditando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [versaoVinculos, setVersaoVinculos] = useState(0);
  // Vindo de "Salvar como planejado"/"Registrar solicitação": abre a seleção de participantes como próximo passo.
  const [searchParams, setSearchParams] = useSearchParams();
  const [abrirInclusao] = useState(() => searchParams.get("participantes") === "1");
  useEffect(() => {
    if (searchParams.has("participantes")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!Number.isInteger(tid) || tid <= 0) return <SemTreinamento />;
  if (treino.erro) return <Erro mensagem={treino.erro} />;
  if (treino.carregando && !t) {
    return (
      <>
        <Header />
        <Card>
          <Carregando />
        </Card>
      </>
    );
  }
  if (!t) return <SemTreinamento />;

  const p = permissoes(t, perfil, colaboradorId);
  const nome = (cid: number | null) => (cid ? (pessoasDoTreino.dados?.get(cid)?.nome ?? `#${cid}`) : "—");
  const ativos = (participantes.dados ?? []).filter((x) => !x.removido_em);

  const recarregarTudo = () => {
    treino.recarregar();
    participantes.recarregar();
    setVersaoVinculos((v) => v + 1);
  };

  async function acao(nomeAcao: AcaoGravacao, corpo: Record<string, unknown>, ok: string) {
    setErroAcao(null);
    try {
      await gravar(nomeAcao, corpo);
      flash(ok);
      recarregarTudo();
    } catch (e) {
      setErroAcao(mensagem(e));
      throw e;
    }
  }

  const ausentes = ativos.filter((x) => x.presenca_status === "ausente").length;
  const presentes = ativos.filter((x) => x.presenca_status === "presente").length;
  const externoPlanejado = t.modalidade === "externo" && t.status === "planejado";
  const instrutor = t.instrutor_colaborador_id ? nome(t.instrutor_colaborador_id) : t.instrutor_externo;

  // Seções na ordem do que precisa ser feito AGORA, conforme o status.
  const secoes: Record<string, React.ReactNode> = {
    qr: p.podeQr ? <QrPresenca key="qr" t={t} onAtualizarLista={participantes.recarregar} /> : null,
    participantes: (
      <Participantes
        key="participantes"
        t={t}
        p={p}
        lista={participantes.dados}
        erro={participantes.erro}
        carregando={participantes.carregando}
        acao={acao}
        abrirInclusao={abrirInclusao}
      />
    ),
    resultado:
      t.status === "concluido" ? (
        <Card key="resultado">
          <h3 className={styles.cardTitle}>Resultado</h3>
          <ul className={styles.resumo} style={{ marginTop: 10 }}>
            <li>
              <CalendarDays size={15} /> Realizado em {formatarData(t.data_realizacao ?? t.data_fim ?? t.data_inicio)}
            </li>
            <li>
              <Clock size={15} /> {formatarCarga(t.carga_realizada_min ?? t.carga_horaria_min)}
            </li>
            <li>
              <Users size={15} /> {presentes} presente{presentes === 1 ? "" : "s"} · {ausentes} ausente{ausentes === 1 ? "" : "s"}
            </li>
          </ul>
        </Card>
      ) : null,
    reposicoes: <Reposicoes key="reposicoes" t={t} podeRepor={p.podeRepor} ausentes={ausentes} />,
    evidencias: <Evidencias key="evidencias" t={t} podeAnexar={p.podeAnexar} participantes={ativos} versao={versaoVinculos} />,
    necessidades: !p.veNecessidades ? null : t.homologacao ? (
      <Card key="necessidades">
        <h3 className={styles.cardTitle}>
          Necessidades de Desenvolvimento relacionadas <TagTeste />
        </h3>
        <p className={styles.secundario}>Treinamento de homologação/teste não é vinculado a Necessidades de Desenvolvimento.</p>
      </Card>
    ) : (
      <NecessidadesVinculadas key="necessidades" t={t} podeEditar={p.ehRH && t.status !== "concluido" && t.status !== "cancelado"} versao={versaoVinculos} onAlterado={recarregarTudo} />
    ),
  };
  const ordem =
    t.status === "em_andamento"
      ? ["qr", "participantes", "evidencias", "necessidades"]
      : t.status === "concluido"
        ? ["resultado", "reposicoes", "participantes", "evidencias", "necessidades"]
        : ["participantes", "evidencias", "necessidades"];

  return (
    <>
      <Header />
      <div className={styles.pilhaCompacta}>
        <div>
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate(`/desenvolvimento/treinamentos/${t.status === "concluido" || t.status === "cancelado" ? "concluidos" : "agenda"}`)}>
            Treinamentos
          </Button>
        </div>

        {/* ── Resumo compacto + ação principal ─────────────────────────── */}
        <Card>
          <div className={styles.resumoTopo}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.drawerEyebrow}>
                {t.codigo} · {TIPO_TREINAMENTO[t.tipo]}
                {t.reposicao_numero ? ` · Reposição ${t.reposicao_numero}` : ""}
              </div>
              <h3 className={styles.cardTitle}>
                {t.titulo}
                {t.homologacao && <TagTeste />}
              </h3>
              <div style={{ marginTop: 6 }}>
                <Selo tom={STATUS_TREINAMENTO[t.status].tom}>{STATUS_TREINAMENTO[t.status].rotulo}</Selo>
                {t.status_motivo && t.status === "cancelado" ? <span className={styles.secundario}> — {t.status_motivo}</span> : null}
              </div>
            </div>
            {p.podeEditar && (
              <Button variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditando(true)}>
                {t.status === "concluido" ? "Retificar" : "Editar"}
              </Button>
            )}
          </div>
          {t.homologacao && <p className={styles.dica}>Homologação/teste: fluxo real, sem validade como capacitação oficial, conformidade, indicadores ou Necessidades de Desenvolvimento.</p>}
          <ul className={styles.resumo}>
            <li>
              <CalendarDays size={15} /> {formatarData(t.data_inicio)}
              {t.data_fim && t.data_fim !== t.data_inicio ? ` a ${formatarData(t.data_fim)}` : ""}
            </li>
            <li>
              <Clock size={15} /> {formatarCarga(t.carga_horaria_min)}
            </li>
            <li>
              <Laptop size={15} /> {MODALIDADE[t.modalidade]}
              {t.formato ? ` · ${FORMATO[t.formato]}` : ""}
            </li>
            {t.local_link && (
              <li>
                <MapPin size={15} /> {t.local_link}
              </li>
            )}
            <li>
              <UserRound size={15} /> {nome(t.responsavel_colaborador_id)}
              {instrutor && instrutor !== nome(t.responsavel_colaborador_id) ? ` · Instrutor: ${instrutor}` : ""}
            </li>
            {t.lista_mestra_codigo && (
              <li>
                <FileText size={15} /> {t.lista_mestra_codigo} · Rev. {t.lista_mestra_revisao}
              </li>
            )}
          </ul>

          {(t.status === "em_andamento" || externoPlanejado) && (
            <RealizacaoResumo t={t} podeAlterar={p.podeRealizacao} onSalvar={(corpo) => acao("treinamento_realizacao", { id: t.id, ...corpo }, "Dados da realização atualizados.")} />
          )}

          {erroAcao && <Erro mensagem={erroAcao} />}
          <div className={styles.acoesResumo}>
            {p.ehRH && t.status === "solicitado" && (
              <Button variant="primary" onClick={() => void acao("treinamento_planejar", { id: t.id }, "Treinamento planejado.").catch(() => undefined)}>
                Planejar
              </Button>
            )}
            {(p.ehRH || p.conduz) && t.status === "planejado" && (
              <Button variant="primary" onClick={() => void acao("treinamento_iniciar", { id: t.id }, "Treinamento iniciado.").catch(() => undefined)}>
                Iniciar realização
              </Button>
            )}
            {p.ehRH && (t.status === "em_andamento" || externoPlanejado) && (
              <Button variant="success" onClick={() => void acao("treinamento_concluir", { id: t.id }, "Treinamento concluído.").catch(() => undefined)}>
                Concluir treinamento
              </Button>
            )}
          </div>

          <details className={styles.maisDetalhes}>
            <summary>Mais detalhes</summary>
            <dl className={styles.detalhe}>
              {t.lista_mestra_codigo && (
                <>
                  <dt>Documento</dt>
                  <dd>
                    {t.lista_mestra_codigo} rev. {t.lista_mestra_revisao} — {t.lista_mestra_titulo ?? ""}
                  </dd>
                </>
              )}
              <dt>Solicitado por</dt>
              <dd>
                {nome(t.solicitado_por_colaborador_id)} · {formatarData(t.created_at)}
              </dd>
              <dt>Eficácia</dt>
              <dd>{t.exige_eficacia ? `Exigida${t.eficacia_prazo ? ` até ${formatarData(t.eficacia_prazo)}` : ""}` : "Não exigida"}</dd>
              <dt>Justificativa</dt>
              <dd>{t.justificativa || "—"}</dd>
              <dt>Observação</dt>
              <dd>{t.observacao || "—"}</dd>
              {t.reposicao_de_id && (
                <>
                  <dt>Reposição de</dt>
                  <dd>
                    <Button variant="ghost" onClick={() => navigate(`/desenvolvimento/treinamento/${t.reposicao_de_id}`)}>
                      Abrir treinamento de origem
                    </Button>
                  </dd>
                </>
              )}
            </dl>
            {p.podeCancelar && (
              <div className={styles.acoes} style={{ justifyContent: "flex-start", marginTop: 10 }}>
                <ConfirmarComMotivo rotulo="Cancelar treinamento" confirmar="Confirmar cancelamento" variante="danger" motivoObrigatorio onConfirmar={(motivo) => acao("treinamento_cancelar", { id: t.id, motivo }, "Treinamento cancelado.")} />
              </div>
            )}
          </details>
        </Card>

        {ordem.map((k) => secoes[k])}
      </div>

      {editando && (
        <TreinamentoDrawer
          item={t}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            recarregarTudo();
          }}
        />
      )}
    </>
  );
}

function SemTreinamento() {
  return (
    <>
      <Header />
      <Card>
        <EstadoVazio icone={<SearchX size={26} strokeWidth={1.6} />} titulo="Treinamento não encontrado" descricao="Ele não existe ou não está no seu escopo de acesso." />
      </Card>
    </>
  );
}

/** Realização = planejado, salvo exceção: só pede dados quando o treinamento ocorreu diferente do planejado. */
function RealizacaoResumo({ t, podeAlterar, onSalvar }: { t: Treinamento; podeAlterar: boolean; onSalvar: (corpo: Record<string, unknown>) => Promise<void> }) {
  const [alterando, setAlterando] = useState(false);
  const alterada = Boolean(t.data_realizacao || t.carga_realizada_min);
  return (
    <div className={styles.realizacao}>
      <div>
        <strong>Realização</strong>
        <span className={styles.secundario}>{alterada ? " · informada" : " · conforme o planejado"}</span>
        <div>
          Data: {formatarData(t.data_realizacao ?? t.data_fim ?? t.data_inicio)} · Carga horária: {formatarCarga(t.carga_realizada_min ?? t.carga_horaria_min)}
        </div>
      </div>
      {podeAlterar && !alterando && (
        <button type="button" className={styles.linkAcao} onClick={() => setAlterando(true)}>
          Alterar dados da realização
        </button>
      )}
      {alterando && (
        <Realizacao
          t={t}
          onCancelar={() => setAlterando(false)}
          onSalvar={async (corpo) => {
            await onSalvar(corpo);
            setAlterando(false);
          }}
        />
      )}
    </div>
  );
}

function Realizacao({ t, onSalvar, onCancelar }: { t: Treinamento; onSalvar: (corpo: Record<string, unknown>) => Promise<void>; onCancelar: () => void }) {
  const [data, setData] = useState(t.data_realizacao ?? "");
  const [carga, setCarga] = useState(t.carga_realizada_min ? String(t.carga_realizada_min / 60) : "");
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      className={styles.filtros}
      style={{ marginTop: 10, alignItems: "flex-end", width: "100%" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await onSalvar({ data_realizacao: data || null, carga_realizada_min: carga.trim() ? Math.round(Number(carga.replace(",", ".")) * 60) : null });
        } catch {
          // erro exibido pela tela
        } finally {
          setSalvando(false);
        }
      }}
    >
      <label className={styles.campo}>
        Data realizada
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </label>
      <label className={styles.campo}>
        Carga realizada (horas)
        <input inputMode="decimal" value={carga} onChange={(e) => setCarga(e.target.value)} placeholder={t.carga_horaria_min ? String(t.carga_horaria_min / 60) : "Ex.: 2"} />
      </label>
      <span className={styles.dica} style={{ flexBasis: "100%" }}>
        Deixe em branco o que ocorreu conforme o planejado.
      </span>
      <Button type="button" variant="ghost" onClick={onCancelar} disabled={salvando}>
        Cancelar
      </Button>
      <Button type="submit" variant="secondary" disabled={salvando}>
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

// ── Necessidades vinculadas ────────────────────────────────────────────
function NecessidadesVinculadas({ t, podeEditar, versao, onAlterado }: { t: Treinamento; podeEditar: boolean; versao: number; onAlterado: () => void }) {
  const { pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const vinculos = useConsulta(() => listarVinculos(t.id), [t.id, versao]);
  const [vinculando, setVinculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nomes = useConsulta(
    () => pessoasPorId((vinculos.dados ?? []).map((v) => v.necessidade?.colaborador_id ?? 0).filter((i) => i && !pessoaPorId.has(i))),
    [vinculos.dados],
  );
  const nomeDe = (cid: number | null | undefined) => (cid ? (pessoaPorId.get(cid)?.nome ?? nomes.dados?.get(cid)?.nome ?? `#${cid}`) : "—");
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Necessidades de Desenvolvimento relacionadas</h3>
          <p className={styles.cardSubtitle}>Cada necessidade será considerada atendida somente para os participantes que concluírem os critérios aplicáveis do treinamento{t.exige_eficacia ? " (inclusive eficácia comprovada)" : ""}.</p>
        </div>
        {podeEditar && (
          <Button variant="secondary" className={styles.botaoLongo} icon={<Link2 size={16} />} onClick={() => setVinculando(true)}>
            Vincular Necessidade de Desenvolvimento
          </Button>
        )}
      </div>
      {erro && <Erro mensagem={erro} />}
      {vinculos.erro ? (
        <Erro mensagem={vinculos.erro} />
      ) : vinculos.carregando && !vinculos.dados ? (
        <Carregando />
      ) : (vinculos.dados ?? []).length === 0 ? (
        <p className={styles.secundario}>Nenhuma Necessidade de Desenvolvimento vinculada.</p>
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Necessidade de Desenvolvimento</th>
                <th>Prioridade</th>
                <th>Status</th>
                {podeEditar && <th />}
              </tr>
            </thead>
            <tbody>
              {(vinculos.dados ?? []).map((v) => (
                <tr key={v.id}>
                  <td>{nomeDe(v.necessidade?.colaborador_id)}</td>
                  <td>
                    {v.necessidade?.descricao ?? `Necessidade de Desenvolvimento #${v.necessidade_id}`}
                    {v.necessidade?.categoria && <div className={styles.secundario}>{CATEGORIA_NECESSIDADE[v.necessidade.categoria]}</div>}
                  </td>
                  <td>{v.necessidade?.prioridade ? <Selo tom={PRIORIDADE[v.necessidade.prioridade].tom}>{PRIORIDADE[v.necessidade.prioridade].rotulo}</Selo> : "—"}</td>
                  <td>{v.necessidade ? <Selo tom={STATUS_NECESSIDADE[v.necessidade.status].tom}>{STATUS_NECESSIDADE[v.necessidade.status].rotulo}</Selo> : "—"}</td>
                  {podeEditar && (
                    <td style={{ minWidth: 150 }}>
                      <ConfirmarComMotivo
                        rotulo="Desvincular"
                        confirmar="Desvincular"
                        variante="secondary"
                        motivoObrigatorio
                        onConfirmar={async (motivo) => {
                          setErro(null);
                          try {
                            await gravar("necessidade_desvincular", { treinamento_id: t.id, necessidade_id: v.necessidade_id, motivo });
                            flash("Necessidade de Desenvolvimento desvinculada.");
                            onAlterado();
                          } catch (e) {
                            setErro(mensagem(e));
                            throw e;
                          }
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {vinculando && (
        <VincularDrawer
          t={t}
          jaVinculadas={new Set((vinculos.dados ?? []).map((v) => v.necessidade_id))}
          onFechar={() => setVinculando(false)}
          onConcluido={() => {
            setVinculando(false);
            onAlterado();
          }}
        />
      )}
    </Card>
  );
}

function VincularDrawer({ t, jaVinculadas, onFechar, onConcluido }: { t: Treinamento; jaVinculadas: Set<number>; onFechar: () => void; onConcluido: () => void }) {
  const { pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const lista = usePaginado(
    (pg) => listarNecessidades(pg, { status: ["validada", "planejada"], busca: termo, origem: null, categoria: null, prioridade: null, colaboradorId: null, gestorId: null, departamento: null, grupoId: null }),
    [termo],
  );
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow={t.codigo} titulo="Vincular Necessidades de Desenvolvimento" sub="Somente Necessidades de Desenvolvimento VALIDADAS (ou já planejadas). O colaborador entra como participante." />}>
      <div className={styles.secao}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTermo(busca);
          }}
        >
          <input className={styles.input} style={{ width: "100%" }} type="search" placeholder="Buscar Necessidade de Desenvolvimento" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca)} />
        </form>
        {lista.erro ? (
          <Erro mensagem={lista.erro} />
        ) : lista.carregando || !lista.dados ? (
          <Carregando />
        ) : lista.dados.itens.length === 0 ? (
          <p className={styles.secundario}>Nenhuma Necessidade de Desenvolvimento validada encontrada.</p>
        ) : (
          <>
            {lista.dados.itens.map((n) => {
              const ja = jaVinculadas.has(n.id);
              return (
                <label key={n.id} className={styles.check} style={{ alignItems: "flex-start", fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    disabled={ja}
                    checked={ja || marcadas.has(n.id)}
                    onChange={() =>
                      setMarcadas((m) => {
                        const x = new Set(m);
                        if (x.has(n.id)) x.delete(n.id);
                        else x.add(n.id);
                        return x;
                      })
                    }
                  />
                  <span>
                    <strong>{n.colaborador_id ? (pessoaPorId.get(n.colaborador_id)?.nome ?? `#${n.colaborador_id}`) : n.cargo_nome}</strong> — {n.descricao}
                    <span className={styles.dica}>
                      {" "}
                      · {STATUS_NECESSIDADE[n.status].rotulo}
                      {n.prioridade ? ` · ${PRIORIDADE[n.prioridade].rotulo}` : ""}
                      {ja ? " · já vinculada" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
            <Paginacao pagina={lista.pagina} total={lista.dados.total} onChange={lista.setPagina} />
          </>
        )}
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button
            variant="primary"
            disabled={salvando || marcadas.size === 0}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              try {
                const r = await gravar<{ vinculadas: number }>("necessidades_vincular", { treinamento_id: t.id, necessidade_ids: [...marcadas] });
                flash(r.vinculadas === 1 ? "1 Necessidade de Desenvolvimento vinculada." : `${r.vinculadas} Necessidades de Desenvolvimento vinculadas.`);
                onConcluido();
              } catch (e) {
                setErro(mensagem(e));
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Vinculando..." : `Vincular ${marcadas.size || ""}`}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ── QR de presença ──────────────────────────────────────────────────────
/** QR em PNG de alta resolução (para projetar ou colar em slides), do MESMO link/token exibido — não gera token novo. */
function qrPng(url: string, lado = 1024): HTMLCanvasElement {
  const q = qrcode(0, "M");
  q.addData(url);
  q.make();
  const modulos = q.getModuleCount();
  const margem = 4; // zona de silêncio padrão do QR
  const escala = Math.max(1, Math.floor(lado / (modulos + margem * 2)));
  const total = escala * (modulos + margem * 2);
  const canvas = document.createElement("canvas");
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, total, total);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < modulos; r++) for (let c = 0; c < modulos; c++) if (q.isDark(r, c)) ctx.fillRect((c + margem) * escala, (r + margem) * escala, escala, escala);
  return canvas;
}

function QrPresenca({ t, onAtualizarLista }: { t: Treinamento; onAtualizarLista: () => void }) {
  const { flash } = useToast();
  const [qr, setQr] = useState<{ token: string; expira_em: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = qr ? `${window.location.origin}/participar/${qr.token}` : "";
  const canvas = useMemo(() => (url ? qrPng(url) : null), [url]);
  const imagem = useMemo(() => canvas?.toDataURL("image/png") ?? "", [canvas]);

  async function copiarImagem() {
    try {
      if (!canvas || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("sem suporte");
      const blob = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("png"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("QR Code copiado — cole no PowerPoint com Ctrl+V.");
    } catch {
      setErro("Este navegador não permite copiar imagem. Use Baixar PNG.");
    }
  }

  function baixarPng() {
    const a = document.createElement("a");
    a.href = imagem;
    a.download = `QR-presenca-${t.codigo}.png`;
    a.click();
  }
  // Com o QR aberto, a lista de presença se atualiza sozinha.
  useEffect(() => {
    if (!qr) return;
    const timer = window.setInterval(onAtualizarLista, 15000);
    return () => window.clearInterval(timer);
  }, [qr, onAtualizarLista]);

  async function gerar(renovar: boolean) {
    setErro(null);
    setOcupado(true);
    try {
      setQr(await gravar<{ token: string; expira_em: string }>("qr_gerar", { treinamento_id: t.id, renovar }));
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>
            QR Code de presença
            {t.homologacao && <TagTeste />}
          </h3>
          <p className={styles.cardSubtitle}>O participante lê o código e confirma com o e-mail corporativo. Quem não conseguir: presença manual abaixo.</p>
        </div>
        <div className={styles.acoes}>
          {!qr ? (
            <Button variant="primary" icon={<QrCode size={16} />} disabled={ocupado} onClick={() => void gerar(false)}>
              Exibir QR
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={ocupado} onClick={() => void gerar(true)}>
                Gerar novo código
              </Button>
              <Button
                variant="danger"
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  try {
                    await gravar("qr_encerrar", { treinamento_id: t.id });
                    setQr(null);
                    flash("QR encerrado — novas leituras não são aceitas.");
                    onAtualizarLista();
                  } catch (e) {
                    setErro(mensagem(e));
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                Encerrar QR
              </Button>
            </>
          )}
        </div>
      </div>
      {erro && <Erro mensagem={erro} />}
      {qr && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <img src={imagem} alt="QR Code de presença" style={{ width: 260, height: 260, imageRendering: "pixelated", background: "#fff", borderRadius: 8 }} />
            <div className={styles.acoes} style={{ justifyContent: "center" }}>
              <Button variant="secondary" onClick={() => void copiarImagem()}>
                Copiar QR Code
              </Button>
              <Button variant="secondary" onClick={baixarPng}>
                Baixar PNG
              </Button>
            </div>
          </div>
          <dl className={styles.detalhe}>
            <dt>Válido até</dt>
            <dd>
              {formatarDataHora(qr.expira_em)}
              <div className={styles.dica}>Depois disso, ao encerrar ou ao gerar novo código, este QR — inclusive o já colado em apresentações — deixa de registrar presença.</div>
            </dd>
            <dt>Link</dt>
            <dd style={{ wordBreak: "break-all" }}>{url}</dd>
            <dt />
            <dd>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  flash("Link copiado.");
                }}
              >
                Copiar link
              </Button>
            </dd>
          </dl>
        </div>
      )}
    </Card>
  );
}

// ── Participantes, presença e eficácia ─────────────────────────────────
function Participantes(props: {
  t: Treinamento;
  p: ReturnType<typeof permissoes>;
  lista: Participante[] | null;
  erro: string | null;
  carregando: boolean;
  acao: (a: AcaoGravacao, corpo: Record<string, unknown>, ok: string) => Promise<void>;
  abrirInclusao?: boolean;
}) {
  const { t, p, lista, acao } = props;
  const { perfil, colaboradorId, pessoaPorId } = useDesenvolvimento();
  const [adicionando, setAdicionando] = useState(Boolean(props.abrirInclusao) && p.podeParticipantes);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [presenca, setPresenca] = useState<"presente" | "ausente" | "pendente">("presente");
  const [motivo, setMotivo] = useState("");
  const [avaliando, setAvaliando] = useState<Participante | null>(null);
  const [mostrarRetirados, setMostrarRetirados] = useState(false);
  const ativos = (lista ?? []).filter((x) => !x.removido_em);
  const retirados = (lista ?? []).filter((x) => x.removido_em);
  const podeAvaliar = (x: Participante) =>
    t.exige_eficacia &&
    x.presenca_status === "presente" &&
    (t.status === "em_andamento" || t.status === "concluido") &&
    (perfil === "RH" || (perfil === "Gestor" && x.colaborador_id !== colaboradorId && pessoaPorId.has(x.colaborador_id)));
  const resumo = { presente: ativos.filter((x) => x.presenca_status === "presente").length, ausente: ativos.filter((x) => x.presenca_status === "ausente").length, pendente: ativos.filter((x) => x.presenca_status === "pendente").length };
  const alternar = (id: number) =>
    setMarcados((m) => {
      const x = new Set(m);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Participantes ({ativos.length})</h3>
          <p className={styles.cardSubtitle}>
            {resumo.presente} presente{resumo.presente === 1 ? "" : "s"} · {resumo.ausente} ausente{resumo.ausente === 1 ? "" : "s"} · {resumo.pendente} pendente{resumo.pendente === 1 ? "" : "s"}
            {perfil === "Gestor" ? " — você vê os participantes da sua equipe" : ""}
          </p>
        </div>
        {p.podeParticipantes && (
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setAdicionando(true)}>
            Incluir participantes
          </Button>
        )}
      </div>

      {p.podePresenca && marcados.size > 0 && (
        <div className={styles.toolbar} style={{ background: "var(--color-surface-alt)", padding: "10px 12px", borderRadius: "var(--radius-md)", alignItems: "flex-end" }}>
          <span className={styles.secundario}>{marcados.size} selecionado(s)</span>
          <div className={styles.filtros} style={{ alignItems: "flex-end" }}>
            <select className={styles.select} value={presenca} onChange={(e) => setPresenca(e.target.value as typeof presenca)} aria-label="Presença">
              <option value="presente">Realizou</option>
              <option value="ausente">Ausente</option>
              {t.status !== "concluido" && <option value="pendente">Voltar a pendente</option>}
            </select>
            <input className={styles.input} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} placeholder={t.status === "concluido" ? "Justificativa da retificação *" : "Origem/justificativa (ex.: lista física) *"} />
            <Button
              variant="primary"
              disabled={!motivo.trim()}
              onClick={() =>
                void acao("presenca_manual", { treinamento_id: t.id, participante_ids: [...marcados], presenca, motivo: motivo.trim() }, "Presença registrada.")
                  .then(() => {
                    setMarcados(new Set());
                    setMotivo("");
                  })
                  .catch(() => undefined)
              }
            >
              Registrar
            </Button>
          </div>
        </div>
      )}

      {props.erro ? (
        <Erro mensagem={props.erro} />
      ) : props.carregando && !lista ? (
        <Carregando />
      ) : ativos.length === 0 ? (
        <EstadoVazio icone={<Users size={26} strokeWidth={1.6} />} titulo="Nenhum participante." descricao="Inclua colaboradores do PeopleFlow ou vincule Necessidades de Desenvolvimento." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                {p.podePresenca && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={marcados.size === ativos.length}
                      onChange={(e) => setMarcados(e.target.checked ? new Set(ativos.map((x) => x.id)) : new Set())}
                    />
                  </th>
                )}
                <th>Colaborador</th>
                <th>Inclusão</th>
                <th>Presença</th>
                {t.exige_eficacia && <th>Eficácia</th>}
                {(p.podeParticipantes || t.exige_eficacia) && <th />}
              </tr>
            </thead>
            <tbody>
              {ativos.map((x) => (
                <tr key={x.id}>
                  {p.podePresenca && (
                    <td>
                      <input type="checkbox" aria-label="Selecionar" checked={marcados.has(x.id)} onChange={() => alternar(x.id)} />
                    </td>
                  )}
                  <td>
                    {x.pessoa?.nome ?? `#${x.colaborador_id}`}
                    <div className={styles.secundario}>
                      {x.pessoa?.cargo}
                      {x.pessoa?.departamento ? ` · ${x.pessoa.departamento}` : ""}
                    </div>
                  </td>
                  <td className={styles.secundario}>{{ manual: "Manual", criterio: "Critério", lnt: "Necessidade de Desenvolvimento", reposicao: "Reposição" }[x.origem_inclusao]}</td>
                  <td>
                    <Selo tom={PRESENCA[x.presenca_status].tom}>{PRESENCA[x.presenca_status].rotulo}</Selo>
                    {x.presenca_metodo && (
                      <div className={styles.secundario} title={x.presenca_motivo ?? undefined}>
                        {METODO_PRESENCA[x.presenca_metodo] ?? x.presenca_metodo} · {formatarDataHora(x.presenca_em)}
                      </div>
                    )}
                  </td>
                  {t.exige_eficacia && (
                    <td>
                      {x.eficacia_resultado ? <Selo tom={EFICACIA[x.eficacia_resultado].tom}>{EFICACIA[x.eficacia_resultado].rotulo}</Selo> : <span className={styles.secundario}>{x.presenca_status === "presente" ? "A avaliar" : "—"}</span>}
                    </td>
                  )}
                  {(p.podeParticipantes || t.exige_eficacia) && (
                    <td style={{ minWidth: 140 }}>
                      <div className={styles.acoes}>
                        {podeAvaliar(x) && (
                          <Button variant="ghost" onClick={() => setAvaliando(x)}>
                            {x.eficacia_resultado ? "Reavaliar" : "Avaliar eficácia"}
                          </Button>
                        )}
                        {p.podeParticipantes && (
                          <ConfirmarComMotivo rotulo="Retirar" confirmar="Retirar" variante="secondary" motivoObrigatorio onConfirmar={(m) => acao("participante_remover", { participante_id: x.id, motivo: m }, "Participante retirado.")} />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {retirados.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={() => setMostrarRetirados((v) => !v)}>
            {mostrarRetirados ? "Ocultar" : "Ver"} retirados ({retirados.length})
          </Button>
          {mostrarRetirados && (
            <ul className={styles.historico}>
              {retirados.map((x) => (
                <li key={x.id} className={styles.secundario}>
                  {x.pessoa?.nome ?? `#${x.colaborador_id}`} — retirado em {formatarDataHora(x.removido_em)}: {x.removido_motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {adicionando && (
        <IncluirDrawer
          t={t}
          jaInscritos={new Set(ativos.map((x) => x.colaborador_id))}
          onFechar={() => setAdicionando(false)}
          onIncluir={async (ids) => {
            await acao("participantes_adicionar", { treinamento_id: t.id, colaborador_ids: ids }, "Participantes incluídos.");
            setAdicionando(false);
          }}
        />
      )}
      {avaliando && (
        <EficaciaDrawer
          participante={avaliando}
          onFechar={() => setAvaliando(null)}
          onSalvar={async (resultado, observacao) => {
            await acao("eficacia_registrar", { participante_id: avaliando.id, resultado, observacao }, "Eficácia registrada.");
            setAvaliando(null);
          }}
        />
      )}
    </Card>
  );
}

function IncluirDrawer({ t, jaInscritos, onFechar, onIncluir }: { t: Treinamento; jaInscritos: Set<number>; onFechar: () => void; onIncluir: (ids: number[]) => Promise<void> }) {
  // Todos os colaboradores ativos (treinamentos podem ser transversais) — o servidor só
  // libera esta lista para quem monta a turma, e só com nome, cargo e departamento.
  const opcoes = useConsulta(() => opcoesParticipantes(t.id), [t.id]);
  const [busca, setBusca] = useState("");
  const [departamento, setDepartamento] = useState(TODOS_DEPARTAMENTOS);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const todas = useMemo(() => opcoes.dados ?? [], [opcoes.dados]);
  const departamentos = useMemo(() => departamentosDe(todas), [todas]);
  const visiveis = useMemo(() => filtrarOpcoes(todas, busca, departamento, jaInscritos), [todas, busca, departamento, jaInscritos]);
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((o) => marcados.has(o.id));
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow={t.codigo} titulo="Incluir participantes" sub="Colaboradores ativos de qualquer área" />}>
      <div className={styles.secao}>
        <div className={styles.filtros}>
          <input className={styles.input} type="search" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select className={styles.select} value={departamento} onChange={(e) => setDepartamento(e.target.value)} aria-label="Departamento">
            <option value={TODOS_DEPARTAMENTOS}>Todos os departamentos</option>
            {departamentos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        {opcoes.erro ? (
          <Erro mensagem={opcoes.erro} />
        ) : opcoes.carregando ? (
          <Carregando />
        ) : (
          <>
            <div className={styles.toolbar} style={{ marginBottom: 0 }}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  disabled={visiveis.length === 0}
                  checked={todosVisiveisMarcados}
                  onChange={() => setMarcados((m) => (todosVisiveisMarcados ? desmarcarTodos(m, visiveis) : selecionarTodos(m, visiveis)))}
                />
                Selecionar todos{departamento ? ` de ${departamento}` : ""} ({visiveis.length})
              </label>
              <strong className={styles.secundario}>{marcados.size} selecionado(s)</strong>
            </div>
            {visiveis.length === 0 ? (
              <p className={styles.secundario}>Ninguém disponível com esse filtro.</p>
            ) : (
              visiveis.map((x) => (
                <label key={x.id} className={styles.check} style={{ fontWeight: 500 }}>
                  <input type="checkbox" checked={marcados.has(x.id)} onChange={() => setMarcados((m) => alternarSelecao(m, x.id))} />
                  <span>
                    <strong>{x.nome}</strong> <span className={styles.dica}>{[x.cargo, x.departamento].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))
            )}
          </>
        )}
        {erro && <Erro mensagem={erro} />}
        {/* Fixo no rodapé do drawer: com turmas grandes, a ação não fica no fim da lista. */}
        <div className={[styles.acoes, styles.rodapeFixo].join(" ")}>
          <Button
            variant="primary"
            disabled={salvando || marcados.size === 0}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              try {
                await onIncluir([...marcados]);
              } catch (e) {
                setErro(mensagem(e));
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Incluindo..." : marcados.size ? `Incluir ${marcados.size} participante${marcados.size > 1 ? "s" : ""}` : "Incluir"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ── Reposição para faltantes ───────────────────────────────────────────
function Reposicoes({ t, podeRepor, ausentes }: { t: Treinamento; podeRepor: boolean; ausentes: number }) {
  const navigate = useNavigate();
  const lista = useConsulta(() => listarReposicoes(t.id), [t.id]);
  const [agendando, setAgendando] = useState(false);
  const reposicoes = lista.dados ?? [];
  if (t.status !== "concluido" || (ausentes === 0 && reposicoes.length === 0)) return null;
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Faltantes e reposições</h3>
          <p className={styles.cardSubtitle}>
            {ausentes === 1 ? "1 ausente: não é considerado treinado e segue pendente" : `${ausentes} ausentes: não são considerados treinados e seguem pendentes`} até realizar uma reposição. Este treinamento não é reaberto.
          </p>
        </div>
        {podeRepor && ausentes > 0 && (
          <Button variant="primary" icon={<CalendarPlus size={16} />} onClick={() => setAgendando(true)}>
            Agendar treinamento para faltantes
          </Button>
        )}
      </div>
      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : reposicoes.length === 0 ? (
        <p className={styles.secundario}>Nenhuma reposição agendada.</p>
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Reposição</th>
                <th>Código</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reposicoes.map((r) => (
                <tr key={r.id} className={styles.linhaClicavel} onClick={() => navigate(`/desenvolvimento/treinamento/${r.id}`)}>
                  <td>
                    Reposição {r.reposicao_numero}
                    {r.homologacao && <TagTeste />}
                  </td>
                  <td className={styles.mono}>{r.codigo}</td>
                  <td className={styles.mono}>{formatarData(r.data_realizacao ?? r.data_inicio)}</td>
                  <td>
                    <Selo tom={STATUS_TREINAMENTO[r.status].tom}>{STATUS_TREINAMENTO[r.status].rotulo}</Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {agendando && (
        <TreinamentoDrawer
          item={t}
          modo="reposicao"
          onFechar={() => setAgendando(false)}
          onSalvo={(nova) => {
            setAgendando(false);
            navigate(`/desenvolvimento/treinamento/${nova.id}`);
          }}
        />
      )}
    </Card>
  );
}

function EficaciaDrawer({ participante, onFechar, onSalvar }: { participante: Participante; onFechar: () => void; onSalvar: (r: ResultadoEficacia, obs: string) => Promise<void> }) {
  const [resultado, setResultado] = useState<ResultadoEficacia>(participante.eficacia_resultado ?? "eficaz");
  const [obs, setObs] = useState(participante.eficacia_observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Eficácia" titulo={participante.pessoa?.nome ?? `#${participante.colaborador_id}`} sub="O treinamento produziu o resultado esperado no trabalho?" />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            await onSalvar(resultado, obs.trim());
          } catch (err) {
            setErro(mensagem(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <label className={styles.campo}>
          Resultado *
          <select value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoEficacia)}>
            {(Object.keys(EFICACIA) as ResultadoEficacia[]).map((r) => (
              <option key={r} value={r}>
                {EFICACIA[r].rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          Observação{resultado !== "eficaz" ? " *" : ""}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} required={resultado !== "eficaz"} />
        </label>
        <span className={styles.dica}>Somente “Eficaz” encerra a Necessidade de Desenvolvimento vinculada como atendida.</span>
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

// ── Evidências ──────────────────────────────────────────────────────────
function Evidencias({ t, podeAnexar, participantes, versao }: { t: Treinamento; podeAnexar: boolean; participantes: Participante[]; versao: number }) {
  const { flash } = useToast();
  const { perfil } = useDesenvolvimento();
  const interno = t.modalidade === "interno";
  const lista = useConsulta(() => listarEvidencias(t.id), [t.id, t.status, t.updated_at, versao]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<TipoEvidencia>(interno ? "material" : "certificado");
  // Interno: a lista de presença é gerada pelo PeopleFlow (não é tipo de upload). Externo: lista vinda de terceiros.
  const tiposUpload = (Object.keys(TIPO_EVIDENCIA) as TipoEvidencia[]).filter((k) => !(interno && k === "lista_presenca"));
  const rotuloTipo = (k: TipoEvidencia) => (k === "lista_presenca" && !interno ? "Lista de presença externa" : TIPO_EVIDENCIA[k]);
  const listasSistema = (lista.dados ?? []).filter((e) => e.sistema);
  const listaAtual = listasSistema.find((e) => !e.substituida_em) ?? null;
  const versoesAnteriores = listasSistema.filter((e) => e.substituida_em);
  const manuais = (lista.dados ?? []).filter((e) => !e.sistema);
  const [participante, setParticipante] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [versaoInput, setVersaoInput] = useState(0);
  const nomePart = new Map(participantes.map((x) => [x.id, x.pessoa?.nome ?? `#${x.colaborador_id}`]));

  async function baixar(id: number, visualizar = false) {
    setErro(null);
    try {
      const { url } = await gravar<{ url: string }>("evidencia_url", { id, visualizar });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>
            Evidências
            {t.homologacao && <TagTeste />}
          </h3>
          <p className={styles.cardSubtitle}>
            {interno
              ? "Material, ata, fotos, certificados… A Lista de Presença é gerada pelo PeopleFlow."
              : "Treinamento externo: anexe certificado, lista de presença externa, comprovante ou declaração antes de concluir."}{" "}
            Arquivos em área privada, abertos por link temporário.
          </p>
        </div>
      </div>
      {erro && <Erro mensagem={erro} />}
      {interno && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Lista de Presença</h4>
          {listaAtual ? (
            <div className={styles.toolbar} style={{ marginBottom: 0, alignItems: "center" }}>
              <div>
                <strong>Gerada automaticamente pelo PeopleFlow</strong>
                <div className={styles.secundario}>{listaAtual.observacao.replace(/^Gerada automaticamente pelo PeopleFlow · /, "")}</div>
                <div className={styles.secundario}>Gerada em {formatarDataHora(listaAtual.enviado_em).replace(" ", " às ")}</div>
              </div>
              <div className={styles.acoes}>
                <Button variant="primary" icon={<FileText size={16} />} onClick={() => void baixar(listaAtual.id, true)}>
                  Visualizar lista
                </Button>
                {perfil === "RH" && (
                  <ConfirmarComMotivo
                    rotulo="Gerar nova versão"
                    confirmar="Gerar nova versão"
                    variante="secondary"
                    motivoObrigatorio
                    onConfirmar={async (motivo) => {
                      try {
                        await gravar("lista_presenca_gerar", { treinamento_id: t.id, motivo });
                        flash("Nova versão da Lista de Presença gerada; a anterior foi preservada.");
                        lista.recarregar();
                      } catch (e) {
                        setErro(mensagem(e));
                        throw e;
                      }
                    }}
                  />
                )}
              </div>
            </div>
          ) : t.status === "concluido" ? (
            <div className={styles.toolbar} style={{ marginBottom: 0 }}>
              <span className={styles.secundario}>Lista de Presença ainda não gerada para este treinamento.</span>
              {perfil === "RH" && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    setErro(null);
                    try {
                      await gravar("lista_presenca_gerar", { treinamento_id: t.id });
                      flash("Lista de Presença gerada.");
                      lista.recarregar();
                    } catch (e) {
                      setErro(mensagem(e));
                    }
                  }}
                >
                  Gerar Lista de Presença
                </Button>
              )}
            </div>
          ) : (
            <p className={styles.secundario}>Será gerada automaticamente na conclusão, a partir dos registros de presença (QR e manuais).</p>
          )}
          {versoesAnteriores.length > 0 && (
            <ul className={styles.historico}>
              {versoesAnteriores.map((v) => (
                <li key={v.id} className={styles.secundario}>
                  {v.file_name} — gerada em {formatarDataHora(v.enviado_em)}, substituída em {formatarDataHora(v.substituida_em)}. {v.substituida_motivo}{" "}
                  <Button variant="ghost" onClick={() => void baixar(v.id, true)}>
                    Visualizar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {interno && <h4 className={styles.secaoTitulo}>Outras evidências</h4>}
      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando && !lista.dados ? (
        <Carregando />
      ) : manuais.length === 0 ? (
        <p className={styles.secundario}>Nenhuma evidência anexada.</p>
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tipo</th>
                <th>Participante</th>
                <th>Enviado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {manuais.map((ev) => (
                <tr key={ev.id} className={ev.substituida_em ? styles.linhaInativa : ""}>
                  <td>
                    <FileText size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    {ev.file_name}
                    {ev.observacao && <div className={styles.secundario}>{ev.observacao}</div>}
                    {ev.substituida_em && <div className={styles.secundario}>Substituída: {ev.substituida_motivo}</div>}
                  </td>
                  <td className={styles.secundario}>{rotuloTipo(ev.tipo)}</td>
                  <td className={styles.secundario}>{ev.participante_id ? (nomePart.get(ev.participante_id) ?? "—") : "Turma"}</td>
                  <td className={styles.mono}>{formatarDataHora(ev.enviado_em)}</td>
                  <td style={{ minWidth: 160 }}>
                    <div className={styles.acoes}>
                      <Button variant="ghost" onClick={() => void baixar(ev.id)}>
                        Abrir
                      </Button>
                      {podeAnexar && !ev.substituida_em && (
                        <ConfirmarComMotivo
                          rotulo="Substituir"
                          confirmar="Marcar como substituída"
                          variante="secondary"
                          motivoObrigatorio
                          onConfirmar={async (motivo) => {
                            try {
                              await gravar("evidencia_substituir", { id: ev.id, motivo });
                              flash("Evidência marcada como substituída — anexe a nova versão.");
                              lista.recarregar();
                            } catch (e) {
                              setErro(mensagem(e));
                              throw e;
                            }
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeAnexar && (
        <form
          className={styles.filtros}
          style={{ marginTop: 16, alignItems: "flex-end" }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!arquivo) return;
            setErro(null);
            setEnviando(true);
            try {
              await enviarEvidencia(t.id, arquivo, tipo, participante ? Number(participante) : null, obs.trim());
              flash("Evidência anexada.");
              setArquivo(null);
              setObs("");
              setVersaoInput((v) => v + 1);
              lista.recarregar();
            } catch (err) {
              setErro(mensagem(err));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <label className={styles.campo}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvidencia)}>
              {tiposUpload.map((k) => (
                <option key={k} value={k}>
                  {rotuloTipo(k)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Participante
            <select value={participante} onChange={(e) => setParticipante(e.target.value)}>
              <option value="">Turma inteira</option>
              {participantes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.pessoa?.nome ?? `#${x.colaborador_id}`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Arquivo (PDF, imagem, Office — até 20 MB)
            <input key={versaoInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.pptx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          <label className={styles.campo}>
            Observação
            <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} />
          </label>
          <Button type="submit" variant="primary" icon={<Upload size={16} />} disabled={!arquivo || enviando}>
            {enviando ? "Enviando..." : "Anexar"}
          </Button>
        </form>
      )}
    </Card>
  );
}
