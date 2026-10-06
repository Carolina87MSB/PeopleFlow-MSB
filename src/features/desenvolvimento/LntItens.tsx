import { useMemo, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { DIRECIONADORES, type Direcionador, type SituacaoItem } from "../../domain/lnt";
import type { CategoriaNecessidade } from "./devRepository";
import { CabecalhoDrawer, Erro, EstadoVazio, Selo } from "./componentes";
import { CATEGORIA_NECESSIDADE, PRIORIDADE } from "./rotulos";
import { lnt, type CicloLnt, type ItemLnt } from "./lntRepository";
import { resumoDoItem, type DadosCiclo } from "./lntDados";
import { mensagemDeErro, ROTULO_DIRECIONADOR, ROTULO_SITUACAO_ITEM, TEXTO_DEMANDA_DIRETA } from "./lntRotulos";
import { LntItemDrawer } from "./LntItemDrawer";
import styles from "./Desenvolvimento.module.css";

const FILTROS: { rotulo: string; situacao: SituacaoItem | null }[] = [
  { rotulo: "Todos", situacao: null },
  { rotulo: "Em análise", situacao: "em_analise" },
  { rotulo: "Incluídos", situacao: "incluido" },
];

export function LntItens({ ciclo, dados, podeEditar, recarregar }: { ciclo: CicloLnt; dados: DadosCiclo; podeEditar: boolean; recarregar: () => void }) {
  const [filtro, setFiltro] = useState(FILTROS[0].rotulo);
  const [aberto, setAberto] = useState<number | null>(null);
  const [criandoDemanda, setCriandoDemanda] = useState(false);
  const situacao = FILTROS.find((f) => f.rotulo === filtro)!.situacao;
  // Itens não priorizados ficam na aba "Não priorizadas".
  const itens = useMemo(() => dados.itens.filter((i) => i.situacao !== "nao_priorizado" && (!situacao || i.situacao === situacao)), [dados.itens, situacao]);

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>LNT consolidada</h3>
          <p className={styles.cardSubtitle}>Itens que reúnem as necessidades de mesmo tema, com a prioridade definida pela RH.</p>
        </div>
        {podeEditar && (
          <Button variant="secondary" icon={<Plus size={16} />} className={styles.botaoLongo} onClick={() => setCriandoDemanda(true)}>
            Adicionar demanda estratégica
          </Button>
        )}
      </div>
      <div className={styles.toolbar}>
        <FilterChips options={FILTROS.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
      </div>

      {itens.length === 0 ? (
        <EstadoVazio
          icone={<Layers size={26} strokeWidth={1.6} />}
          titulo={dados.itens.length === 0 ? "Ainda não há itens na LNT." : "Nenhum item com este filtro."}
          descricao={dados.itens.length === 0 ? (podeEditar ? "Selecione candidatas na “Base para análise” e use “Consolidar selecionadas”, ou adicione uma demanda estratégica." : undefined) : undefined}
        />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Situação</th>
                <th>Prioridade</th>
                <th>Direcionadores</th>
                <th>Pessoas</th>
                <th>Departamentos</th>
                <th>Necessidades</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const r = resumoDoItem(dados, i);
                return (
                  <tr key={i.id} className={styles.linhaClicavel} onClick={() => setAberto(i.id)}>
                    <td>
                      {i.titulo}
                      <div className={styles.secundario}>
                        {i.categoria ? CATEGORIA_NECESSIDADE[i.categoria] : "Sem categoria"}
                        {i.origem_item === "direto" ? ` · ${TEXTO_DEMANDA_DIRETA}` : ""}
                      </div>
                    </td>
                    <td>
                      <Selo tom={ROTULO_SITUACAO_ITEM[i.situacao].tom}>{ROTULO_SITUACAO_ITEM[i.situacao].rotulo}</Selo>
                    </td>
                    <td>{i.prioridade ? <Selo tom={PRIORIDADE[i.prioridade].tom}>{PRIORIDADE[i.prioridade].rotulo}</Selo> : <span className={styles.secundario}>A definir</span>}</td>
                    <td>
                      <DirecionadoresCompactos valor={i.direcionadores} />
                    </td>
                    <td className={styles.secundario}>{i.origem_item === "direto" ? (i.publico_estimado ? `~${i.publico_estimado} (estimado)` : "—") : r.pessoas}</td>
                    <td className={styles.secundario}>{r.departamentos.length > 0 ? (r.departamentos.length > 2 ? `${r.departamentos.slice(0, 2).join(", ")} +${r.departamentos.length - 2}` : r.departamentos.join(", ")) : "—"}</td>
                    <td className={styles.secundario}>{r.necessidades}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aberto != null && <LntItemDrawer ciclo={ciclo} dados={dados} itemId={aberto} podeEditar={podeEditar} onFechar={() => setAberto(null)} recarregar={recarregar} />}
      {podeEditar && criandoDemanda && (
        <DemandaDrawer
          ciclo={ciclo}
          onFechar={() => setCriandoDemanda(false)}
          onCriada={(item) => {
            setCriandoDemanda(false);
            recarregar();
            setAberto(item.id);
          }}
        />
      )}
    </Card>
  );
}

/** Na tabela: o primeiro direcionador como selo e, se houver outros, "+N" (os demais ficam no tooltip e no detalhe do item). */
function DirecionadoresCompactos({ valor }: { valor: Direcionador[] }) {
  if (valor.length === 0) return <span className={styles.secundario}>A definir</span>;
  const [primeiro, ...demais] = valor;
  const nomesDosDemais = demais.map((d) => ROTULO_DIRECIONADOR[d]).join(", ");
  return (
    <span className={styles.selosCompactos}>
      <Selo tom="neutral">{ROTULO_DIRECIONADOR[primeiro]}</Selo>
      {demais.length > 0 && (
        <span title={nomesDosDemais} aria-label={`Mais ${demais.length === 1 ? "1 direcionador" : `${demais.length} direcionadores`}: ${nomesDosDemais}`}>
          <Selo tom="info">+{demais.length}</Selo>
        </span>
      )}
    </span>
  );
}

/** Seleção múltipla dos direcionadores (vocabulário controlado). */
export function SeletorDirecionadores({ valor, onChange }: { valor: Direcionador[]; onChange: (v: Direcionador[]) => void }) {
  return (
    <div className={styles.listaChecks} role="group" aria-label="Direcionadores">
      {DIRECIONADORES.map((d) => (
        <label key={d.valor} className={styles.check}>
          <input type="checkbox" checked={valor.includes(d.valor)} onChange={() => onChange(valor.includes(d.valor) ? valor.filter((x) => x !== d.valor) : [...valor, d.valor])} />
          {d.rotulo}
        </label>
      ))}
    </div>
  );
}

// ── Adicionar demanda estratégica (item direto) ─────────────────────────
function DemandaDrawer({ ciclo, onFechar, onCriada }: { ciclo: CicloLnt; onFechar: () => void; onCriada: (item: ItemLnt) => void }) {
  const { flash } = useToast();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [direcionadores, setDirecionadores] = useState<Direcionador[]>([]);
  const [publico, setPublico] = useState("");
  const [publicoDescricao, setPublicoDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="LNT consolidada" titulo="Adicionar demanda estratégica" sub="Necessidade organizacional que não nasceu de uma necessidade individual" />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          if (direcionadores.length === 0) return setErro("Escolha ao menos um direcionador.");
          setSalvando(true);
          try {
            const item = await lnt.criarItemDireto({
              ciclo_id: ciclo.id,
              titulo,
              descricao,
              categoria: (categoria || undefined) as CategoriaNecessidade | undefined,
              justificativa,
              direcionadores,
              publico_estimado: Number(publico),
              publico_descricao: publicoDescricao,
            });
            flash("Demanda estratégica adicionada.");
            onCriada(item);
          } catch (err) {
            setErro(mensagemDeErro(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <div className={styles.nota}>Use para temas que a organização precisa desenvolver mesmo sem uma necessidade individual registrada, como um programa de liderança. Nenhuma necessidade é criada na Base.</div>
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
            Público estimado (pessoas) *
            <input type="number" min={1} max={100000} value={publico} onChange={(e) => setPublico(e.target.value)} required />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Descrição do público
            <input value={publicoDescricao} onChange={(e) => setPublicoDescricao(e.target.value)} maxLength={500} placeholder="Ex.: todos os líderes de produção" />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa *
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={2000} required />
          </label>
        </div>
        <h4 className={styles.secaoTitulo}>Direcionadores *</h4>
        <SeletorDirecionadores valor={direcionadores} onChange={setDirecionadores} />
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Adicionando..." : "Adicionar demanda"}
          </Button>
        </div>
        <span className={styles.dica}>Depois de criada, defina a prioridade e inclua a demanda na LNT. Itens em análise impedem o fechamento da LNT.</span>
      </form>
    </Drawer>
  );
}
