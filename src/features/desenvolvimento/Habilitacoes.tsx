import { useMemo, useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { gravar, listarHabilitacoes, opcoesHabilitacao, type Habilitacao, type OpcaoHabilitacao, type PendenteDe } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import { HistoricoSolicitacoes, SolicitarHabilitacao } from "./SolicitacoesHabilitacao";
import styles from "./Desenvolvimento.module.css";

const MOTIVOS_TRANSFERENCIA = [
  { valor: "revogacao", rotulo: "Revogação da habilitação" },
  { valor: "desligamento", rotulo: "Desligamento" },
  { valor: "mudanca_responsabilidade", rotulo: "Mudança de responsabilidade" },
  { valor: "outro", rotulo: "Outro" },
] as const;

/** Quem pode receber a responsabilidade: colaboradores com habilitação ativa e integrantes do RH (o servidor confere de novo). */
function destinosDe(habilitados: Habilitacao[], opcoes: OpcaoHabilitacao[] | null) {
  const mapa = new Map<number, string>();
  for (const h of habilitados) if (h.ativa) mapa.set(h.colaborador.id, `${h.colaborador.nome} (habilitado)`);
  for (const o of opcoes ?? []) if (o.departamento === "Recursos Humanos") mapa.set(o.id, `${o.nome} (RH)`);
  return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
}

/** Áreas e lideranças: uma opção por liderança (quem aparece como gestor de alguém), com as áreas que ela lidera — nada de lista indistinta de colaboradores. */
function liderancasDe(opcoes: OpcaoHabilitacao[] | null) {
  const porId = new Map((opcoes ?? []).map((o) => [o.id, o]));
  const areas = new Map<number, Set<string>>();
  for (const o of opcoes ?? []) {
    if (!o.gestor_id || !porId.has(o.gestor_id)) continue;
    areas.set(o.gestor_id, (areas.get(o.gestor_id) ?? new Set()).add(o.departamento || o.cargo || "—"));
  }
  return [...areas.entries()]
    .map(([id, set]) => {
      const lista = [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
      const area = lista.length > 3 ? `${lista.slice(0, 3).join(", ")} e mais ${lista.length - 3}` : lista.join(", ");
      return { id, area, nome: porId.get(id)!.nome };
    })
    .sort((a, b) => a.area.localeCompare(b.area, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** RH: transfere o responsável principal de um treinamento pendente, com motivo e histórico. */
export function TransferirResponsabilidade({ treinamentoId, tipoSugerido = "mudanca_responsabilidade", onTransferido }: { treinamentoId: number; tipoSugerido?: (typeof MOTIVOS_TRANSFERENCIA)[number]["valor"]; onTransferido: () => void }) {
  const { flash } = useToast();
  const hab = useConsulta(() => listarHabilitacoes(), []);
  const opc = useConsulta(() => opcoesHabilitacao(), []);
  const [para, setPara] = useState("");
  const [tipo, setTipo] = useState<string>(tipoSugerido);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const destinos = useMemo(() => destinosDe(hab.dados ?? [], opc.dados), [hab.dados, opc.dados]);
  return (
    <form
      className={styles.secao}
      onSubmit={async (e) => {
        e.preventDefault();
        setErro(null);
        setSalvando(true);
        try {
          await gravar("treinamento_transferir", { treinamento_id: treinamentoId, para_colaborador_id: Number(para), motivo_tipo: tipo, motivo });
          flash("Responsabilidade transferida.");
          onTransferido();
        } catch (err) {
          setErro(err instanceof Error ? err.message : String(err));
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className={styles.grid}>
        <label className={styles.campo}>
          Novo responsável principal *
          <select value={para} onChange={(e) => setPara(e.target.value)} required>
            <option value="">Selecione</option>
            {destinos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.campo}>
          Tipo do motivo *
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {MOTIVOS_TRANSFERENCIA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Motivo *
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} required placeholder="Fica registrado no histórico da transferência" />
        </label>
      </div>
      <p className={styles.dica}>Só treinamentos pendentes (planejado ou em andamento). Quem registrou o treinamento e o instrutor não mudam; os concluídos permanecem como estão.</p>
      {erro && <Erro mensagem={erro} />}
      <div className={styles.acoes}>
        <Button type="submit" variant="primary" disabled={!para || !motivo.trim() || salvando}>
          {salvando ? "Transferindo..." : "Transferir responsabilidade"}
        </Button>
      </div>
    </form>
  );
}

/** Habilitações (RH habilita e revoga; a liderança acompanha a sua gestão em somente leitura). */
export function HabilitacoesDrawer({ onFechar }: { onFechar: () => void }) {
  const { perfil } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  const lista = useConsulta(() => listarHabilitacoes(), []);
  const opcoes = useConsulta(() => (ehRH ? opcoesHabilitacao() : Promise.resolve([] as OpcaoHabilitacao[])), [ehRH]);
  const [colaborador, setColaborador] = useState("");
  const [gestao, setGestao] = useState("");
  const [referencia, setReferencia] = useState("");
  const [criarAcesso, setCriarAcesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pendentes, setPendentes] = useState<{ nome: string; itens: PendenteDe[] } | null>(null);

  const liderancas = useMemo(() => liderancasDe(opcoes.dados), [opcoes.dados]);
  const candidatos = (opcoes.dados ?? []).filter((o) => !o.habilitado);
  const escolhido = candidatos.find((o) => String(o.id) === colaborador) ?? null;
  const ativas = (lista.dados ?? []).filter((h) => h.ativa);
  const historico = (lista.dados ?? []).filter((h) => !h.ativa);

  function escolher(id: string) {
    setColaborador(id);
    const o = (opcoes.dados ?? []).find((x) => String(x.id) === id);
    setGestao(o?.gestor_id ? String(o.gestor_id) : "");
    setCriarAcesso(false);
  }

  return (
    <Drawer
      onClose={onFechar}
      header={
        <CabecalhoDrawer
          eyebrow="Treinamentos"
          titulo={ehRH ? "Responsáveis habilitados" : "Habilitações da equipe"}
          sub={ehRH ? "O gestor solicita a habilitação pelo portal e o RH decide em Pendências (também é possível habilitar direto aqui). A habilitação vale até ser revogada e só dá acesso aos Treinamentos." : "Você já registra e administra os treinamentos da sua área. Aqui você solicita ao RH a habilitação de colaboradores da sua equipe e acompanha os habilitados; aprovar e revogar é do RH."}
        />
      }
    >
      <div className={styles.secao}>
        {!ehRH && <SolicitarHabilitacao />}
        {ehRH && (
          <form
            className={styles.secao}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!escolhido) return;
              setErro(null);
              setSalvando(true);
              try {
                const r = await gravar<{ id: number; acesso: "existente" | "criado" }>("habilitacao_conceder", {
                  colaborador_id: escolhido.id,
                  ...(gestao ? { gestor_colaborador_id: Number(gestao) } : {}),
                  referencia,
                  criar_acesso: criarAcesso,
                });
                flash(r.acesso === "criado" ? "Habilitado. Acesso ao portal criado (somente Treinamentos)." : "Colaborador habilitado.");
                setColaborador("");
                setGestao("");
                setReferencia("");
                setCriarAcesso(false);
                lista.recarregar();
                opcoes.recarregar();
              } catch (err) {
                setErro(err instanceof Error ? err.message : String(err));
              } finally {
                setSalvando(false);
              }
            }}
          >
            <h4 className={styles.secaoTitulo}>Habilitar colaborador</h4>
            <div className={styles.grid}>
              <label className={styles.campo}>
                Colaborador *
                <select value={colaborador} onChange={(e) => escolher(e.target.value)} required>
                  <option value="">Selecione</option>
                  {candidatos.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome} — {o.departamento || o.cargo}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.campo}>
                Área e liderança que solicitou *
                <select value={gestao} onChange={(e) => setGestao(e.target.value)} required>
                  <option value="">{escolhido && !escolhido.gestor_id ? "Escolha a área e a liderança" : "Selecione"}</option>
                  {liderancas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.area} — liderança: {l.nome}
                    </option>
                  ))}
                </select>
                {escolhido?.gestor_nome && <span className={styles.dica}>{escolhido.gestor_id ? `Já selecionada a liderança imediata cadastrada: ${escolhido.gestor_nome}.` : `Liderança imediata cadastrada: ${escolhido.gestor_nome} (não localizada de forma única; escolha acima).`}</span>}
              </label>
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Referência da solicitação da liderança *
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={500} required placeholder="Ex.: e-mail da Maria (Qualidade) ao RH, em 20/10/2026" />
              </label>
            </div>
            {escolhido && !escolhido.tem_acesso && (
              <label className={styles.check}>
                <input type="checkbox" checked={criarAcesso} onChange={(e) => setCriarAcesso(e.target.checked)} /> Criar acesso ao portal (somente Treinamentos) — {escolhido.nome.split(" ")[0]} ainda não tem conta; não recebe AVD nem outros módulos
              </label>
            )}
            {erro && <Erro mensagem={erro} />}
            <div className={styles.acoes}>
              <Button type="submit" variant="primary" disabled={!escolhido || !gestao || !referencia.trim() || salvando || (Boolean(escolhido) && !escolhido?.tem_acesso && !criarAcesso)}>
                {salvando ? "Habilitando..." : "Habilitar"}
              </Button>
            </div>
          </form>
        )}

        <h4 className={styles.secaoTitulo}>Habilitados ({ativas.length})</h4>
        {lista.erro ? (
          <Erro mensagem={lista.erro} />
        ) : lista.carregando && !lista.dados ? (
          <Carregando />
        ) : ativas.length === 0 ? (
          <p className={styles.secundario}>Nenhum colaborador habilitado.</p>
        ) : (
          <ul className={styles.historico}>
            {ativas.map((h) => (
              <li key={h.id} className={styles.itemAssociacao}>
                <div style={{ minWidth: 0 }}>
                  <strong>{h.colaborador.nome}</strong> <Selo tom="success">Habilitado</Selo>
                  <div className={styles.secundario}>
                    {h.departamento || "—"} · gestão de {h.gestao.nome} · desde {formatarData(h.habilitado_em)}
                    {h.habilitado_por ? ` · por ${h.habilitado_por}` : ""}
                  </div>
                  {h.referencia && <div className={styles.dica}>Solicitação: {h.referencia}</div>}
                </div>
                {ehRH && (
                  <ConfirmarComMotivo
                    rotulo="Revogar"
                    confirmar="Revogar habilitação"
                    variante="secondary"
                    motivoObrigatorio
                    onConfirmar={async (motivo) => {
                      setErro(null);
                      try {
                        const r = await gravar<{ ok: boolean; pendentes: PendenteDe[] }>("habilitacao_revogar", { id: h.id, motivo });
                        flash("Habilitação revogada. Os poderes de administração terminaram agora; o histórico foi mantido.");
                        setPendentes(r.pendentes.length ? { nome: h.colaborador.nome, itens: r.pendentes } : null);
                        lista.recarregar();
                        opcoes.recarregar();
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : String(e));
                        throw e;
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {ehRH && pendentes && (
          <div className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Treinamentos pendentes de {pendentes.nome}</h4>
            <p className={styles.dica}>Estes treinamentos ficaram sem responsável habilitado. Transfira cada um para outro responsável habilitado (ou do RH), com o motivo.</p>
            {pendentes.itens.map((p) => (
              <div key={p.id} className={styles.secao}>
                <strong>
                  {p.codigo} — {p.titulo}
                </strong>{" "}
                <span className={styles.secundario}>
                  ({p.papel === "responsavel" ? "responsável principal" : "instrutor"} · {p.status.replace("_", " ")})
                </span>
                {p.papel === "responsavel" ? (
                  <TransferirResponsabilidade treinamentoId={p.id} tipoSugerido="revogacao" onTransferido={() => setPendentes((cur) => (cur ? { ...cur, itens: cur.itens.filter((x) => x.id !== p.id) } : cur))} />
                ) : (
                  <p className={styles.dica}>Como instrutor, ele já não tem poderes de administração; o responsável principal segue o mesmo. Se necessário, o RH ajusta o instrutor na edição do treinamento.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {ehRH && <HistoricoSolicitacoes versao={ativas.length + historico.length} />}

        <h4 className={styles.secaoTitulo}>Histórico de revogações ({historico.length})</h4>
        {historico.length === 0 ? (
          <p className={styles.secundario}>Nenhuma habilitação revogada.</p>
        ) : (
          <ul className={styles.historico}>
            {historico.map((h) => (
              <li key={h.id}>
                <strong>{h.colaborador.nome}</strong> <Selo tom="neutral">Revogada</Selo>
                <div className={styles.secundario}>
                  gestão de {h.gestao.nome} · habilitado em {formatarData(h.habilitado_em)}
                  {h.habilitado_por ? ` por ${h.habilitado_por}` : ""} · revogado em {formatarData(h.revogado_em)}
                  {h.revogado_por ? ` por ${h.revogado_por}` : ""}
                </div>
                <div className={styles.dica}>Motivo: {h.revogado_motivo}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
