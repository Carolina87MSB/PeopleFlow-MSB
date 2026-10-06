import { useMemo, useState } from "react";
import { ClipboardList, Lock, Plus, RefreshCw } from "lucide-react";
import { Button, Card, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, Erro, EstadoVazio, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { contarSugeridasAguardando, eventosDaLnt, listarCiclos, lnt, type CicloLnt, type ResultadoCarga } from "./lntRepository";
import { candidatasDe, carregarDadosCiclo, indicadoresDe, pendenciasDe, type DadosCiclo } from "./lntDados";
import { dataCurta, mensagemDeErro, plural, ROTULO_STATUS_CICLO, textoPendencia } from "./lntRotulos";
import { LntBase } from "./LntBase";
import { LntItens } from "./LntItens";
import { LntNaoPriorizadas } from "./LntNaoPriorizadas";
import styles from "./Desenvolvimento.module.css";

type Subvisao = "base" | "consolidada" | "nao_priorizadas";

/** Aba LNT: sem ciclo mostra o convite para criar; com ciclo, o cabeçalho, os indicadores e as três subvisões. Só o RH decide. */
export function LntAba() {
  const { perfil } = useDesenvolvimento();
  const ehRH = perfil === "RH";
  const ciclos = useConsulta(() => listarCiclos(), []);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [criando, setCriando] = useState(false);

  if (ciclos.erro) return <Card><Erro mensagem={ciclos.erro} /></Card>;
  if (ciclos.carregando || !ciclos.dados) return <Card><Carregando /></Card>;

  const lista = ciclos.dados;
  const ciclo = lista.find((c) => c.id === escolhido) ?? lista.find((c) => c.status === "em_elaboracao") ?? lista[0];
  const podeCriarNova = ehRH && !lista.some((c) => c.status === "em_elaboracao");

  return (
    <div className={styles.pilha}>
      {!ciclo ? (
        <Card>
          <EstadoVazio
            icone={<ClipboardList size={26} strokeWidth={1.6} />}
            titulo="Não há uma LNT em elaboração."
            descricao="A LNT consolida e prioriza as Necessidades de Desenvolvimento para o planejamento de T&D do ano seguinte. Cada necessidade original continua preservada na Base de Necessidades."
          />
          {ehRH ? (
            <div className={styles.acoes} style={{ justifyContent: "center", marginTop: 4 }}>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCriando(true)}>
                Criar LNT
              </Button>
            </div>
          ) : (
            <p className={styles.dica} style={{ textAlign: "center" }}>
              A RH ainda não abriu uma LNT.
            </p>
          )}
        </Card>
      ) : (
        <CicloAberto key={ciclo.id} ciclo={ciclo} ciclos={lista} onEscolher={setEscolhido} podeCriarNova={podeCriarNova} onNova={() => setCriando(true)} onCicloAlterado={ciclos.recarregar} />
      )}
      {ehRH && criando && (
        <CriarCicloDrawer
          onFechar={() => setCriando(false)}
          onCriado={(c) => {
            setCriando(false);
            setEscolhido(c.id);
            ciclos.recarregar();
          }}
        />
      )}
    </div>
  );
}

function CicloAberto({ ciclo, ciclos, onEscolher, podeCriarNova, onNova, onCicloAlterado }: { ciclo: CicloLnt; ciclos: CicloLnt[]; onEscolher: (id: number) => void; podeCriarNova: boolean; onNova: () => void; onCicloAlterado: () => void }) {
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  const fechado = ciclo.status === "fechada";
  const podeEditar = ehRH && !fechado;
  const dadosQ = useConsulta(() => carregarDadosCiclo(ciclo.id), [ciclo.id]);
  const [subvisao, setSubvisao] = useState<Subvisao>("base");
  const [carga, setCarga] = useState<"carregar" | "atualizar" | null>(null);
  const [fechando, setFechando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  // Quem fechou: a auditoria só é legível pelo RH. Para os demais perfis mostramos só a data.
  const quemFechou = useConsulta(async () => {
    if (!fechado || !ehRH) return null;
    const ev = (await eventosDaLnt("ciclo", ciclo.id)).find((e) => e.acao === "lnt_ciclo_fechado");
    return ev?.colaborador_id != null ? (pessoaPorId.get(ev.colaborador_id)?.nome ?? null) : null;
  }, [ciclo.id, fechado, ciclo.fechada_em, ehRH]);

  const dados = dadosQ.dados;
  const ind = useMemo(() => (dados ? indicadoresDe(dados) : null), [dados]);
  const semCandidatas = dados ? dados.linhas.length === 0 : false;
  const recarregar = () => {
    dadosQ.recarregar();
  };

  const contagem = (s: Subvisao) =>
    !dados || !ind ? null : s === "base" ? ind.a_decidir : s === "consolidada" ? dados.itens.filter((i) => i.situacao !== "nao_priorizado").length : ind.nao_priorizadas + ind.itens_nao_priorizados;
  const rotuloSub = (s: Subvisao, nome: string) => (contagem(s) == null ? nome : `${nome} (${contagem(s)})`);

  return (
    <>
      <Card>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>
              {ciclo.titulo} <Selo tom={ROTULO_STATUS_CICLO[ciclo.status].tom}>{ROTULO_STATUS_CICLO[ciclo.status].rotulo}</Selo>
            </h3>
            <p className={styles.cardSubtitle}>
              Levantamento {ciclo.ano_levantamento} · Planejamento {ciclo.ano_planejamento} · Data de corte {dataCurta(ciclo.data_corte)}
            </p>
            {ciclo.observacao && <p className={styles.cardSubtitle}>{ciclo.observacao}</p>}
            {ciclos.length > 1 && (
              <select className={styles.select} style={{ marginTop: 8 }} value={ciclo.id} onChange={(e) => onEscolher(Number(e.target.value))} aria-label="Escolher LNT">
                {ciclos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo} · {ROTULO_STATUS_CICLO[c.status].rotulo}
                  </option>
                ))}
              </select>
            )}
          </div>
          {ehRH && (
            <div className={styles.acoes} style={{ flexWrap: "wrap" }}>
              {!fechado && semCandidatas && dados && (
                <Button variant="primary" icon={<ClipboardList size={16} />} onClick={() => setCarga("carregar")}>
                  Carregar candidatas
                </Button>
              )}
              {!fechado && !semCandidatas && dados && (
                <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => setCarga("atualizar")}>
                  Atualizar candidatas
                </Button>
              )}
              {!fechado && dados && (
                <Button variant="primary" icon={<Lock size={16} />} disabled={semCandidatas && dados.itens.length === 0} onClick={() => setFechando(true)}>
                  Fechar LNT
                </Button>
              )}
              {fechado && (
                <Button variant="secondary" onClick={() => setReabrindo(true)}>
                  Reabrir LNT
                </Button>
              )}
              {podeCriarNova && (
                <Button variant="ghost" icon={<Plus size={16} />} onClick={onNova}>
                  Nova LNT
                </Button>
              )}
            </div>
          )}
        </div>
        {fechado && (
          <div className={styles.nota}>
            LNT fechada em {dataCurta(ciclo.fechada_em)}
            {quemFechou.dados ? ` por ${quemFechou.dados}` : ""}. Esta tela está somente para consulta
            {ehRH ? "; para alterar, reabra a LNT" : ""}.{ciclo.reaberturas > 0 ? ` Já foi reaberta ${plural(ciclo.reaberturas, "vez", "vezes")}.` : ""}
          </div>
        )}
        {!ehRH && <div className={styles.dica}>Você vê as necessidades da sua equipe e a decisão da RH sobre elas. Somente a RH altera a LNT.</div>}
      </Card>

      {dadosQ.erro ? (
        <Card>
          <Erro mensagem={dadosQ.erro} />
        </Card>
      ) : !dados || !ind ? (
        <Card>
          <Carregando />
        </Card>
      ) : (
        <>
          <div className={styles.indicadores}>
            <Indicador valor={ind.candidatas} rotulo="Candidatas" />
            <Indicador valor={ind.a_decidir} rotulo="A decidir" destaque={ind.a_decidir > 0 && podeEditar} />
            <Indicador valor={ind.pessoas_impactadas} rotulo="Pessoas impactadas" />
            <Indicador valor={ind.departamentos_envolvidos} rotulo="Departamentos envolvidos" />
            <Indicador valor={ind.itens_incluidos} rotulo="Itens incluídos" />
            <Indicador valor={ind.itens_consolidados} rotulo="Consolidados" dica="Itens com 2 ou mais necessidades" />
          </div>

          <div className={styles.alternador} role="tablist" aria-label="Visões da LNT">
            {(
              [
                ["base", "Base para análise"],
                ["consolidada", "LNT consolidada"],
                ["nao_priorizadas", "Não priorizadas"],
              ] as [Subvisao, string][]
            ).map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={id === subvisao} className={id === subvisao ? styles.alternadorAtiva : styles.alternadorOpcao} onClick={() => setSubvisao(id)}>
                {rotuloSub(id, nome)}
              </button>
            ))}
          </div>

          {subvisao === "base" && <LntBase ciclo={ciclo} dados={dados} podeEditar={podeEditar} recarregar={recarregar} />}
          {subvisao === "consolidada" && <LntItens ciclo={ciclo} dados={dados} podeEditar={podeEditar} recarregar={recarregar} />}
          {subvisao === "nao_priorizadas" && <LntNaoPriorizadas ciclo={ciclo} dados={dados} podeEditar={podeEditar} recarregar={recarregar} />}
        </>
      )}

      {ehRH && carga && dados && (
        <CargaDrawer
          ciclo={ciclo}
          modo={carga}
          onFechar={() => setCarga(null)}
          onConcluida={() => {
            setCarga(null);
            recarregar();
          }}
        />
      )}
      {ehRH && fechando && dados && (
        <FecharDrawer
          ciclo={ciclo}
          dados={dados}
          onFechar={() => setFechando(false)}
          onFechada={() => {
            setFechando(false);
            flash("LNT fechada.");
            onCicloAlterado();
          }}
        />
      )}
      {ehRH && reabrindo && (
        <ReabrirDrawer
          ciclo={ciclo}
          onFechar={() => setReabrindo(false)}
          onReaberta={() => {
            setReabrindo(false);
            flash("LNT reaberta.");
            onCicloAlterado();
          }}
        />
      )}
    </>
  );
}

function Indicador({ valor, rotulo, dica, destaque }: { valor: number; rotulo: string; dica?: string; destaque?: boolean }) {
  return (
    <div className={[styles.indicador, destaque ? styles.indicadorDestaque : ""].join(" ")} title={dica}>
      <strong>{valor}</strong>
      <span>{rotulo}</span>
    </div>
  );
}

// ── Criar LNT (duas etapas: preencher e confirmar) ──────────────────────
function CriarCicloDrawer({ onFechar, onCriado }: { onFechar: () => void; onCriado: (c: CicloLnt) => void }) {
  const { flash } = useToast();
  const hoje = new Date();
  const [levantamento, setLevantamento] = useState(String(hoje.getFullYear()));
  const [planejamento, setPlanejamento] = useState(String(hoje.getFullYear() + 1));
  const [corte, setCorte] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`);
  const [titulo, setTitulo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [etapa, setEtapa] = useState<"form" | "confirmar">("form");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const tituloFinal = titulo.trim() || `LNT ${planejamento}`;

  async function criar() {
    setErro(null);
    setSalvando(true);
    try {
      const c = await lnt.criarCiclo({ ano_planejamento: Number(planejamento), ano_levantamento: Number(levantamento), data_corte: corte, titulo: titulo.trim() || undefined, observacao: observacao.trim() || undefined });
      flash("LNT criada.");
      onCriado(c);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEtapa("form");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="LNT" titulo="Criar LNT" sub="Levantamento de Necessidades de Treinamento e Desenvolvimento" />}>
      {etapa === "form" ? (
        <form
          className={styles.secao}
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            if (Number(levantamento) >= Number(planejamento)) return setErro("O ano do levantamento deve ser anterior ao ano do planejamento.");
            setEtapa("confirmar");
          }}
        >
          <div className={styles.grid}>
            <label className={styles.campo}>
              Ano de levantamento *
              <input type="number" min={2000} max={2100} value={levantamento} onChange={(e) => setLevantamento(e.target.value)} required />
            </label>
            <label className={styles.campo}>
              Ano de planejamento *
              <input type="number" min={2000} max={2100} value={planejamento} onChange={(e) => setPlanejamento(e.target.value)} required />
            </label>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Data de corte *
              <input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} required />
            </label>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Título
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder={`LNT ${planejamento}`} />
            </label>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Observação (opcional)
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} />
            </label>
          </div>
          <span className={styles.dica}>A data de corte define até quando as necessidades validadas entram como candidatas. Necessidades validadas antes do período também entram.</span>
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button type="submit" variant="primary">
              Revisar
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Confirme a criação</h4>
          <dl className={styles.detalhe}>
            <dt>Título</dt>
            <dd>{tituloFinal}</dd>
            <dt>Levantamento</dt>
            <dd>{levantamento}</dd>
            <dt>Planejamento</dt>
            <dd>{planejamento}</dd>
            <dt>Data de corte</dt>
            <dd>{dataCurta(corte)}</dd>
          </dl>
          <div className={styles.nota}>Criar a LNT não carrega nenhuma necessidade. As candidatas só entram quando você escolher “Carregar candidatas”.</div>
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button variant="ghost" onClick={() => setEtapa("form")} disabled={salvando}>
              Voltar
            </Button>
            <Button variant="primary" onClick={() => void criar()} disabled={salvando}>
              {salvando ? "Criando..." : "Confirmar criação"}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Carregar / atualizar candidatas ─────────────────────────────────────
function CargaDrawer({ ciclo, modo, onFechar, onConcluida }: { ciclo: CicloLnt; modo: "carregar" | "atualizar"; onFechar: () => void; onConcluida: () => void }) {
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const primeira = modo === "carregar";

  async function executar() {
    setErro(null);
    setProcessando(true);
    try {
      setResultado(await (primeira ? lnt.carregarCandidatas(ciclo.id) : lnt.atualizarCandidatas(ciclo.id)));
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Drawer onClose={resultado ? onConcluida : onFechar} header={<CabecalhoDrawer eyebrow="LNT" titulo={primeira ? "Carregar candidatas" : "Atualizar candidatas"} sub={`Data de corte ${dataCurta(ciclo.data_corte)}`} />}>
      {!resultado ? (
        <div className={styles.secao}>
          <ul className={styles.listaRegras}>
            <li>
              Entram as necessidades <strong>validadas</strong> e as <strong>planejadas</strong>, aprovadas até a data de corte.
            </li>
            <li>Necessidades planejadas entram com o alerta “Treinamento já planejado”, para você decidir.</li>
            <li>Não entram necessidades sugeridas, atendidas, canceladas, de colaboradores desligados ou aprovadas depois da data de corte.</li>
            {!primeira && <li>As candidatas que já estão na LNT não são removidas nem alteradas. Se uma necessidade mudou na Base, a LNT apenas avisa.</li>}
          </ul>
          <span className={styles.dica}>A LNT guarda uma fotografia de cada necessidade na data da carga. Nada é alterado na Base de Necessidades.</span>
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button variant="ghost" onClick={onFechar} disabled={processando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void executar()} disabled={processando}>
              {processando ? "Processando..." : primeira ? "Carregar candidatas" : "Atualizar candidatas"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Resultado</h4>
          <dl className={styles.detalhe}>
            <dt>{primeira ? "Carregadas" : "Novas"}</dt>
            <dd>{plural(resultado.novas, "necessidade", "necessidades")}</dd>
            {!primeira && (
              <>
                <dt>Já estavam</dt>
                <dd>{resultado.ja_no_ciclo}</dd>
                <dt>Atualizadas na Base</dt>
                <dd>{plural(resultado.mudancas_marcadas, "necessidade marcada", "necessidades marcadas")}</dd>
              </>
            )}
            {resultado.nao_carregadas.colaborador_desligado > 0 && (
              <>
                <dt>Não entraram</dt>
                <dd>{plural(resultado.nao_carregadas.colaborador_desligado, "de colaborador desligado", "de colaboradores desligados")}</dd>
              </>
            )}
            {resultado.nao_carregadas.apos_corte > 0 && (
              <>
                <dt>Após o corte</dt>
                <dd>{plural(resultado.nao_carregadas.apos_corte, "necessidade", "necessidades")}</dd>
              </>
            )}
            {resultado.planejadas_sem_treinamento_localizado > 0 && (
              <>
                <dt>Atenção</dt>
                <dd>{plural(resultado.planejadas_sem_treinamento_localizado, "necessidade planejada sem treinamento localizado", "necessidades planejadas sem treinamento localizado")}</dd>
              </>
            )}
            {resultado.ciclo_fechado && (
              <>
                <dt>Ciclo fechado</dt>
                <dd>Só foram marcadas as mudanças; nenhuma candidata nova entra com a LNT fechada.</dd>
              </>
            )}
          </dl>
          <div className={styles.acoes}>
            <Button variant="primary" onClick={onConcluida}>
              Concluir
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Fechar LNT ──────────────────────────────────────────────────────────
function FecharDrawer({ ciclo, dados, onFechar, onFechada }: { ciclo: CicloLnt; dados: DadosCiclo; onFechar: () => void; onFechada: () => void }) {
  const ind = indicadoresDe(dados);
  const pendencias = pendenciasDe(dados);
  const sugeridas = useConsulta(() => contarSugeridasAguardando(), []);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const candidatas = candidatasDe(dados).length;

  async function fechar() {
    setErro(null);
    setProcessando(true);
    try {
      await lnt.fecharCiclo(ciclo.id);
      onFechada();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow={ciclo.titulo} titulo="Fechar LNT" sub="Depois de fechada, a LNT fica somente para consulta" />}>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Resumo</h4>
        <dl className={styles.detalhe}>
          <dt>Itens incluídos</dt>
          <dd>{ind.itens_incluidos}</dd>
          <dt>Não priorizadas</dt>
          <dd>{plural(ind.nao_priorizadas + ind.itens_nao_priorizados, "decisão", "decisões")}</dd>
          <dt>Pessoas impactadas</dt>
          <dd>{ind.pessoas_impactadas}</dd>
          <dt>Departamentos</dt>
          <dd>{ind.departamentos_envolvidos}</dd>
          {(sugeridas.dados ?? 0) > 0 && (
            <>
              <dt>Aguardando validação</dt>
              <dd>{plural(sugeridas.dados ?? 0, "necessidade sugerida", "necessidades sugeridas")} na Base (não entram na LNT)</dd>
            </>
          )}
        </dl>
      </div>
      {pendencias.length > 0 ? (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>O que falta resolver</h4>
          <div className={styles.alertaPendencia}>
            {pendencias.map((p) => (
              <div key={p.codigo}>{textoPendencia(p)}</div>
            ))}
          </div>
          <span className={styles.dica}>
            {candidatas > 0 ? "Consolide ou não priorize as candidatas restantes na “Base para análise”. " : ""}
            {pendencias.some((p) => p.codigo === "itens_em_analise") ? "Inclua ou não priorize os itens em análise na “LNT consolidada”. " : ""}
            {pendencias.some((p) => p.codigo === "itens_incluidos_sem_necessidade") ? "Um item incluído precisa de ao menos uma necessidade: acrescente necessidades ou não priorize o item. " : ""}
          </span>
          <div className={styles.acoes}>
            <Button variant="secondary" onClick={onFechar}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.secao}>
          <div className={styles.nota}>Tudo decidido. Ao fechar, a LNT fica somente para consulta; você poderá reabri-la informando um motivo.</div>
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button variant="ghost" onClick={onFechar} disabled={processando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void fechar()} disabled={processando}>
              {processando ? "Fechando..." : "Fechar LNT"}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Reabrir LNT ─────────────────────────────────────────────────────────
function ReabrirDrawer({ ciclo, onFechar, onReaberta }: { ciclo: CicloLnt; onFechar: () => void; onReaberta: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow={ciclo.titulo} titulo="Reabrir LNT" sub="A LNT volta a aceitar decisões" />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setProcessando(true);
          try {
            await lnt.reabrirCiclo(ciclo.id, motivo.trim());
            onReaberta();
          } catch (err) {
            setErro(mensagemDeErro(err));
          } finally {
            setProcessando(false);
          }
        }}
      >
        <label className={styles.campo}>
          Motivo da reabertura *
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} required autoFocus />
        </label>
        <span className={styles.dica}>O motivo, a data e o responsável ficam registrados. A reabertura é contada no histórico da LNT.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="button" variant="ghost" onClick={onFechar} disabled={processando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={processando || !motivo.trim()}>
            {processando ? "Reabrindo..." : "Reabrir LNT"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
