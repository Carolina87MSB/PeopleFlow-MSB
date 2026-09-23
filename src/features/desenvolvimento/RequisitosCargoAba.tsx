import { useMemo, useState } from "react";
import { Briefcase, Lightbulb, Plus } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import {
  gravar,
  listarRequisitosDoCargo,
  obterRequisito,
  opcoesHabilidades,
  opcoesListaMestra,
  type RequisitoCargo,
  type StatusRequisito,
} from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData, formatarPeriodicidade, type Tom } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const STATUS: Record<StatusRequisito, { rotulo: string; tom: Tom }> = {
  sugerido: { rotulo: "Sugerido", tom: "warning" },
  vigente: { rotulo: "Vigente", tom: "success" },
  inativo: { rotulo: "Inativo", tom: "neutral" },
};
const ORIGEM: Record<RequisitoCargo["origem"], string> = { rh: "RH", gestor: "Sugestão do gestor", importacao: "Importação" };

const FILTROS_RH: { rotulo: string; status: StatusRequisito[] }[] = [
  { rotulo: "Vigentes e sugeridos", status: ["vigente", "sugerido"] },
  { rotulo: "Sugeridos", status: ["sugerido"] },
  { rotulo: "Inativos", status: ["inativo"] },
  { rotulo: "Todos", status: ["vigente", "sugerido", "inativo"] },
];

function descricaoRequisito(r: RequisitoCargo): { principal: string; detalhe?: string } {
  if (r.tipo_requisito === "habilidade") return r.habilidade ? { principal: r.habilidade.nome } : { principal: r.descricao_sugerida ?? "—", detalhe: "Fora do catálogo" };
  if (r.lista_mestra_codigo) return { principal: r.lista_mestra_codigo, detalhe: r.lista_mestra?.titulo };
  return { principal: r.descricao_sugerida ?? "—", detalhe: "Fora da Lista Mestra" };
}

type Selecao = { modo: "novo" } | { modo: "existente"; item: RequisitoCargo };

export function RequisitosCargoAba() {
  const { perfil, pessoas } = useDesenvolvimento();
  const { state } = usePortalStore();
  const ehRH = perfil === "RH";
  // Fonte oficial de cargo: Descrição de Cargo (não obsoleta). Gestor vê só os cargos ocupados pela própria equipe.
  const cargos = useMemo(() => {
    const cargosEquipe = new Set(pessoas.map((p) => p.cargo));
    return state.descricoesCargo
      .filter((d) => !d.obsoleto && (ehRH || cargosEquipe.has(d.cargoNome)))
      .map((d) => d.cargoNome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [state.descricoesCargo, pessoas, ehRH]);
  const [cargo, setCargo] = useState("");
  const selecionado = cargos.includes(cargo) ? cargo : "";
  const [filtro, setFiltro] = useState(FILTROS_RH[0].rotulo);
  const status: StatusRequisito[] = ehRH ? FILTROS_RH.find((f) => f.rotulo === filtro)!.status : ["vigente", "sugerido"];
  const lista = useConsulta(() => (selecionado ? listarRequisitosDoCargo(selecionado, status) : Promise.resolve([])), [selecionado, status.join()]);
  const [selecao, setSelecao] = useState<Selecao | null>(null);

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Requisitos por cargo</h3>
          <p className={styles.cardSubtitle}>
            {ehRH ? "Habilidades técnicas e treinamentos/POPs exigidos pelo cargo" : "Requisitos vigentes dos cargos da sua equipe e as suas sugestões"}
          </p>
        </div>
        <Button
          variant="primary"
          icon={ehRH ? <Plus size={16} /> : <Lightbulb size={16} />}
          disabled={!selecionado}
          onClick={() => setSelecao({ modo: "novo" })}
          title={selecionado ? undefined : "Selecione um cargo"}
        >
          {ehRH ? "Novo requisito" : "Sugerir requisito"}
        </Button>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.filtros}>
          <select className={styles.select} value={selecionado} onChange={(e) => setCargo(e.target.value)} aria-label="Cargo">
            <option value="">Selecione um cargo</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {ehRH && selecionado && <FilterChips options={FILTROS_RH.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />}
      </div>

      {!selecionado ? (
        <EstadoVazio
          icone={<Briefcase size={26} strokeWidth={1.6} />}
          titulo={cargos.length ? "Selecione um cargo para ver os requisitos." : "Nenhum cargo com Descrição de Cargo disponível."}
        />
      ) : lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.length === 0 ? (
        <EstadoVazio icone={<Briefcase size={26} strokeWidth={1.6} />} titulo="Nenhum requisito cadastrado para este cargo." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Requisito</th>
                <th>Obrigatório</th>
                <th>Periodicidade</th>
                <th>Origem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.map((r) => {
                const d = descricaoRequisito(r);
                return (
                  <tr key={r.id} className={[styles.linhaClicavel, r.status === "inativo" ? styles.linhaInativa : ""].join(" ")} onClick={() => setSelecao({ modo: "existente", item: r })}>
                    <td className={styles.secundario}>{r.tipo_requisito === "habilidade" ? "Habilidade" : "Treinamento/POP"}</td>
                    <td>
                      {d.principal}
                      {d.detalhe && <div className={styles.secundario}>{d.detalhe}</div>}
                    </td>
                    <td>{r.obrigatorio ? "Sim" : "Não"}</td>
                    <td className={styles.secundario}>{r.tipo_requisito === "treinamento" ? formatarPeriodicidade(r.periodicidade_meses ?? r.lista_mestra?.periodicidade_meses) : "—"}</td>
                    <td className={styles.secundario}>{ORIGEM[r.origem]}</td>
                    <td>
                      <Selo tom={STATUS[r.status].tom}>{STATUS[r.status].rotulo}</Selo>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selecao && selecionado && (
        <RequisitoDrawer
          key={selecao.modo === "novo" ? "novo" : selecao.item.id}
          cargo={selecionado}
          item={selecao.modo === "novo" ? null : selecao.item}
          onFechar={() => setSelecao(null)}
          onSalvo={(r, criado) => {
            if (criado || !status.includes(r.status)) lista.recarregar();
            else lista.mutar((itens) => itens.map((i) => (i.id === r.id ? r : i)));
            setSelecao({ modo: "existente", item: r });
          }}
        />
      )}
    </Card>
  );
}

function RequisitoDrawer({ cargo, item, onFechar, onSalvo }: { cargo: string; item: RequisitoCargo | null; onFechar: () => void; onSalvo: (r: RequisitoCargo, criado: boolean) => void }) {
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  const novo = item === null;
  const editavel = ehRH || novo; // Gestor só cria sugestão; requisito existente é somente leitura para ele.
  const habilidades = useConsulta(() => (editavel ? opcoesHabilidades() : Promise.resolve([])), [editavel]);
  const documentos = useConsulta(() => (editavel ? opcoesListaMestra() : Promise.resolve([])), [editavel]);
  const [form, setForm] = useState({
    tipo_requisito: item?.tipo_requisito ?? "habilidade",
    habilidade_id: item?.habilidade_id?.toString() ?? "",
    lista_mestra_codigo: item?.lista_mestra_codigo ?? "",
    descricao_sugerida: item?.descricao_sugerida ?? "",
    fora_do_catalogo: Boolean(item && !item.habilidade_id && !item.lista_mestra_codigo),
    obrigatorio: item?.obrigatorio ?? true,
    periodicidade_meses: item?.periodicidade_meses?.toString() ?? "",
    observacao: item?.observacao ?? "",
    justificativa: item?.justificativa ?? "",
    status: "sugerido" as "sugerido" | "vigente",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const docSelecionado = (documentos.dados ?? []).find((d) => d.codigo === form.lista_mestra_codigo);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function executar(fn: () => Promise<RequisitoCargo>, msg: string, criado = false) {
    setErro(null);
    setSalvando(true);
    try {
      const bruto = await fn();
      const completo = (await obterRequisito(bruto.id)) ?? bruto;
      flash(msg);
      onSalvo(completo, criado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSalvando(false);
    }
  }

  function corpo() {
    const semCatalogo = form.fora_do_catalogo;
    return {
      id: item?.id ?? null,
      cargo_nome: cargo,
      tipo_requisito: form.tipo_requisito,
      habilidade_id: form.tipo_requisito === "habilidade" && !semCatalogo ? form.habilidade_id || null : null,
      lista_mestra_codigo: form.tipo_requisito === "treinamento" && !semCatalogo ? form.lista_mestra_codigo || null : null,
      descricao_sugerida: semCatalogo ? form.descricao_sugerida : null,
      obrigatorio: form.obrigatorio,
      periodicidade_meses: form.tipo_requisito === "treinamento" ? form.periodicidade_meses : null,
      observacao: form.observacao,
      justificativa: form.justificativa,
      ...(novo && ehRH ? { status: form.status } : {}),
    };
  }

  const titulo = novo ? (ehRH ? "Novo requisito" : "Sugerir requisito") : descricaoRequisito(item).principal;
  const sugeridoPor = item?.sugerido_por_colaborador_id ? (pessoaPorId.get(item.sugerido_por_colaborador_id)?.nome ?? `Colaborador #${item.sugerido_por_colaborador_id}`) : null;
  // Sugestão do gestor: RH pode vincular o item do catálogo, mas a justificativa original é preservada.
  const justificativaTravada = !novo && item.origem === "gestor";

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Requisito do cargo" titulo={titulo} sub={cargo} />}>
      {!novo && (
        <div className={styles.secao}>
          <dl className={styles.detalhe}>
            <dt>Status</dt>
            <dd>
              <Selo tom={STATUS[item.status].tom}>{STATUS[item.status].rotulo}</Selo>
            </dd>
            <dt>Origem</dt>
            <dd>{ORIGEM[item.origem]}</dd>
            {sugeridoPor && (
              <>
                <dt>Sugerido por</dt>
                <dd>{sugeridoPor}</dd>
              </>
            )}
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
            <dt>Criado em</dt>
            <dd>{formatarData(item.created_at)}</dd>
            <dt>Atualizado em</dt>
            <dd>{formatarData(item.updated_at)}</dd>
            {item.validado_em && (
              <>
                <dt>Validado em</dt>
                <dd>{formatarData(item.validado_em)}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {editavel ? (
        <form
          className={styles.secao}
          onSubmit={(e) => {
            e.preventDefault();
            const acao = novo && !ehRH ? "requisito_sugerir" : "requisito_salvar";
            const msg = novo ? (ehRH ? "Requisito cadastrado." : "Sugestão enviada ao RH.") : "Requisito atualizado.";
            void executar(() => gravar<RequisitoCargo>(acao, corpo()), msg, novo).catch(() => undefined);
          }}
        >
          <h4 className={styles.secaoTitulo}>{novo ? "Requisito" : "Editar requisito"}</h4>
          <div className={styles.grid}>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Tipo *
              <select value={form.tipo_requisito} onChange={set("tipo_requisito")} disabled={!novo && item.status === "vigente"}>
                <option value="habilidade">Habilidade técnica</option>
                <option value="treinamento">Treinamento / POP obrigatório</option>
              </select>
            </label>
            {!form.fora_do_catalogo &&
              (form.tipo_requisito === "habilidade" ? (
                <label className={[styles.campo, styles.cheio].join(" ")}>
                  Habilidade do catálogo *
                  <select value={form.habilidade_id} onChange={set("habilidade_id")} required>
                    <option value="">{habilidades.carregando ? "Carregando..." : "Selecione"}</option>
                    {(habilidades.dados ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nome}
                        {h.categoria ? ` — ${h.categoria}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={[styles.campo, styles.cheio].join(" ")}>
                  Documento da Lista Mestra *
                  <select value={form.lista_mestra_codigo} onChange={set("lista_mestra_codigo")} required>
                    <option value="">{documentos.carregando ? "Carregando..." : "Selecione"}</option>
                    {(documentos.dados ?? []).map((d) => (
                      <option key={d.codigo} value={d.codigo}>
                        {d.codigo} — {d.titulo}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            {form.fora_do_catalogo && (
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Descreva o requisito *
                <input value={form.descricao_sugerida} onChange={set("descricao_sugerida")} maxLength={500} required />
              </label>
            )}
            {(novo || item.status === "sugerido") && (
              <label className={[styles.check, styles.cheio].join(" ")}>
                <input type="checkbox" checked={form.fora_do_catalogo} onChange={set("fora_do_catalogo")} />
                {form.tipo_requisito === "habilidade" ? "A habilidade ainda não está no catálogo" : "O documento ainda não está na Lista Mestra"}
              </label>
            )}
            {form.tipo_requisito === "treinamento" && (
              <label className={styles.campo}>
                Periodicidade (meses)
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={form.periodicidade_meses}
                  onChange={set("periodicidade_meses")}
                  placeholder={docSelecionado?.periodicidade_meses ? `Padrão: ${docSelecionado.periodicidade_meses}` : "Sem validade"}
                />
              </label>
            )}
            <label className={[styles.check, form.tipo_requisito === "treinamento" ? "" : styles.cheio].join(" ")} style={{ alignSelf: "end", paddingBottom: 10 }}>
              <input type="checkbox" checked={form.obrigatorio} onChange={set("obrigatorio")} />
              Obrigatório para o cargo
            </label>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              {ehRH ? "Justificativa" : "Justificativa *"}
              <textarea value={form.justificativa} onChange={set("justificativa")} maxLength={2000} required={!ehRH} disabled={justificativaTravada} />
            </label>
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Observação
              <textarea value={form.observacao} onChange={set("observacao")} maxLength={2000} />
            </label>
            {novo && ehRH && (
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Status inicial
                <select value={form.status} onChange={set("status")}>
                  <option value="sugerido">Sugerido (aguarda validação)</option>
                  <option value="vigente" disabled={form.fora_do_catalogo}>
                    Vigente (validado pelo RH)
                  </option>
                </select>
              </label>
            )}
          </div>
          {!ehRH && <span className={styles.dica}>A sugestão entra como “Sugerido” e só passa a valer depois da validação do RH.</span>}
          {erro && <Erro mensagem={erro} />}
          <div className={styles.acoes}>
            <Button type="submit" variant="primary" disabled={salvando}>
              {salvando ? "Salvando..." : novo ? (ehRH ? "Cadastrar" : "Enviar sugestão") : "Salvar alterações"}
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.secao}>
          <dl className={styles.detalhe}>
            <dt>Obrigatório</dt>
            <dd>{item.obrigatorio ? "Sim" : "Não"}</dd>
            {item.tipo_requisito === "treinamento" && (
              <>
                <dt>Periodicidade</dt>
                <dd>{formatarPeriodicidade(item.periodicidade_meses ?? item.lista_mestra?.periodicidade_meses)}</dd>
              </>
            )}
            {item.observacao && (
              <>
                <dt>Observação</dt>
                <dd>{item.observacao}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {!novo && ehRH && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Validação</h4>
          <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
            {item.status === "sugerido" && (
              <>
                <ConfirmarComMotivo
                  rotulo="Validar como vigente"
                  confirmar="Validar"
                  variante="success"
                  motivoObrigatorio={false}
                  desabilitado={!item.habilidade_id && !item.lista_mestra_codigo}
                  onConfirmar={(motivo) => executar(() => gravar<RequisitoCargo>("requisito_status", { id: item.id, status: "vigente", motivo }), "Requisito validado como vigente.")}
                />
                <ConfirmarComMotivo
                  rotulo="Rejeitar"
                  confirmar="Rejeitar sugestão"
                  variante="danger"
                  motivoObrigatorio
                  onConfirmar={(motivo) => executar(() => gravar<RequisitoCargo>("requisito_status", { id: item.id, status: "inativo", motivo }), "Sugestão rejeitada.")}
                />
              </>
            )}
            {item.status === "vigente" && (
              <ConfirmarComMotivo
                rotulo="Inativar requisito"
                confirmar="Inativar"
                variante="danger"
                motivoObrigatorio
                onConfirmar={(motivo) => executar(() => gravar<RequisitoCargo>("requisito_status", { id: item.id, status: "inativo", motivo }), "Requisito inativado.")}
              />
            )}
            {item.status === "inativo" && (
              <ConfirmarComMotivo
                rotulo="Reativar como vigente"
                confirmar="Reativar"
                variante="success"
                motivoObrigatorio={false}
                desabilitado={!item.habilidade_id && !item.lista_mestra_codigo}
                onConfirmar={(motivo) => executar(() => gravar<RequisitoCargo>("requisito_status", { id: item.id, status: "vigente", motivo }), "Requisito reativado.")}
              />
            )}
          </div>
          {item.status !== "vigente" && !item.habilidade_id && !item.lista_mestra_codigo && (
            <span className={styles.dica}>Para validar, edite o requisito e vincule a habilidade do catálogo ou o documento da Lista Mestra.</span>
          )}
        </div>
      )}
    </Drawer>
  );
}
