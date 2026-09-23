import { useState } from "react";
import { Award, Plus } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { categoriasHabilidades, gravar, listarHabilidades, type FiltroHabilidades, type Habilidade } from "./devRepository";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Paginacao, Selo } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import styles from "./Desenvolvimento.module.css";

export const ROTULO_NORMA: Record<string, string> = { iso_13485: "ISO 13485", rdc_665: "RDC 665", ambas: "ISO 13485 e RDC 665", nao_aplicavel: "Não se aplica" };
const ROTULO_TIPO: Record<Habilidade["tipo"], string> = { tecnica: "Técnica", regulatoria: "Regulatória" };

const FILTRO_TIPO = [
  { rotulo: "Todos os tipos", valor: null },
  { rotulo: "Técnicas", valor: "tecnica" as const },
  { rotulo: "Regulatórias", valor: "regulatoria" as const },
];
const FILTRO_SITUACAO = [
  { rotulo: "Ativas", valor: true },
  { rotulo: "Inativas", valor: false },
  { rotulo: "Todas", valor: null },
];

type Selecao = { modo: "novo" } | { modo: "existente"; item: Habilidade };

export function CatalogoHabilidadesAba() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState(FILTRO_TIPO[0].rotulo);
  const [situacao, setSituacao] = useState(FILTRO_SITUACAO[0].rotulo);
  const filtro: FiltroHabilidades = {
    busca: termo,
    tipo: FILTRO_TIPO.find((f) => f.rotulo === tipo)!.valor,
    ativo: FILTRO_SITUACAO.find((f) => f.rotulo === situacao)!.valor,
  };
  const lista = usePaginado((p) => listarHabilidades(p, filtro), [termo, tipo, situacao]);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const filtrando = Boolean(termo) || filtro.tipo !== null || filtro.ativo !== true;

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Catálogo de habilidades</h3>
          <p className={styles.cardSubtitle}>Habilidades técnicas e regulatórias usadas nos requisitos dos cargos</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setSelecao({ modo: "novo" })}>
          Nova habilidade
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
          <input className={styles.input} type="search" placeholder="Buscar por nome, categoria ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca)} />
          <select className={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo" style={{ minWidth: 160 }}>
            {FILTRO_TIPO.map((f) => (
              <option key={f.rotulo}>{f.rotulo}</option>
            ))}
          </select>
        </form>
        <FilterChips options={FILTRO_SITUACAO.map((f) => f.rotulo)} value={situacao} onChange={setSituacao} />
      </div>

      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : lista.carregando || !lista.dados ? (
        <Carregando />
      ) : lista.dados.itens.length === 0 ? (
        <EstadoVazio icone={<Award size={26} strokeWidth={1.6} />} titulo={filtrando ? "Nenhuma habilidade encontrada." : "Nenhuma habilidade cadastrada."} />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Habilidade</th>
                  <th>Categoria</th>
                  <th>Tipo</th>
                  <th>Norma</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.itens.map((h) => (
                  <tr key={h.id} className={[styles.linhaClicavel, h.ativo ? "" : styles.linhaInativa].join(" ")} onClick={() => setSelecao({ modo: "existente", item: h })}>
                    <td>
                      {h.nome}
                      {h.descricao && <div className={styles.secundario}>{h.descricao}</div>}
                    </td>
                    <td className={styles.secundario}>{h.categoria ?? "—"}</td>
                    <td className={styles.secundario}>{ROTULO_TIPO[h.tipo]}</td>
                    <td className={styles.secundario}>{h.norma ? ROTULO_NORMA[h.norma] : "—"}</td>
                    <td>
                      <Selo tom={h.ativo ? "success" : "neutral"}>{h.ativo ? "Ativa" : "Inativa"}</Selo>
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
        <HabilidadeDrawer
          key={selecao.modo === "novo" ? "novo" : selecao.item.id}
          item={selecao.modo === "novo" ? null : selecao.item}
          onFechar={() => setSelecao(null)}
          onSalvo={(h, criado) => {
            if (criado) lista.recarregar();
            else lista.atualizarItem((i) => i.id === h.id, h);
            setSelecao({ modo: "existente", item: h });
          }}
        />
      )}
    </Card>
  );
}

function HabilidadeDrawer({ item, onFechar, onSalvo }: { item: Habilidade | null; onFechar: () => void; onSalvo: (h: Habilidade, criado: boolean) => void }) {
  const { flash } = useToast();
  const novo = item === null;
  const [form, setForm] = useState({
    nome: item?.nome ?? "",
    tipo: item?.tipo ?? "tecnica",
    categoria: item?.categoria ?? "",
    norma: item?.norma ?? "",
    descricao: item?.descricao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const categorias = useConsulta(() => categoriasHabilidades(), []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function executar(fn: () => Promise<Habilidade>, msg: string, criado = false) {
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

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Catálogo de habilidades" titulo={novo ? "Nova habilidade" : item.nome} />}>
      <form
        className={styles.secao}
        onSubmit={(e) => {
          e.preventDefault();
          void executar(() => gravar<Habilidade>("habilidade_salvar", { id: item?.id ?? null, ...form }), novo ? "Habilidade cadastrada." : "Habilidade atualizada.", novo).catch(() => undefined);
        }}
      >
        <div className={styles.grid}>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Nome *
            <input value={form.nome} onChange={set("nome")} maxLength={200} required />
          </label>
          <label className={styles.campo}>
            Tipo *
            <select value={form.tipo} onChange={set("tipo")}>
              <option value="tecnica">Técnica</option>
              <option value="regulatoria">Regulatória</option>
            </select>
          </label>
          <label className={styles.campo}>
            Categoria
            <input value={form.categoria} onChange={set("categoria")} maxLength={80} list="dev-categorias-habilidade" placeholder="Ex.: Produção, Qualidade" />
            <datalist id="dev-categorias-habilidade">
              {(categorias.dados ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Norma relacionada
            <select value={form.norma} onChange={set("norma")}>
              <option value="">—</option>
              {Object.entries(ROTULO_NORMA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Descrição
            <textarea value={form.descricao} onChange={set("descricao")} maxLength={2000} />
          </label>
        </div>
        <span className={styles.dica}>O sistema bloqueia nomes repetidos (sem diferenciar acentos ou maiúsculas).</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Salvando..." : novo ? "Cadastrar" : "Salvar alterações"}
          </Button>
        </div>
      </form>

      {!novo && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Situação</h4>
          <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
            {item.ativo ? (
              <ConfirmarComMotivo
                rotulo="Inativar habilidade"
                confirmar="Inativar"
                variante="danger"
                motivoObrigatorio
                onConfirmar={(motivo) => executar(() => gravar<Habilidade>("habilidade_ativo", { id: item.id, ativo: false, motivo }), "Habilidade inativada.")}
              />
            ) : (
              <ConfirmarComMotivo
                rotulo="Reativar habilidade"
                confirmar="Reativar"
                variante="success"
                motivoObrigatorio={false}
                onConfirmar={(motivo) => executar(() => gravar<Habilidade>("habilidade_ativo", { id: item.id, ativo: true, motivo }), "Habilidade reativada.")}
              />
            )}
          </div>
          <span className={styles.dica}>Habilidade inativa deixa de aparecer para novos requisitos; o histórico é preservado.</span>
        </div>
      )}
    </Drawer>
  );
}
