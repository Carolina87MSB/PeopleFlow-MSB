import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { gravar, listarListaMestra, revisoesListaMestra, type ItemListaMestra } from "./devRepository";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Paginacao, Selo } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import { formatarData, formatarPeriodicidade } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const FILTROS = [
  { rotulo: "Vigentes", valor: "vigente" as const },
  { rotulo: "Obsoletos", valor: "obsoleto" as const },
  { rotulo: "Todos", valor: null },
];

type Selecao = { modo: "novo" } | { modo: "existente"; item: ItemListaMestra };

export function ListaMestraAba() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState(FILTROS[0].rotulo);
  const situacao = FILTROS.find((f) => f.rotulo === filtro)!.valor;
  const lista = usePaginado((p) => listarListaMestra(p, termo, situacao), [termo, filtro]);
  const [selecao, setSelecao] = useState<Selecao | null>(null);

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Lista Mestra</h3>
          <p className={styles.cardSubtitle}>Documentos e POPs controlados, com revisão vigente e periodicidade</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setSelecao({ modo: "novo" })}>
          Novo documento
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
          <input className={styles.input} type="search" placeholder="Buscar por código ou título" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca)} />
        </form>
        <FilterChips options={FILTROS.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
      </div>

      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.itens.length === 0 ? (
        <EstadoVazio
          icone={<BookOpen size={26} strokeWidth={1.6} />}
          titulo={termo || situacao !== "vigente" ? "Nenhum documento encontrado." : "Nenhum documento cadastrado na Lista Mestra."}
          descricao={termo || situacao !== "vigente" ? undefined : "Cadastre os documentos pelo botão “Novo documento”. A importação da lista oficial do SGQ será feita em etapa própria."}
        />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Título</th>
                  <th>Revisão</th>
                  <th>Data da revisão</th>
                  <th>Periodicidade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.itens.map((d) => (
                  <tr
                    key={d.codigo}
                    className={[styles.linhaClicavel, d.situacao === "obsoleto" ? styles.linhaInativa : ""].join(" ")}
                    onClick={() => setSelecao({ modo: "existente", item: d })}
                  >
                    <td className={styles.mono}>{d.codigo}</td>
                    <td>{d.titulo}</td>
                    <td className={styles.mono}>{d.revisao_atual}</td>
                    <td className={styles.mono}>{formatarData(d.data_revisao)}</td>
                    <td className={styles.secundario}>{formatarPeriodicidade(d.periodicidade_meses)}</td>
                    <td>
                      <Selo tom={d.situacao === "vigente" ? "success" : "neutral"}>{d.situacao === "vigente" ? "Vigente" : "Obsoleto"}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={lista.pagina} total={lista.dados.total} onChange={lista.setPagina} />
        </>
      )}

      {selecao && (
        <DocumentoDrawer
          key={selecao.modo === "novo" ? "novo" : selecao.item.codigo}
          item={selecao.modo === "novo" ? null : selecao.item}
          onFechar={() => setSelecao(null)}
          onSalvo={(novo, criado) => {
            if (criado) lista.recarregar();
            else lista.atualizarItem((i) => i.codigo === novo.codigo, novo);
            setSelecao({ modo: "existente", item: novo });
          }}
        />
      )}
    </Card>
  );
}

function DocumentoDrawer({ item, onFechar, onSalvo }: { item: ItemListaMestra | null; onFechar: () => void; onSalvo: (i: ItemListaMestra, criado: boolean) => void }) {
  const { flash } = useToast();
  const novo = item === null;
  const [form, setForm] = useState({
    codigo: item?.codigo ?? "",
    titulo: item?.titulo ?? "",
    revisao: "",
    data_revisao: "",
    periodicidade_meses: item?.periodicidade_meses?.toString() ?? "",
    observacao: item?.observacao ?? "",
  });
  const [revisao, setRevisao] = useState({ revisao: "", data_revisao: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const historico = useConsulta(() => (item ? revisoesListaMestra(item.codigo) : Promise.resolve([])), [item?.codigo, item?.revisao_atual]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function executar(fn: () => Promise<ItemListaMestra>, msg: string, criado = false) {
    setErro(null);
    setSalvando(true);
    try {
      const salvo = await fn();
      flash(msg);
      onSalvo(salvo, criado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSalvando(false);
    }
  }

  const salvarDados = () =>
    executar(
      () =>
        gravar<ItemListaMestra>("lista_mestra_salvar", {
          novo,
          codigo: form.codigo,
          titulo: form.titulo,
          periodicidade_meses: form.periodicidade_meses,
          observacao: form.observacao,
          ...(novo ? { revisao: form.revisao, data_revisao: form.data_revisao } : {}),
        }),
      novo ? "Documento cadastrado." : "Documento atualizado.",
      novo,
    ).catch(() => undefined);

  return (
    <Drawer
      onClose={onFechar}
      header={<CabecalhoDrawer eyebrow="Lista Mestra" titulo={novo ? "Novo documento" : item.codigo} sub={novo ? undefined : item.titulo} />}
    >
      <form
        className={styles.secao}
        onSubmit={(e) => {
          e.preventDefault();
          void salvarDados();
        }}
      >
        <h4 className={styles.secaoTitulo}>Dados do documento</h4>
        <div className={styles.grid}>
          <label className={styles.campo}>
            Código *
            <input value={form.codigo} onChange={set("codigo")} disabled={!novo} maxLength={40} placeholder="Ex.: P-SQ-004" required />
          </label>
          <label className={styles.campo}>
            Periodicidade (meses)
            <input type="number" min={1} max={600} value={form.periodicidade_meses} onChange={set("periodicidade_meses")} placeholder="Sem validade" />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Título *
            <input value={form.titulo} onChange={set("titulo")} maxLength={300} required />
          </label>
          {novo && (
            <>
              <label className={styles.campo}>
                Revisão vigente *
                <input value={form.revisao} onChange={set("revisao")} maxLength={20} placeholder="Ex.: 03" required />
              </label>
              <label className={styles.campo}>
                Data da revisão
                <input type="date" value={form.data_revisao} onChange={set("data_revisao")} />
              </label>
            </>
          )}
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Observação
            <textarea value={form.observacao} onChange={set("observacao")} maxLength={2000} />
          </label>
        </div>
        {!novo && <span className={styles.dica}>O código identifica o documento e não pode ser alterado.</span>}
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Salvando..." : novo ? "Cadastrar" : "Salvar alterações"}
          </Button>
        </div>
      </form>

      {!novo && (
        <>
          <form
            className={styles.secao}
            onSubmit={(e) => {
              e.preventDefault();
              void executar(() => gravar<ItemListaMestra>("lista_mestra_revisao", { codigo: item.codigo, ...revisao }), "Nova revisão registrada.")
                .then(() => setRevisao({ revisao: "", data_revisao: "", observacao: "" }))
                .catch(() => undefined);
            }}
          >
            <h4 className={styles.secaoTitulo}>Revisão</h4>
            <dl className={styles.detalhe}>
              <dt>Vigente</dt>
              <dd>
                Rev. {item.revisao_atual}
                {item.data_revisao ? ` · ${formatarData(item.data_revisao)}` : ""}
              </dd>
            </dl>
            <div className={styles.grid}>
              <label className={styles.campo}>
                Nova revisão
                <input value={revisao.revisao} onChange={(e) => setRevisao((r) => ({ ...r, revisao: e.target.value }))} maxLength={20} />
              </label>
              <label className={styles.campo}>
                Data
                <input type="date" value={revisao.data_revisao} onChange={(e) => setRevisao((r) => ({ ...r, data_revisao: e.target.value }))} />
              </label>
              <label className={[styles.campo, styles.cheio].join(" ")}>
                O que mudou
                <input value={revisao.observacao} onChange={(e) => setRevisao((r) => ({ ...r, observacao: e.target.value }))} maxLength={2000} />
              </label>
            </div>
            <div className={styles.acoes}>
              <Button type="submit" variant="secondary" disabled={salvando || !revisao.revisao.trim() || item.situacao !== "vigente"}>
                Registrar revisão
              </Button>
            </div>
          </form>

          <div className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Histórico de revisões</h4>
            {historico.carregando || !historico.dados ? (
              <Carregando />
            ) : historico.dados.length === 0 ? (
              <span className={styles.dica}>Sem revisões registradas.</span>
            ) : (
              <ul className={styles.historico}>
                {historico.dados.map((h) => (
                  <li key={h.id}>
                    <strong>Rev. {h.revisao}</strong>
                    {h.data_revisao ? ` · ${formatarData(h.data_revisao)}` : ""}
                    <div className={styles.secundario}>
                      Registrada em {formatarData(h.registrado_em)}
                      {h.observacao ? ` — ${h.observacao}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Situação</h4>
            <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
              {item.situacao === "vigente" ? (
                <ConfirmarComMotivo
                  rotulo="Marcar como obsoleto"
                  confirmar="Confirmar"
                  variante="danger"
                  motivoObrigatorio
                  onConfirmar={(motivo) => executar(() => gravar<ItemListaMestra>("lista_mestra_situacao", { codigo: item.codigo, situacao: "obsoleto", motivo }), "Documento marcado como obsoleto.")}
                />
              ) : (
                <ConfirmarComMotivo
                  rotulo="Reativar documento"
                  confirmar="Reativar"
                  variante="success"
                  motivoObrigatorio={false}
                  onConfirmar={(motivo) => executar(() => gravar<ItemListaMestra>("lista_mestra_situacao", { codigo: item.codigo, situacao: "vigente", motivo }), "Documento reativado.")}
                />
              )}
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}
