import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Avatar, Badge, Button, Drawer, EmptyState, tableStyles } from "../../components/ui";
import { fechamentoDe, pendenteFechamento } from "../../domain/desligados";
import { construirEventos } from "../../domain/historico";
import { tipoColor } from "../../domain/colors";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador } from "../../types/domain";
import { PendenciasDesligadosCard } from "./PendenciasDesligadosCard";
import { ConferenciaFinanceira, DialogoValidarManual } from "./ConferenciaFinanceira";
import confStyles from "./ConferenciaFinanceira.module.css";
import type { LinhaConferencia } from "../../domain/custosRescisao";
import styles from "./DesligadosPage.module.css";

export function DesligadosPage() {
  const { perfil, desligados, desligamentosFinanceiros, conferenciaFinanceira, pendenciasFinanceirasCount, movimentacoes, podeVerCadastros, salvarFechamentoFinanceiro } = usePortalData();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<"lista" | "conferencia">("lista");

  // linha da conferência financeira de cada desligado do cadastro (valores individuais: só o RH recebe)
  const linhaDe = (c: Colaborador): LinhaConferencia | null => conferenciaFinanceira?.saidas.find((l) => l.colaboradorId === c.id) ?? null;

  const desligadosOrdenados = useMemo(
    () => [...desligados].sort((a, b) => a.nome.localeCompare(b.nome)),
    [desligados],
  );

  const colaboradorSelecionado = useMemo(
    () => desligados.find((c) => c.nome === selecionado) ?? null,
    [desligados, selecionado],
  );

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
      ) : desligadosOrdenados.length === 0 ? (
        <EmptyState message="Nenhum colaborador desligado ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Departamento</th>
                <th>Data de desligamento</th>
                <th>Motivo</th>
                <th>Status financeiro</th>
              </tr>
            </thead>
            <tbody>
              {desligadosOrdenados.map((c) => {
                const linha = linhaDe(c);
                const rotuloFin = linha
                  ? linha.rescisao.status === "divergente"
                    ? "Divergente"
                    : linha.rescisao.status === "validado" && linha.grrf.status !== "pendente"
                      ? "Validado"
                      : linha.rescisao.status === "validado" || linha.grrf.status !== "pendente"
                        ? "Parcial"
                        : "Pendente"
                  : pendenteFechamento(c.nome, desligamentosFinanceiros)
                    ? "Pendente"
                    : "Completo";
                return (
                  <tr key={c.nome} className={tableStyles.clickable} onClick={() => setSelecionado(c.nome)}>
                    <td>
                      <div className={styles.pessoa}>
                        <Avatar nome={c.nome} size={30} />
                        <span>{c.nome}</span>
                      </div>
                    </td>
                    <td>{c.depto}</td>
                    <td>{c.dataDesligamento}</td>
                    <td>{c.motivoDesligamento}</td>
                    <td>
                      {rotuloFin === "Validado" || rotuloFin === "Completo" ? (
                        <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">
                          {rotuloFin}
                        </Badge>
                      ) : rotuloFin === "Divergente" ? (
                        <Badge bg="var(--color-danger-bg)" fg="var(--color-danger-fg)" dot="var(--color-danger)">
                          Divergente
                        </Badge>
                      ) : (
                        <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">
                          {rotuloFin}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {perfil === "RH" && aba === "lista" && <PendenciasDesligadosCard />}

      {colaboradorSelecionado && (
        <DesligadoDrawer
          colaborador={colaboradorSelecionado}
          fechamento={fechamentoDe(colaboradorSelecionado.nome, desligamentosFinanceiros)}
          linha={linhaDe(colaboradorSelecionado)}
          onIrConferencia={() => {
            setSelecionado(null);
            setAba("conferencia");
          }}
          eventos={construirEventos(movimentacoes.filter((m) => m.colaborador === colaboradorSelecionado.nome))}
          onClose={() => setSelecionado(null)}
          onSalvar={salvarFechamentoFinanceiro}
        />
      )}
    </>
  );
}

interface DesligadoDrawerProps {
  colaborador: Colaborador;
  fechamento: ReturnType<typeof fechamentoDe>;
  linha: LinhaConferencia | null;
  onIrConferencia: () => void;
  eventos: ReturnType<typeof construirEventos>;
  onClose: () => void;
  onSalvar: (colaboradorNome: string, valorRescisao: number | null, valorGrrf: number | null) => Promise<{ ok: true } | { ok: false }>;
}

function DesligadoDrawer({ colaborador: c, fechamento, linha, onIrConferencia, eventos, onClose, onSalvar }: DesligadoDrawerProps) {
  const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [dialogoManual, setDialogoManual] = useState<"rescisao" | "grrf" | null>(null);
  const [mensagemManual, setMensagemManual] = useState<string | null>(null);
  const [valorRescisao, setValorRescisao] = useState(fechamento?.valorRescisao != null ? String(fechamento.valorRescisao) : "");
  const [valorGrrf, setValorGrrf] = useState(fechamento?.valorGrrf != null ? String(fechamento.valorGrrf) : "");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    setSalvando(true);
    // aceita "2.500,50", "2500,5" e "2500.50"
    const paraNumero = (t: string) => (t.trim() === "" ? null : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t));
    const rescisao = paraNumero(valorRescisao);
    const grrf = paraNumero(valorGrrf);
    await onSalvar(c.nome, Number.isFinite(rescisao) ? rescisao : null, Number.isFinite(grrf) ? grrf : null);
    setSalvando(false);
  }

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
          <span className={styles.detalheLabel}>Gestor imediato</span>
          <span className={styles.detalheValor}>{c.gestor}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Data de desligamento</span>
          <span className={styles.detalheValor}>{c.dataDesligamento}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Motivo</span>
          <span className={styles.detalheValor}>{c.motivoDesligamento}</span>
        </div>
        <div className={styles.detalheItem}>
          <span className={styles.detalheLabel}>Registrado por</span>
          <span className={styles.detalheValor}>{c.desligadoBy || "—"}</span>
        </div>
      </div>

      <h4 className={styles.sectionTitle}>Fechamento financeiro</h4>
      {linha && linha.rescisaoId !== null ? (
        <>
          <div className={styles.financeiroGrid}>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Valor da rescisão (líquido da folha)</span>
              <span className={styles.detalheValor}>
                {linha.rescisao.status === "validado" ? money(linha.rescisao.valor ?? 0) : `${money(linha.liquidoFolha ?? 0)} — a validar`}
              </span>
              {linha.rescisao.status === "divergente" && linha.rescisao.lancado !== null && <span className={styles.detalheLabel}>Divergente: lançado {money(linha.rescisao.lancado)}</span>}
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Valor da GRRF (total recolhido)</span>
              <span className={styles.detalheValor}>
                {linha.grrf.status === "validado" ? money(linha.grrf.total ?? 0) : linha.grrf.status === "nao_aplicavel" ? "Não aplicável" : "Pendente de registro"}
              </span>
              {linha.grrf.status === "pendente" && linha.grrf.lancado !== null && <span className={styles.detalheLabel}>Lançada no cadastro: {money(linha.grrf.lancado)}</span>}
            </div>
          </div>
          <p className={styles.semHistorico}>Os valores vêm da folha de rescisão e são validados pelo RH na Conferência financeira — não é preciso digitar.</p>
          <Button variant="primary" onClick={onIrConferencia} className={styles.salvarBtn}>
            Abrir a Conferência financeira
          </Button>
        </>
      ) : (
        <>
          <div className={styles.financeiroGrid}>
            <label className={styles.campo}>
              <span>Valor da rescisão (R$)</span>
              <input value={valorRescisao} onChange={(e) => setValorRescisao(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </label>
            <label className={styles.campo}>
              <span>Valor da GRRF (R$)</span>
              <input value={valorGrrf} onChange={(e) => setValorGrrf(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </label>
          </div>
          <p className={styles.semHistorico}>Sem rescisão importada da folha: lançamento manual do RH. Salvar apenas LANÇA o valor — ele só passa a valer nos custos depois da validação expressa abaixo, com a fonte documental.</p>
          <Button variant="primary" onClick={handleSalvar} disabled={salvando} className={styles.salvarBtn}>
            {salvando ? "Salvando..." : "Salvar lançamento"}
          </Button>
          {linha && (
            <div className={styles.financeiroGrid} style={{ marginTop: 14 }}>
              <div className={styles.detalheItem}>
                <span className={styles.detalheLabel}>Rescisão</span>
                <span className={styles.detalheValor}>
                  {linha.rescisao.status === "validado" ? `Validada por ${linha.rescisao.validadaPor ?? "—"}` : linha.rescisao.lancado !== null ? "Lançada — a validar" : "Sem lançamento"}
                </span>
                {linha.rescisao.status === "pendente" && linha.rescisao.lancado !== null && (
                  <Button variant="secondary" onClick={() => setDialogoManual("rescisao")}>Validar rescisão…</Button>
                )}
              </div>
              <div className={styles.detalheItem}>
                <span className={styles.detalheLabel}>GRRF</span>
                <span className={styles.detalheValor}>
                  {linha.grrf.status === "validado" ? `Validada por ${linha.grrf.validadaPor ?? "—"}` : linha.grrf.status === "nao_aplicavel" ? "Não aplicável (justificada)" : linha.grrf.lancado !== null ? "Lançada — a validar" : "Pendente"}
                </span>
                {linha.grrf.status === "pendente" && (
                  <Button variant="secondary" onClick={() => setDialogoManual("grrf")}>Validar GRRF…</Button>
                )}
              </div>
            </div>
          )}
          {mensagemManual && <p className={styles.semHistorico}>{mensagemManual}</p>}
          {linha && dialogoManual && (
            <DialogoValidarManual linha={linha} componente={dialogoManual} onClose={() => setDialogoManual(null)} onMensagem={setMensagemManual} />
          )}
        </>
      )}

      <h4 className={styles.sectionTitle}>Histórico ({eventos.length})</h4>
      {eventos.length === 0 ? (
        <div className={styles.semHistorico}>Nenhuma movimentação registrada para este colaborador.</div>
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
