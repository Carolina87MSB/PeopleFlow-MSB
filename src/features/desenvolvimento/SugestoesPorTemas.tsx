import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { ROTULO_TEMA, VERSAO_CATALOGO_TEMAS, ORDEM_TEMAS, type TemaId } from "../../domain/pdiTemas";
import { EstadoVazio } from "./componentes";
import { plural } from "./lntRotulos";
import { PdiItemCard, type AcoesDoCard, type SituacaoItem } from "./PdiItemCard";
import { montarTemas, type GrupoTema } from "./pdiTemasModelo";
import type { ItemCard } from "./pdiTriagemItens";
import styles from "./Desenvolvimento.module.css";

interface Props {
  /** Itens da situação escolhida, já filtrados por departamento e tipo. */
  cards: ItemCard[];
  situacao: SituacaoItem;
  rotuloItens: string;
  ocupado: boolean;
  identificaveis: Set<string>;
  acoesPara: (card: ItemCard) => AcoesDoCard;
}

/**
 * Visão "Por temas": só ORGANIZA para leitura os mesmos itens da triagem. Não confirma grupo, não cria necessidade, não altera o PDI.
 * Cada decisão continua sendo individual (item/sugestão da Fase 7) e é a mesma em qualquer grupo em que o item apareça.
 */
export function SugestoesPorTemas({ cards, situacao, rotuloItens, ocupado, identificaveis, acoesPara }: Props) {
  const [escolhido, setEscolhido] = useState<TemaId | "">("");
  const modelo = useMemo(() => montarTemas(cards), [cards]);
  const aberto: GrupoTema | undefined = modelo.grupos.find((g) => g.tema === escolhido);
  const opcoes = ORDEM_TEMAS.filter((t) => modelo.grupos.some((g) => g.tema === t));

  return (
    <div data-testid="visao-temas">
      <div className={styles.indicadoresTemas}>
        <div className={styles.indicadorTema}>
          <strong>{modelo.indicadores.itens}</strong>
          <span>{rotuloItens}</span>
        </div>
        <div className={styles.indicadorTema}>
          <strong>{modelo.indicadores.grupos}</strong>
          <span>{modelo.indicadores.grupos === 1 ? "grupo temático sugerido" : "grupos temáticos sugeridos"}</span>
        </div>
        <div className={styles.indicadorTema}>
          <strong>{modelo.indicadores.revisao}</strong>
          <span>{modelo.indicadores.revisao === 1 ? "item em revisão individual" : "itens em revisão individual"}</span>
        </div>
      </div>
      <span className={styles.dica} style={{ display: "block", marginBottom: 10 }}>
        Os temas são só uma forma de ler os PDIs, montada por regras de texto (catálogo {VERSAO_CATALOGO_TEMAS}), sem inteligência artificial. Não são diagnóstico, não indicam capacitação obrigatória e não criam necessidades: você decide item por item. Um item com ações de assuntos diferentes aparece em mais de um tema, mas a decisão dele é uma só.
      </span>

      <div className={styles.filtros} style={{ marginBottom: 14 }}>
        <select className={styles.select} style={{ minWidth: 220 }} value={aberto ? aberto.tema : ""} onChange={(e) => setEscolhido(e.target.value as TemaId | "")} aria-label="Tema">
          <option value="">Escolha um tema</option>
          {opcoes.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TEMA[t]}
            </option>
          ))}
        </select>
      </div>

      {modelo.grupos.length === 0 ? (
        <EstadoVazio icone={<Layers size={26} strokeWidth={1.6} />} titulo="Nenhum item para agrupar com estes filtros." descricao="Ajuste a situação, o departamento ou o tipo para ver os temas." />
      ) : (
        <ul className={styles.gradeTemas}>
          {modelo.grupos.map((g) => (
            <li key={g.tema}>
              <button type="button" className={`${styles.cartaoTema} ${aberto?.tema === g.tema ? styles.cartaoTemaSel : ""}`} aria-pressed={aberto?.tema === g.tema} onClick={() => setEscolhido(aberto?.tema === g.tema ? "" : g.tema)} data-testid="cartao-tema">
                <span className={styles.cartaoTemaTitulo}>{g.rotulo}</span>
                <span className={styles.cartaoTemaDescricao}>{g.descricao}</span>
                <span className={styles.cartaoTemaNumeros}>
                  <span>{plural(g.totais.itens, "item", "itens")}</span>
                  <span>{plural(g.totais.colaboradores, "colaborador", "colaboradores")}</span>
                  <span>{plural(g.totais.departamentos, "departamento", "departamentos")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <>
          <div className={styles.cabecalhoTema}>
            <h4>{aberto.rotulo}</h4>
            <span className={styles.secundario}>
              {plural(aberto.totais.itens, "item", "itens")} · {plural(aberto.totais.acoes, "ação", "ações")} · {plural(aberto.totais.colaboradores, "colaborador", "colaboradores")}
            </span>
          </div>
          <ul className={styles.itensPdi}>
            {aberto.itens.map((i) => (
              <PdiItemCard
                key={`${aberto.tema}:${i.card.chave}`}
                card={i.card}
                situacao={situacao}
                ocupado={ocupado}
                confirmavel={identificaveis.has(i.card.colaboradorNome)}
                realce={{
                  rotulo: aberto.tema === "revisao" ? "Por que precisa de revisão" : "Neste tema",
                  acoes: i.acoes.map((a) => ({ id: a.acao.id, texto: a.acao.texto, explicacao: a.explicacao, nota: a.nota })),
                  tambemEm: i.tambemEm.map((t) => ROTULO_TEMA[t]),
                }}
                {...acoesPara(i.card)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
