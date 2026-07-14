import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Avatar, Badge, Button, Drawer, EmptyState, tableStyles } from "../../components/ui";
import { fechamentoDe, pendenteFechamento } from "../../domain/desligados";
import { construirEventos } from "../../domain/historico";
import { tipoColor } from "../../domain/colors";
import { Header } from "../../components/layout/Header";
import { usePortalData } from "../../store/usePortalData";
import type { Colaborador } from "../../types/domain";
import styles from "./DesligadosPage.module.css";

export function DesligadosPage() {
  const { desligados, desligamentosFinanceiros, movimentacoes, podeVerCadastros, salvarFechamentoFinanceiro } = usePortalData();
  const [selecionado, setSelecionado] = useState<string | null>(null);

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

      {desligadosOrdenados.length === 0 ? (
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
                const pendente = pendenteFechamento(c.nome, desligamentosFinanceiros);
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
                      {pendente ? (
                        <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">
                          Pendente
                        </Badge>
                      ) : (
                        <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">
                          Completo
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

      {colaboradorSelecionado && (
        <DesligadoDrawer
          colaborador={colaboradorSelecionado}
          fechamento={fechamentoDe(colaboradorSelecionado.nome, desligamentosFinanceiros)}
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
  eventos: ReturnType<typeof construirEventos>;
  onClose: () => void;
  onSalvar: (colaboradorNome: string, valorRescisao: number | null, valorGrrf: number | null) => Promise<{ ok: true } | { ok: false }>;
}

function DesligadoDrawer({ colaborador: c, fechamento, eventos, onClose, onSalvar }: DesligadoDrawerProps) {
  const [valorRescisao, setValorRescisao] = useState(fechamento?.valorRescisao != null ? String(fechamento.valorRescisao) : "");
  const [valorGrrf, setValorGrrf] = useState(fechamento?.valorGrrf != null ? String(fechamento.valorGrrf) : "");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    setSalvando(true);
    const rescisao = valorRescisao.trim() === "" ? null : Number(valorRescisao.replace(",", "."));
    const grrf = valorGrrf.trim() === "" ? null : Number(valorGrrf.replace(",", "."));
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
          <span className={styles.detalheLabel}>Registrado por (Portal SST)</span>
          <span className={styles.detalheValor}>{c.desligadoBy || "—"}</span>
        </div>
      </div>

      <h4 className={styles.sectionTitle}>Fechamento financeiro</h4>
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
      <Button variant="primary" onClick={handleSalvar} disabled={salvando} className={styles.salvarBtn}>
        {salvando ? "Salvando..." : "Salvar fechamento"}
      </Button>

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
