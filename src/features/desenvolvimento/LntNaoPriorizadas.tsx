import { useMemo, useState } from "react";
import { Ban } from "lucide-react";
import { Button, Card, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { useDesenvolvimento } from "./contexto";
import { Erro, EstadoVazio } from "./componentes";
import { lnt, type CicloLnt, type NecessidadeNoCicloComViva } from "./lntRepository";
import { necessidadesNaoPriorizadasDe, resumoDoItem, type DadosCiclo } from "./lntDados";
import { dataCurta, mensagemDeErro, quemEhANecessidade, TEXTO_DEMANDA_DIRETA } from "./lntRotulos";
import { LntNecessidadeDrawer } from "./LntNecessidadeDrawer";
import { LntItemDrawer } from "./LntItemDrawer";
import styles from "./Desenvolvimento.module.css";

/**
 * Necessidades avulsas e itens que a RH decidiu não priorizar neste ciclo. Nada é cancelado:
 * as necessidades continuam na Base de Necessidades e podem voltar em outro ciclo.
 */
export function LntNaoPriorizadas({ ciclo, dados, podeEditar, recarregar }: { ciclo: CicloLnt; dados: DadosCiclo; podeEditar: boolean; recarregar: () => void }) {
  const { flash } = useToast();
  const { pessoaPorId } = useDesenvolvimento();
  const avulsas = useMemo(() => necessidadesNaoPriorizadasDe(dados), [dados]);
  const itens = useMemo(() => dados.itens.filter((i) => i.situacao === "nao_priorizado"), [dados.itens]);
  const [necessidadeAberta, setNecessidadeAberta] = useState<NecessidadeNoCicloComViva | null>(null);
  const [itemAberto, setItemAberto] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<number | null>(null);

  async function reconsiderar(l: NecessidadeNoCicloComViva) {
    setErro(null);
    setProcessando(l.id);
    try {
      await lnt.reconsiderarNecessidades(ciclo.id, [l.necessidade_id]);
      flash("Necessidade devolvida para a Base para análise.");
      setNecessidadeAberta(null);
      recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setProcessando(null);
    }
  }

  if (avulsas.length === 0 && itens.length === 0) {
    return (
      <>
        <Card>
          <EstadoVazio icone={<Ban size={26} strokeWidth={1.6} />} titulo="Nada foi não priorizado neste ciclo." descricao="Necessidades e itens que a RH decidir não priorizar aparecem aqui, com o motivo. Elas continuam registradas na Base de Necessidades." />
        </Card>
        {/* o detalhe de um item recém reconsiderado continua aberto, mesmo que ele tenha saído desta lista */}
        {itemAberto != null && <LntItemDrawer ciclo={ciclo} dados={dados} itemId={itemAberto} podeEditar={podeEditar} onFechar={() => setItemAberto(null)} recarregar={recarregar} />}
      </>
    );
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Não priorizadas</h3>
          <p className={styles.cardSubtitle}>Decisões da LNT deste ciclo. As necessidades continuam registradas na Base de Necessidades e podem ser consideradas em outro ciclo.</p>
        </div>
      </div>
      {erro && <Erro mensagem={erro} />}

      {avulsas.length > 0 && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Necessidades ({avulsas.length})</h4>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Necessidade</th>
                  <th>Pessoa ou cargo</th>
                  <th>Motivo</th>
                  <th>Decisão</th>
                  {podeEditar && <th />}
                </tr>
              </thead>
              <tbody>
                {avulsas.map((l) => (
                  <tr key={l.id} className={styles.linhaClicavel} onClick={() => setNecessidadeAberta(l)}>
                    <td>{l.descricao_na_carga}</td>
                    <td>
                      {quemEhANecessidade(l, pessoaPorId)}
                      {l.departamento_na_carga && <div className={styles.secundario}>{l.departamento_na_carga}</div>}
                    </td>
                    <td className={styles.secundario}>{l.motivo}</td>
                    <td className={styles.secundario}>{dataCurta(l.decidido_em)}</td>
                    {podeEditar && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <Button variant="secondary" disabled={processando === l.id} onClick={() => void reconsiderar(l)}>
                          Reconsiderar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {itens.length > 0 && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Itens ({itens.length})</h4>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Departamentos</th>
                  <th>Motivo</th>
                  <th>Decisão</th>
                  {podeEditar && <th />}
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const r = resumoDoItem(dados, i);
                  return (
                    <tr key={i.id} className={styles.linhaClicavel} onClick={() => setItemAberto(i.id)}>
                      <td>
                        {i.titulo}
                        <div className={styles.secundario}>
                          {r.necessidades > 0 ? `${r.necessidades} ${r.necessidades === 1 ? "necessidade" : "necessidades"}` : i.origem_item === "direto" ? TEXTO_DEMANDA_DIRETA : "Sem necessidades"}
                        </div>
                      </td>
                      <td className={styles.secundario}>{r.departamentos.join(", ") || "—"}</td>
                      <td className={styles.secundario}>{i.motivo_decisao}</td>
                      <td className={styles.secundario}>{dataCurta(i.decidido_em)}</td>
                      {podeEditar && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <Button variant="secondary" onClick={() => setItemAberto(i.id)}>
                            Reconsiderar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {podeEditar && <span className={styles.dica}>Reconsiderar um item abre o detalhe: defina a prioridade, se faltar, e use “Reconsiderar e incluir”.</span>}
        </div>
      )}

      {necessidadeAberta && (
        <LntNecessidadeDrawer
          linha={dados.linhas.find((l) => l.id === necessidadeAberta.id) ?? necessidadeAberta}
          onFechar={() => setNecessidadeAberta(null)}
          rodape={
            podeEditar && (
              <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
                <Button variant="secondary" onClick={() => void reconsiderar(necessidadeAberta)}>
                  Reconsiderar
                </Button>
              </div>
            )
          }
        />
      )}
      {itemAberto != null && <LntItemDrawer ciclo={ciclo} dados={dados} itemId={itemAberto} podeEditar={podeEditar} onFechar={() => setItemAberto(null)} recarregar={recarregar} />}
    </Card>
  );
}
