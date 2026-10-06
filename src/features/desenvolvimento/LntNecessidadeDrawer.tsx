import type { ReactNode } from "react";
import { Drawer } from "../../components/ui";
import { obterTreinamento, type Treinamento } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { CATEGORIA_NECESSIDADE, formatarData, PRIORIDADE, ROTULO_ORIGEM, STATUS_TREINAMENTO } from "./rotulos";
import type { NecessidadeNoCicloComViva } from "./lntRepository";
import { dataCurta, quemEhANecessidade, ROTULO_CAMPO_MUDANCA, ROTULO_STATUS_NA_CARGA, textoDoValor } from "./lntRotulos";
import styles from "./Desenvolvimento.module.css";

function TreinamentoRelacionado({ id }: { id: number }) {
  const t = useConsulta<Treinamento | null>(() => obterTreinamento(id), [id]);
  if (t.carregando) return <Carregando />;
  if (!t.dados) return <span className={styles.dica}>Existe um treinamento já planejado para esta necessidade, mas os detalhes não estão disponíveis para o seu perfil.</span>;
  const x = t.dados;
  return (
    <dl className={styles.detalhe}>
      <dt>Treinamento</dt>
      <dd>
        {x.codigo} · {x.titulo}
      </dd>
      <dt>Situação</dt>
      <dd>
        <Selo tom={STATUS_TREINAMENTO[x.status].tom}>{STATUS_TREINAMENTO[x.status].rotulo}</Selo>
      </dd>
      <dt>Data prevista</dt>
      <dd>{x.data_inicio ? formatarData(x.data_inicio) : "A definir"}</dd>
    </dl>
  );
}

/** Detalhe de uma necessidade DENTRO do ciclo: mostra o que a LNT analisou na carga (a fotografia), nunca o texto atual. */
export function LntNecessidadeDrawer({ linha, onFechar, rodape }: { linha: NecessidadeNoCicloComViva; onFechar: () => void; rodape?: ReactNode }) {
  const { pessoaPorId } = useDesenvolvimento();
  const v = linha.viva;
  const mudancas = linha.mudanca_observada ? Object.entries(linha.mudanca_observada) : [];
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Necessidade de Desenvolvimento" titulo={linha.descricao_na_carga} sub={`${quemEhANecessidade(linha, pessoaPorId)}${linha.departamento_na_carga ? ` · ${linha.departamento_na_carga}` : ""}`} />}>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Como foi analisada na carga ({dataCurta(linha.carregada_em)})</h4>
        <dl className={styles.detalhe}>
          <dt>Descrição</dt>
          <dd>{linha.descricao_na_carga}</dd>
          <dt>Justificativa</dt>
          <dd>{linha.justificativa_na_carga || "—"}</dd>
          <dt>Sugestão de capacitação</dt>
          <dd>{linha.sugestao_capacitacao_na_carga || "—"}</dd>
          <dt>Prioridade original</dt>
          <dd>{linha.prioridade_na_carga ? <Selo tom={PRIORIDADE[linha.prioridade_na_carga].tom}>{PRIORIDADE[linha.prioridade_na_carga].rotulo}</Selo> : "—"}</dd>
          <dt>Situação na carga</dt>
          <dd>{ROTULO_STATUS_NA_CARGA[linha.status_na_carga]}</dd>
          {v && (
            <>
              <dt>Origem</dt>
              <dd>{ROTULO_ORIGEM[v.origem]}</dd>
              <dt>Categoria</dt>
              <dd>{v.categoria ? CATEGORIA_NECESSIDADE[v.categoria] : "—"}</dd>
            </>
          )}
        </dl>
        <span className={styles.dica}>A LNT guarda a informação desta data. Alterações feitas depois na Base de Necessidades não mudam o que foi analisado.</span>
      </div>

      {linha.alerta_treinamento_id != null && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Treinamento já planejado</h4>
          <TreinamentoRelacionado id={linha.alerta_treinamento_id} />
          <span className={styles.dica}>Decida se este treinamento já atende a necessidade (e ela não precisa de uma nova ação) ou se ela continua na LNT.</span>
        </div>
      )}

      {mudancas.length > 0 && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Atualizada após a carga{linha.mudou_desde_carga_em ? ` (verificado em ${dataCurta(linha.mudou_desde_carga_em)})` : ""}</h4>
          <ul className={styles.listaMudancas}>
            {mudancas.map(([campo, m]) => (
              <li key={campo}>
                <strong>{ROTULO_CAMPO_MUDANCA[campo] ?? campo}</strong>
                <span className={styles.secundario}>
                  {textoDoValor(campo, m.antes)} → {textoDoValor(campo, m.depois)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {linha.decisao !== "candidata" && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Decisão</h4>
          {linha.decisao === "em_item" ? (
            <span>Consolidada em um item da LNT.</span>
          ) : (
            <dl className={styles.detalhe}>
              <dt>Situação</dt>
              <dd>Não priorizada</dd>
              <dt>Motivo</dt>
              <dd>{linha.motivo}</dd>
              <dt>Em</dt>
              <dd>{dataCurta(linha.decidido_em)}</dd>
            </dl>
          )}
          <span className={styles.dica}>A necessidade continua registrada na Base de Necessidades.</span>
        </div>
      )}
      {rodape && <div className={styles.secao}>{rodape}</div>}
    </Drawer>
  );
}
