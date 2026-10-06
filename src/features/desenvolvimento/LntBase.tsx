import { useMemo, useState } from "react";
import { ClipboardList, Layers, Sparkles } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { type CategoriaNecessidade, type OrigemNecessidade } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Erro, EstadoVazio, Paginacao, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { CATEGORIA_NECESSIDADE, PRIORIDADE, ROTULO_ORIGEM } from "./rotulos";
import { candidatasParaSugestao, lnt, type CicloLnt } from "./lntRepository";
import { sugerirConsolidacoes, type SugestaoConsolidacao } from "./lntSugestoes";
import { candidatasDe, type DadosCiclo } from "./lntDados";
import { dataCurta, mensagemDeErro, plural, quemEhANecessidade, ROTULO_SITUACAO_ITEM } from "./lntRotulos";
import { LntNecessidadeDrawer } from "./LntNecessidadeDrawer";
import type { NecessidadeNoCicloComViva } from "./lntRepository";
import { normalizar } from "./buscaHabilidades";
import styles from "./Desenvolvimento.module.css";

const POR_PAGINA = 50;

interface Props {
  ciclo: CicloLnt;
  dados: DadosCiclo;
  /** RH com o ciclo em elaboração. Para o Gestor e para o ciclo fechado a tela é só de consulta. */
  podeEditar: boolean;
  recarregar: () => void;
}

export function LntBase({ ciclo, dados, podeEditar, recarregar }: Props) {
  const { pessoaPorId } = useDesenvolvimento();
  const candidatas = useMemo(() => candidatasDe(dados), [dados]);
  const [busca, setBusca] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [categoria, setCategoria] = useState("");
  const [origem, setOrigem] = useState("");
  const [alerta, setAlerta] = useState("Todas");
  const [pagina, setPagina] = useState(0);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState<NecessidadeNoCicloComViva | null>(null);
  const [consolidando, setConsolidando] = useState(false);
  const [naoPriorizando, setNaoPriorizando] = useState(false);

  const departamentos = useMemo(() => [...new Set(candidatas.map((l) => l.departamento_na_carga).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [candidatas]);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return candidatas.filter((l) => {
      if (departamento && l.departamento_na_carga !== departamento) return false;
      if (categoria && l.viva?.categoria !== categoria) return false;
      if (origem && l.viva?.origem !== origem) return false;
      if (alerta === "Com alerta" && l.alerta_treinamento_id == null && !l.mudou_desde_carga_em) return false;
      if (termo && !normalizar(`${l.descricao_na_carga} ${l.justificativa_na_carga} ${l.sugestao_capacitacao_na_carga} ${quemEhANecessidade(l, pessoaPorId)}`).includes(termo)) return false;
      return true;
    });
  }, [candidatas, busca, departamento, categoria, origem, alerta, pessoaPorId]);

  const pagina0 = Math.min(pagina, Math.max(0, Math.ceil(filtradas.length / POR_PAGINA) - 1));
  const visiveis = filtradas.slice(pagina0 * POR_PAGINA, (pagina0 + 1) * POR_PAGINA);

  // Sugestões de agrupamento: só apoiam a RH — nada é consolidado sozinho.
  const [versaoSugestoes, setVersaoSugestoes] = useState(0);
  const sugestoesBrutas = useConsulta(() => (podeEditar && candidatas.length >= 2 ? candidatasParaSugestao(ciclo.id) : Promise.resolve([])), [ciclo.id, podeEditar, candidatas.length, versaoSugestoes]);
  const sugestoes = useMemo(() => sugerirConsolidacoes(sugestoesBrutas.dados ?? []).slice(0, 4), [sugestoesBrutas.dados]);

  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todasMarcadas = visiveis.length > 0 && visiveis.every((l) => marcadas.has(l.necessidade_id));
  const marcadasValidas = [...marcadas].filter((id) => candidatas.some((l) => l.necessidade_id === id));
  const concluido = () => {
    setMarcadas(new Set());
    setConsolidando(false);
    setNaoPriorizando(false);
    setAberta(null);
    setVersaoSugestoes((v) => v + 1);
    recarregar();
  };

  if (candidatas.length === 0) {
    return (
      <Card>
        <EstadoVazio
          icone={<ClipboardList size={26} strokeWidth={1.6} />}
          titulo={dados.linhas.length === 0 ? "Este ciclo ainda não tem candidatas." : "Nenhuma necessidade aguardando decisão."}
          descricao={
            dados.linhas.length === 0
              ? podeEditar
                ? "Use “Carregar candidatas” no topo da página para trazer as Necessidades de Desenvolvimento validadas ou planejadas até a data de corte."
                : "A RH ainda não carregou as candidatas deste ciclo."
              : "Todas as candidatas já foram consolidadas em itens ou não priorizadas."
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Base para análise</h3>
          <p className={styles.cardSubtitle}>Necessidades candidatas aguardando decisão. A LNT mostra o que foi analisado na data da carga.</p>
        </div>
      </div>

      {podeEditar && sugestoes.length > 0 && (
        <div className={styles.painelSugestao}>
          <strong>
            <Sparkles size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Estas necessidades parecem tratar do mesmo tema
          </strong>
          {sugestoes.map((s) => (
            <div key={s.chave} className={styles.linhaSugestao}>
              <span>
                <strong>{s.titulo_sugerido}</strong>
                <span className={styles.secundario}>
                  {" "}
                  · {plural(s.necessidade_ids.length, "necessidade", "necessidades")}
                  {s.colaboradores > 0 ? ` de ${plural(s.colaboradores, "pessoa", "pessoas")}` : ""} · {MOTIVO_SUGESTAO[s.motivo]}
                </span>
              </span>
              <Button variant="ghost" onClick={() => setMarcadas(new Set(s.necessidade_ids))}>
                Selecionar
              </Button>
            </div>
          ))}
          <span className={styles.dica}>É só uma sugestão: você escolhe o que consolidar.</span>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.filtros}>
          <input className={styles.input} style={{ minWidth: 280 }} type="search" placeholder="Buscar por necessidade, pessoa ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        </div>
        <FilterChips options={["Todas", "Com alerta"]} value={alerta} onChange={setAlerta} />
      </div>
      <div className={styles.filtros} style={{ marginBottom: 14 }}>
        <select className={styles.select} style={{ minWidth: 160 }} value={departamento} onChange={(e) => setDepartamento(e.target.value)} aria-label="Departamento">
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className={styles.select} style={{ minWidth: 150 }} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_NECESSIDADE[c]}
            </option>
          ))}
        </select>
        <select className={styles.select} style={{ minWidth: 150 }} value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>
          {(Object.keys(ROTULO_ORIGEM) as OrigemNecessidade[]).map((o) => (
            <option key={o} value={o}>
              {ROTULO_ORIGEM[o]}
            </option>
          ))}
        </select>
      </div>

      {podeEditar && marcadasValidas.length > 0 && (
        <div className={styles.toolbar} style={{ background: "var(--color-surface-alt)", padding: "10px 12px", borderRadius: "var(--radius-md)" }}>
          <span className={styles.secundario}>{plural(marcadasValidas.length, "necessidade selecionada", "necessidades selecionadas")}</span>
          <div className={styles.acoes}>
            <Button variant="ghost" onClick={() => setMarcadas(new Set())}>
              Limpar seleção
            </Button>
            <Button variant="secondary" onClick={() => setNaoPriorizando(true)}>
              Não priorizar
            </Button>
            <Button variant="primary" icon={<Layers size={16} />} onClick={() => setConsolidando(true)}>
              Consolidar selecionadas
            </Button>
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <EstadoVazio icone={<ClipboardList size={26} strokeWidth={1.6} />} titulo="Nenhuma necessidade encontrada com esses filtros." />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  {podeEditar && (
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        aria-label="Selecionar todas desta página"
                        checked={todasMarcadas}
                        onChange={() =>
                          setMarcadas((m) => {
                            const n = new Set(m);
                            for (const l of visiveis) {
                              if (todasMarcadas) n.delete(l.necessidade_id);
                              else n.add(l.necessidade_id);
                            }
                            return n;
                          })
                        }
                      />
                    </th>
                  )}
                  <th>Necessidade</th>
                  <th>Pessoa ou cargo</th>
                  <th>Origem</th>
                  <th>Categoria</th>
                  <th>Prioridade original</th>
                  <th>Carga</th>
                  <th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className={styles.linhaClicavel} onClick={() => setAberta(l)}>
                    {podeEditar && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Selecionar" checked={marcadas.has(l.necessidade_id)} onChange={() => alternar(l.necessidade_id)} />
                      </td>
                    )}
                    <td>
                      {l.descricao_na_carga}
                      {l.sugestao_capacitacao_na_carga && <div className={styles.secundario}>Sugestão: {l.sugestao_capacitacao_na_carga}</div>}
                    </td>
                    <td>
                      {quemEhANecessidade(l, pessoaPorId)}
                      {l.departamento_na_carga && <div className={styles.secundario}>{l.departamento_na_carga}</div>}
                    </td>
                    <td className={styles.secundario}>{l.viva ? ROTULO_ORIGEM[l.viva.origem] : "—"}</td>
                    <td className={styles.secundario}>{l.viva?.categoria ? CATEGORIA_NECESSIDADE[l.viva.categoria] : "—"}</td>
                    <td>{l.prioridade_na_carga ? <Selo tom={PRIORIDADE[l.prioridade_na_carga].tom}>{PRIORIDADE[l.prioridade_na_carga].rotulo}</Selo> : "—"}</td>
                    <td className={styles.secundario}>{dataCurta(l.carregada_em)}</td>
                    <td>
                      <div className={styles.selos}>
                        {l.alerta_treinamento_id != null && <Selo tom="warning">Treinamento já planejado</Selo>}
                        {l.mudou_desde_carga_em && <Selo tom="info">Atualizada após a carga</Selo>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina0} total={filtradas.length} onChange={setPagina} />
        </>
      )}

      {aberta && (
        <LntNecessidadeDrawer
          linha={dados.linhas.find((l) => l.id === aberta.id) ?? aberta}
          onFechar={() => setAberta(null)}
          rodape={
            podeEditar && (
              <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMarcadas(new Set([aberta.necessidade_id]));
                    setAberta(null);
                    setNaoPriorizando(true);
                  }}
                >
                  Não priorizar
                </Button>
              </div>
            )
          }
        />
      )}
      {podeEditar && consolidando && <ConsolidarDrawer ciclo={ciclo} dados={dados} ids={marcadasValidas} sugestoes={sugestoes} onFechar={() => setConsolidando(false)} onConcluido={concluido} />}
      {podeEditar && naoPriorizando && <NaoPriorizarNecessidadesDrawer ciclo={ciclo} ids={marcadasValidas} dados={dados} onFechar={() => setNaoPriorizando(false)} onConcluido={concluido} />}
    </Card>
  );
}

const MOTIVO_SUGESTAO: Record<SugestaoConsolidacao["motivo"], string> = {
  mesma_habilidade: "mesma habilidade",
  mesmo_documento: "mesmo documento",
  mesmo_grupo: "mesmo grupo da Base",
  texto_parecido: "texto parecido",
};

// ── Consolidar selecionadas ─────────────────────────────────────────────
function ConsolidarDrawer({ ciclo, dados, ids, sugestoes, onFechar, onConcluido }: { ciclo: CicloLnt; dados: DadosCiclo; ids: number[]; sugestoes: SugestaoConsolidacao[]; onFechar: () => void; onConcluido: () => void }) {
  const { flash } = useToast();
  const { pessoaPorId } = useDesenvolvimento();
  const selecionadas = dados.linhas.filter((l) => ids.includes(l.necessidade_id));
  const sugestao = sugestoes.find((s) => ids.every((id) => s.necessidade_ids.includes(id)) && s.necessidade_ids.length >= ids.length);
  const categoriaInicial = selecionadas.find((l) => l.viva?.categoria)?.viva?.categoria ?? "";
  const itensAbertos = dados.itens.filter((i) => i.situacao !== "nao_priorizado");
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [titulo, setTitulo] = useState(sugestao?.titulo_sugerido ?? (selecionadas[0]?.sugestao_capacitacao_na_carga || selecionadas[0]?.descricao_na_carga || "").slice(0, 200));
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>(categoriaInicial);
  const [itemId, setItemId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      if (modo === "novo") {
        await lnt.criarItemConsolidado({ ciclo_id: ciclo.id, titulo, necessidade_ids: ids, descricao, categoria: (categoria || undefined) as CategoriaNecessidade | undefined });
        flash(`Item criado com ${plural(ids.length, "necessidade", "necessidades")}.`);
      } else {
        await lnt.consolidar(Number(itemId), ids);
        flash(`${plural(ids.length, "necessidade acrescentada", "necessidades acrescentadas")} ao item.`);
      }
      onConcluido();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Consolidação" titulo={`Consolidar ${plural(ids.length, "necessidade", "necessidades")}`} sub="Cada necessidade original continua preservada na Base" />}>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Necessidades selecionadas</h4>
        <ul className={styles.listaCargos}>
          {selecionadas.map((l) => (
            <li key={l.id}>
              <span>{l.descricao_na_carga}</span>
              <span className={styles.secundario}>
                · {quemEhANecessidade(l, pessoaPorId)}
                {l.departamento_na_carga ? ` · ${l.departamento_na_carga}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {sugestao ? <div className={styles.nota}>Estas necessidades parecem tratar do mesmo tema ({MOTIVO_SUGESTAO[sugestao.motivo]}). A decisão é sua.</div> : ids.length > 1 ? <span className={styles.dica}>O sistema não encontrou semelhança clara entre elas. Consolide só se tratarem do mesmo tema.</span> : null}
      </div>
      <form className={styles.secao} onSubmit={confirmar}>
        {itensAbertos.length > 0 && <FilterChips options={["Novo item", "Item existente"]} value={modo === "novo" ? "Novo item" : "Item existente"} onChange={(v) => setModo(v === "Novo item" ? "novo" : "existente")} />}
        <div className={styles.grid}>
          {modo === "novo" ? (
            <>
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Título do item *
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required placeholder="Ex.: Excel avançado" />
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
              <label className={[styles.campo, styles.cheio].join(" ")}>
                Descrição (opcional)
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
              </label>
            </>
          ) : (
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Item *
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Selecione</option>
                {itensAbertos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.titulo} ({ROTULO_SITUACAO_ITEM[i.situacao].rotulo})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <span className={styles.dica}>Depois de consolidar, as necessidades saem da Base para análise e passam a aparecer dentro do item.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? "Consolidando..." : "Consolidar"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

// ── Não priorizar necessidades ──────────────────────────────────────────
export function NaoPriorizarNecessidadesDrawer({ ciclo, ids, dados, onFechar, onConcluido }: { ciclo: CicloLnt; ids: number[]; dados: DadosCiclo; onFechar: () => void; onConcluido: () => void }) {
  const { flash } = useToast();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const alvo = dados.linhas.filter((l) => ids.includes(l.necessidade_id));
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Decisão da LNT" titulo={`Não priorizar ${plural(ids.length, "necessidade", "necessidades")}`} />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            await lnt.naoPriorizarNecessidades(ciclo.id, ids, motivo.trim());
            flash(`${plural(ids.length, "necessidade não priorizada", "necessidades não priorizadas")}.`);
            onConcluido();
          } catch (err) {
            setErro(mensagemDeErro(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <ul className={styles.listaCargos}>
          {alvo.map((l) => (
            <li key={l.id}>{l.descricao_na_carga}</li>
          ))}
        </ul>
        <label className={styles.campo}>
          Motivo *
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} required autoFocus />
        </label>
        <span className={styles.dica}>A necessidade continuará registrada na Base de Necessidades e poderá ser considerada em outro ciclo.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" disabled={salvando || !motivo.trim()}>
            {salvando ? "Salvando..." : "Não priorizar"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

