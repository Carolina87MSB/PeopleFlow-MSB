import { Drawer } from "../../components/ui";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { orientacaoDoQuadrante } from "../../domain/orientacaoMatriz9Box";
import type { EntradaMatriz9Box } from "./Matriz9BoxTab";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

interface Matriz9BoxDrawerProps {
  entrada: EntradaMatriz9Box;
  onClose: () => void;
}

/** Detalhe read-only de um marcador da Matriz 9 Box — sem nenhum controle de
 * edição (a posição nunca é editada manualmente; qualquer mudança vem de
 * calibrar/atualizar a AVD/Avaliação de Potencial de origem, ver README).
 * As notas mostradas aqui são sempre as Oficiais (pós-homologação do RH,
 * Etapa 6) — só um colaborador homologado chega a aparecer na Matriz.
 *
 * A seção "Orientação para o Gestor" é puramente consultiva/informativa —
 * texto estático de domain/orientacaoMatriz9Box.ts, identificado
 * automaticamente pelo quadrante já calculado em `entrada.posicao`. Não
 * grava nada, não influencia nenhum cálculo, nem exige preenchimento. */
export function Matriz9BoxDrawer({ entrada, onClose }: Matriz9BoxDrawerProps) {
  const orientacao = orientacaoDoQuadrante(entrada.posicao.faixaPotencial, entrada.posicao.faixaDesempenho);

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{entrada.colaborador.nome}</div>
          <div className={styles.drawerSub}>
            {formatarNomeCargo(entrada.colaborador.cargo)} · {entrada.colaborador.depto}
          </div>
        </div>
      }
    >
      <div className={styles.resumo}>
        <div className={styles.resumoLinha}>
          <span>Nota Oficial da Avaliação de Desempenho</span>
          <strong>{entrada.notaDesempenho}</strong>
        </div>
        <div className={styles.resumoLinha}>
          <span>Nota Oficial de Potencial</span>
          <strong>{entrada.notaPotencial}</strong>
        </div>
        <div className={styles.resumoLinha}>
          <span>Posição na Matriz</span>
          <strong>{entrada.posicao.nomeQuadrante}</strong>
        </div>
        <div className={styles.resumoLinhaFinal}>
          <span>Último ciclo avaliado</span>
          <strong>{entrada.ciclo}</strong>
        </div>
      </div>

      <div className={styles.orientacaoGestor}>
        <div className={styles.sectionTitle}>💡 Orientação para o Gestor</div>

        <div className={styles.orientacaoBloco}>
          <span className={styles.orientacaoBlocoTitulo}>O que significa</span>
          <p className={styles.orientacaoTexto}>{orientacao.oQueSignifica}</p>
        </div>

        <div className={styles.orientacaoBloco}>
          <span className={styles.orientacaoBlocoTitulo}>O que o gestor deve observar</span>
          <ul className={styles.orientacaoLista}>
            {orientacao.oQueObservar.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className={styles.orientacaoBloco}>
          <span className={styles.orientacaoBlocoTitulo}>Como conduzir o feedback</span>
          <p className={styles.orientacaoTexto}>{orientacao.comoConduzirFeedback}</p>
        </div>

        <div className={styles.orientacaoBloco}>
          <span className={styles.orientacaoBlocoTitulo}>Perguntas para a conversa</span>
          <ul className={styles.orientacaoLista}>
            {orientacao.perguntas.map((pergunta) => (
              <li key={pergunta}>{pergunta}</li>
            ))}
          </ul>
        </div>

        <div className={styles.orientacaoBloco}>
          <span className={styles.orientacaoBlocoTitulo}>Próximo passo recomendado</span>
          <p className={styles.orientacaoTexto}>{orientacao.proximoPasso}</p>
        </div>
      </div>
    </Drawer>
  );
}
