import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Avatar, Badge, Button, Drawer, EmptyState, tableStyles } from "../../components/ui";
import { listarDesligamentos, pendenteFechamento, type DesligamentoLista } from "../../domain/desligados";
import { construirEventos } from "../../domain/historico";
import { formatarDataIso } from "../../domain/dates";
import { tipoColor } from "../../domain/colors";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import { PendenciasDesligadosCard } from "./PendenciasDesligadosCard";
import { ConferenciaFinanceira, DialogoLancarConfirmar } from "./ConferenciaFinanceira";
import confStyles from "./ConferenciaFinanceira.module.css";
import type { LinhaConferencia } from "../../domain/custosRescisao";
import styles from "./DesligadosPage.module.css";

interface ChipFin {
  texto: string;
  bg: string;
  fg: string;
  dot?: string;
}
const VERDE: Omit<ChipFin, "texto"> = { bg: "var(--color-success-bg)", fg: "var(--color-success-fg)", dot: "var(--color-success)" };
const ALERTA: Omit<ChipFin, "texto"> = { bg: "var(--color-warning-bg)", fg: "var(--color-warning-fg)", dot: "var(--color-warning)" };
const PERIGO: Omit<ChipFin, "texto"> = { bg: "var(--color-danger-bg)", fg: "var(--color-danger-fg)", dot: "var(--color-danger)" };
const NEUTRO: Omit<ChipFin, "texto"> = { bg: "var(--color-neutral-bg)", fg: "var(--color-neutral-fg)" };

/** Status financeiro da linha, com os dois estados SEPARADOS: Rescisão (líquido da folha validado?) e GRRF (guia confirmada?). O FGTS Rescisório da folha não é estado. */
function statusFinanceiro(linha: LinhaConferencia | null, d: DesligamentoLista, fechamentos: ReturnType<typeof usePortalData>["desligamentosFinanceiros"]): { rescisao: ChipFin; grrf: ChipFin | null } {
  if (linha) {
    const r = linha.rescisao.status;
    const rescisao: ChipFin =
      r === "validado" ? { texto: "Rescisão validada", ...VERDE } : r === "divergente" ? { texto: "Rescisão divergente", ...PERIGO } : linha.liquidoFolha === 0 ? { texto: "Rescisão R$ 0,00 a conferir", ...ALERTA } : { texto: "Rescisão a validar", ...ALERTA };
    const g = linha.grrf.status;
    const grrf: ChipFin = g === "validado" ? { texto: "GRRF confirmada", ...VERDE } : g === "nao_aplicavel" ? { texto: "GRRF não aplicável", ...NEUTRO } : { texto: "GRRF pendente", ...ALERTA };
    return { rescisao, grrf };
  }
  // conferência indisponível: só o que o cadastro sabe
  if (d.origem === "historico") return { rescisao: { texto: "Pendente", ...ALERTA }, grrf: null };
  return pendenteFechamento(d.nome, fechamentos) ? { rescisao: { texto: "Pendente", ...ALERTA }, grrf: null } : { rescisao: { texto: "Completo", ...VERDE }, grrf: null };
}

export function DesligadosPage() {
  const { perfil, desligados, saidasHistoricasSemCadastro, desligamentosFinanceiros, conferenciaFinanceira, pendenciasFinanceirasCount, movimentacoes, podeVerCadastros } = usePortalData();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<"lista" | "conferencia">("lista");

  // linha da conferência financeira de cada desligamento — cadastro (por id) ou histórico sem cadastro (pela chave "h:<id>"); valores individuais: só o RH recebe
  const linhaDe = (d: DesligamentoLista): LinhaConferencia | null =>
    conferenciaFinanceira?.saidas.find((l) => (d.colaborador ? l.colaboradorId === d.colaborador.id : l.chave === d.chave)) ?? null;

  // todos os desligamentos, uma vez cada: processos cadastrados + saídas históricas da folha que não têm cadastro
  const itens = useMemo(() => listarDesligamentos(desligados, saidasHistoricasSemCadastro), [desligados, saidasHistoricasSemCadastro]);
  const qtdCadastro = itens.filter((d) => d.origem === "cadastro").length;
  const qtdHistorico = itens.length - qtdCadastro;

  const itemSelecionado = useMemo(() => itens.find((d) => d.chave === selecionado) ?? null, [itens, selecionado]);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      {perfil === "RH" && (
        <div className={confStyles.abas} role="tablist">
          <button type="button" role="tab" aria-selected={aba === "lista"} className={`${confStyles.aba} ${aba === "lista" ? confStyles.abaAtiva : ""}`} onClick={() => setAba("lista")}>
            Desligados
          </button>
          <button type="button" role="tab" aria-selected={aba === "conferencia"} className={`${confStyles.aba} ${aba === "conferencia" ? confStyles.abaAtiva : ""}`} onClick={() => setAba("conferencia")}>
            Conferência financeira{pendenciasFinanceirasCount > 0 ? ` (${pendenciasFinanceirasCount})` : ""}
          </button>
        </div>
      )}

      {perfil === "RH" && aba === "conferencia" ? (
        <ConferenciaFinanceira />
      ) : itens.length === 0 ? (
        <EmptyState message="Nenhum colaborador desligado ainda." />
      ) : (
        <>
        <p className={styles.resumoLista}>
          {itens.length} desligamentos: {qtdCadastro} com processo cadastrado · {qtdHistorico} do histórico da folha (sem cadastro). Cada pessoa aparece uma única vez.
        </p>
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Origem</th>
                <th>Departamento</th>
                <th>Data de desligamento</th>
                <th>Motivo</th>
                {perfil === "RH" && <th>Status financeiro</th>}
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => {
                const linha = linhaDe(c);
                const fin = statusFinanceiro(linha, c, desligamentosFinanceiros);
                return (
                  <tr key={c.chave} className={tableStyles.clickable} onClick={() => setSelecionado(c.chave)}>
                    <td>
                      <div className={styles.pessoa}>
                        <Avatar nome={c.nome} size={30} />
                        <span>{c.nome}</span>
                      </div>
                    </td>
                    <td>
                      {c.origem === "cadastro" ? (
                        <Badge bg="var(--color-brand-pale)" fg="var(--color-brand)">Cadastro</Badge>
                      ) : (
                        <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">Histórico da folha</Badge>
                      )}
                    </td>
                    <td>{c.depto}</td>
                    <td>{c.dataDesligamento}</td>
                    <td>{c.motivo}</td>
                    {perfil === "RH" && (
                      <td>
                        <div className={styles.statusFin}>
                          <Badge bg={fin.rescisao.bg} fg={fin.rescisao.fg} dot={fin.rescisao.dot}>
                            {fin.rescisao.texto}
                          </Badge>
                          {fin.grrf && (
                            <Badge bg={fin.grrf.bg} fg={fin.grrf.fg} dot={fin.grrf.dot}>
                              {fin.grrf.texto}
                            </Badge>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {perfil === "RH" && aba === "lista" && <PendenciasDesligadosCard />}

      {itemSelecionado && (
        <DesligadoDrawer
          item={itemSelecionado}
          linha={linhaDe(itemSelecionado)}
          ehRH={perfil === "RH"}
          onIrConferencia={() => {
            setSelecionado(null);
            setAba("conferencia");
          }}
          eventos={construirEventos(movimentacoes.filter((m) => m.colaborador === itemSelecionado.nome))}
          onClose={() => setSelecionado(null)}
        />
      )}
    </>
  );
}

interface DesligadoDrawerProps {
  item: DesligamentoLista;
  /** Informação financeira dos desligamentos: só o RH (por decisão do RH, por ora). */
  ehRH: boolean;
  linha: LinhaConferencia | null;
  onIrConferencia: () => void;
  eventos: ReturnType<typeof construirEventos>;
  onClose: () => void;
}

function DesligadoDrawer({ item: c, ehRH, linha, onIrConferencia, eventos, onClose }: DesligadoDrawerProps) {
  const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [dialogoManual, setDialogoManual] = useState(false);
  const [mensagemManual, setMensagemManual] = useState<string | null>(null);

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <Avatar nome={c.nome} size={44} />
          <div>
            <div className={styles.drawerNome}>{c.nome}</div>
            <div className={styles.drawerCargo}>{c.cargo}</div>
          </div>
        </div>
      }
    >
      <div className={styles.detalhes}>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Departamento</span>
          <span className={styles.detalheValor}>{c.depto}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Origem</span>
          <span className={styles.detalheValor}>{c.origem === "cadastro" ? "Processo cadastrado" : "Histórico da folha (sem cadastro)"}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Gestor imediato</span>
          <span className={styles.detalheValor}>{c.gestor}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Admissão</span>
          <span className={styles.detalheValor}>{c.admissao}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Data de desligamento</span>
          <span className={styles.detalheValor}>{c.dataDesligamento}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Motivo</span>
          <span className={styles.detalheValor}>{c.motivo}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Registrado por</span>
          <span className={styles.detalheValor}>{c.registradoPor}</span>
        </div>
      </div>

      {ehRH && (
        <>
        <h4 className={styles.sectionTitle}>Fechamento financeiro</h4>
        {linha ? (
          <>
            <div className={styles.financeiroGrid}>
              <div className={styles.detalheItem}>
                <span className={styles.detalheLabel}>Rescisão (líquido)</span>
                <span className={styles.detalheValor}>
                  {linha.rescisao.status === "validado"
                    ? `${money(linha.rescisao.valor ?? 0)} — validada`
                    : linha.rescisaoId !== null
                      ? `${money(linha.liquidoFolha ?? 0)} — a validar`
                      : linha.rescisao.lancado !== null
                        ? `${money(linha.rescisao.lancado)} — a confirmar`
                        : "Sem valor"}
                </span>
                {linha.rescisao.status === "divergente" && linha.rescisao.lancado !== null && <span className={styles.detalheLabel}>Divergente: lançado {money(linha.rescisao.lancado)} × líquido da folha {money(linha.liquidoFolha ?? 0)}</span>}
                {linha.rescisaoId !== null && <span className={styles.detalheLabel}>Importado da folha{linha.folhaEmitidaEmIso ? ` de ${formatarDataIso(linha.folhaEmitidaEmIso)}` : ""}</span>}
              </div>
              {linha.fgtsRescisorioFolha !== null && (
                <div className={styles.detalheItem}>
                  <span className={styles.detalheLabel}>FGTS Rescisório (folha)</span>
                  <span className={styles.detalheValor}>{money(linha.fgtsRescisorioFolha)}</span>
                  <span className={styles.detalheLabel}>Importado da folha{linha.folhaEmitidaEmIso ? ` de ${formatarDataIso(linha.folhaEmitidaEmIso)}` : ""} — valor calculado, não é guia paga</span>
                </div>
              )}
              <div className={styles.detalheItem}>
                <span className={styles.detalheLabel}>GRRF (guia)</span>
                <span className={styles.detalheValor}>
                  {linha.grrf.status === "validado" ? `${money(linha.grrf.total ?? 0)} — confirmada` : linha.grrf.status === "nao_aplicavel" ? "Não aplicável (justificada)" : "Pendente — nenhuma guia confirmada"}
                </span>
                {linha.grrf.status === "validado" && linha.grrf.validadaPor && <span className={styles.detalheLabel}>Confirmada por {linha.grrf.validadaPor}</span>}
              </div>
            </div>
            <Button variant="primary" onClick={() => setDialogoManual(true)} className={styles.salvarBtn}>
              Lançar e confirmar valores
            </Button>
            {linha.rescisaoId !== null && (
              <p className={styles.semHistorico}>
                Os líquidos da folha também podem ser confirmados em lote na{" "}
                <button type="button" onClick={onIrConferencia} style={{ background: "none", border: 0, padding: 0, color: "var(--color-brand)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
                  Conferência financeira
                </button>
                .
              </p>
            )}
            {mensagemManual && <p className={styles.semHistorico}>{mensagemManual}</p>}
            {dialogoManual && <DialogoLancarConfirmar linha={linha} onClose={() => setDialogoManual(false)} onMensagem={setMensagemManual} />}
          </>
        ) : (
          <p className={styles.semHistorico}>Os valores financeiros individuais só ficam disponíveis para o RH, depois de carregada a Conferência financeira.</p>
        )}
        </>
      )}

      <h4 className={styles.sectionTitle}>Histórico ({eventos.length})</h4>
      {eventos.length === 0 ? (
        <div className={styles.semHistorico}>{c.origem === "historico" ? "Saída importada do histórico da folha: não há movimentações no portal." : "Nenhuma movimentação registrada para este colaborador."}</div>
      ) : (
        <div className={styles.timeline}>
          {eventos.map((evento) => (
            <div key={evento.key} className={styles.item}>
              <span className={styles.dot} style={{ background: tipoColor(evento.tipoCod) }} />
              <div className={styles.itemContent}>
                <div className={styles.itemTopo}>
                  <span className={styles.itemTitulo}>{evento.titulo}</span>
                  <span className={styles.itemData}>{evento.data}</span>
                </div>
                <p className={styles.itemDescricao}>{evento.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
