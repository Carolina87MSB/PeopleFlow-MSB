import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Drawer } from "../../components/ui";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer } from "./componentes";
import { normalizar } from "./buscaHabilidades";
import type { NecessidadeNoCicloComViva } from "./lntRepository";
import type { SugestaoConsolidacao } from "./lntSugestoes";
import { plural, quemEhANecessidade, ROTULO_MOTIVO_SUGESTAO } from "./lntRotulos";
import styles from "./Desenvolvimento.module.css";

interface Props {
  sugestao: SugestaoConsolidacao;
  /** Todas as candidatas do ciclo (para poder incluir outra necessidade no grupo). */
  candidatas: NecessidadeNoCicloComViva[];
  onFechar: () => void;
  /** Volta à Base para análise com a seleção do grupo marcada, para a RH ajustar na tabela. */
  onVoltarParaBase: (ids: number[]) => void;
  /** Segue para a consolidação normal (a confirmação final continua lá). */
  onSeguir: (ids: number[], titulo: string) => void;
}

/**
 * Revisão de um agrupamento sugerido. Nada é consolidado aqui: a RH ajusta o grupo (tira ou acrescenta
 * necessidades, muda o título) e segue para a tela de consolidação, onde fica o clique final.
 */
export function LntGrupoDrawer({ sugestao, candidatas, onFechar, onVoltarParaBase, onSeguir }: Props) {
  const { pessoaPorId } = useDesenvolvimento();
  const [titulo, setTitulo] = useState(sugestao.titulo_sugerido);
  const [membros, setMembros] = useState<number[]>(sugestao.necessidade_ids);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set(sugestao.necessidade_ids));
  const [busca, setBusca] = useState("");

  const porId = useMemo(() => new Map(candidatas.map((l) => [l.necessidade_id, l])), [candidatas]);
  const linhas = membros.map((id) => porId.get(id)).filter((l): l is NecessidadeNoCicloComViva => Boolean(l));
  const escolhidas = linhas.filter((l) => marcadas.has(l.necessidade_id)).map((l) => l.necessidade_id);

  const termo = normalizar(busca);
  const outras = useMemo(() => {
    if (!termo) return [];
    return candidatas
      .filter((l) => !membros.includes(l.necessidade_id) && normalizar(`${l.descricao_na_carga} ${l.sugestao_capacitacao_na_carga} ${quemEhANecessidade(l, pessoaPorId)} ${l.departamento_na_carga ?? ""}`).includes(termo))
      .slice(0, 6);
  }, [candidatas, membros, termo, pessoaPorId]);

  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Drawer
      onClose={onFechar}
      header={<CabecalhoDrawer eyebrow="Possível agrupamento" titulo={sugestao.tema} sub={`${plural(sugestao.necessidade_ids.length, "necessidade possivelmente relacionada", "necessidades possivelmente relacionadas")}`} />}
    >
      <div className={styles.secao}>
        <div className={styles.nota}>
          Revise antes de consolidar: tire o que não pertence ao grupo e acrescente o que faltar. Nada é consolidado sem a sua confirmação.
        </div>
        <div className={styles.secao} style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 0 }}>
          <h4 className={styles.secaoTitulo}>Por que o sistema sugeriu este grupo</h4>
          <div className={styles.selos}>
            {sugestao.motivos.map((m) => (
              <span key={m} className={styles.selo}>
                {ROTULO_MOTIVO_SUGESTAO[m]}
              </span>
            ))}
          </div>
          {sugestao.em_comum.length > 0 && <span className={styles.dica}>Em comum: {sugestao.em_comum.join(", ")}.</span>}
        </div>
      </div>

      <div className={styles.secao}>
        <label className={styles.campo}>
          Título do item
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
        </label>
        <span className={styles.dica}>Você ainda pode alterar o título na etapa de consolidação.</span>
      </div>

      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>
          Necessidades do grupo ({escolhidas.length} de {linhas.length} marcadas)
        </h4>
        <ul className={styles.origens}>
          {linhas.map((l) => {
            const marcada = marcadas.has(l.necessidade_id);
            const nome = quemEhANecessidade(l, pessoaPorId);
            return (
              <li key={l.id} className={[styles.origem, marcada ? "" : styles.origemFora].join(" ")}>
                <label className={styles.origemCheck}>
                  <input type="checkbox" checked={marcada} onChange={() => alternar(l.necessidade_id)} aria-label={`Incluir no grupo a necessidade de ${nome}`} />
                </label>
                <div className={styles.origemCorpo}>
                  <div className={styles.origemQuem}>
                    <strong>{nome}</strong>
                    {l.departamento_na_carga && <span className={styles.secundario}>{l.departamento_na_carga}</span>}
                    {!marcada && <span className={styles.secundario}>Fora do grupo</span>}
                  </div>
                  <span className={styles.origemTexto}>{l.descricao_na_carga}</span>
                  {l.sugestao_capacitacao_na_carga && <span className={styles.secundario}>Sugestão: {l.sugestao_capacitacao_na_carga}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Adicionar outra necessidade</h4>
        <input className={styles.input} type="search" placeholder="Buscar por necessidade, pessoa ou departamento" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar outra necessidade para o grupo" />
        {termo && outras.length === 0 && <span className={styles.dica}>Nenhuma outra necessidade aguardando decisão com esse texto.</span>}
        {outras.length > 0 && (
          <ul className={styles.origens}>
            {outras.map((l) => (
              <li key={l.id} className={styles.origem}>
                <div className={styles.origemCorpo}>
                  <div className={styles.origemQuem}>
                    <strong>{quemEhANecessidade(l, pessoaPorId)}</strong>
                    {l.departamento_na_carga && <span className={styles.secundario}>{l.departamento_na_carga}</span>}
                  </div>
                  <span className={styles.origemTexto}>{l.descricao_na_carga}</span>
                </div>
                <Button
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={() => {
                    setMembros((m) => [...m, l.necessidade_id]);
                    setMarcadas((m) => new Set(m).add(l.necessidade_id));
                    setBusca("");
                  }}
                >
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.acoes}>
        <Button variant="ghost" onClick={() => onVoltarParaBase(escolhidas)} disabled={escolhidas.length === 0}>
          Voltar à Base com esta seleção
        </Button>
        <Button variant="primary" disabled={escolhidas.length === 0} onClick={() => onSeguir(escolhidas, titulo.trim() || sugestao.titulo_sugerido)}>
          Seguir para a consolidação ({escolhidas.length})
        </Button>
      </div>
    </Drawer>
  );
}
