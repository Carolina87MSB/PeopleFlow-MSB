import { EmptyState } from "../../components/ui";
import styles from "./RankingLista.module.css";

interface RankingListaProps {
  titulo: string;
  itens: { nome: string; media: number }[];
}

/** Lista simples "nome — nota", usada pros 4 rankings top/bottom-5 de
 * competências/KPIs reaproveitados pelos 3 dashboards (Etapa 8). */
export function RankingLista({ titulo, itens }: RankingListaProps) {
  return (
    <div>
      <h4 className={styles.titulo}>{titulo}</h4>
      {itens.length === 0 ? (
        <EmptyState message="Sem dados suficientes ainda." />
      ) : (
        <ol className={styles.lista}>
          {itens.map((item) => (
            <li key={item.nome} className={styles.item}>
              <span className={styles.nome}>{item.nome}</span>
              <span className={styles.media}>{item.media.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
