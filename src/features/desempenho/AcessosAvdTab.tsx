import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast } from "../../components/shared/ToastContext";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { listarAcessosAvd, provisionarAcesso, type ContaAcesso } from "../../repositories/acessosRepository";
import styles from "./AcessosAvdTab.module.css";

/** Lista separada da tela "/acessos" principal — só colaboradores elegíveis
 * pra Avaliação de Desempenho (ativos, 6+ meses de empresa) que não são
 * RH/Diretoria/gestor (ver buildAccessAvd() em domain/hierarquia.ts). Liberar
 * acesso aqui dá ao colaborador um perfil restrito: só a própria Avaliação
 * de Desempenho, nada mais do portal. */
export function AcessosAvdTab() {
  const { flash } = useToast();

  const [contas, setContas] = useState<ContaAcesso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [provisionando, setProvisionando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    listarAcessosAvd()
      .then(setContas)
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleLiberar(email: string) {
    setProvisionando(email);
    try {
      const { jaExistia } = await provisionarAcesso(email);
      flash(jaExistia ? "Esse e-mail já tinha acesso provisionado." : `Acesso liberado para ${email}.`);
      setContas((atual) => atual?.map((c) => (c.email === email ? { ...c, provisionado: true } : c)) ?? atual);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Falha ao liberar acesso.");
    } finally {
      setProvisionando(null);
    }
  }

  return (
    <>
      <div className={styles.banner}>
        <KeyRound size={16} strokeWidth={1.8} />
        <span>
          Colaboradores elegíveis para a Avaliação de Desempenho (ativos, 6+ meses de empresa) que ainda não têm
          acesso ao portal. Ao liberar, o colaborador loga e vê só a própria Avaliação de Desempenho — nada mais do
          portal.
        </span>
      </div>

      {erro && (
        <div className={styles.erro}>
          {erro}
          <button type="button" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      )}

      {!erro && carregando && !contas && <div className={styles.carregando}>Carregando acessos...</div>}

      {!erro && contas && contas.length === 0 && <EmptyState message="Nenhum colaborador elegível pendente de acesso." />}

      {!erro && contas && contas.length > 0 && (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>E-mail</th>
                <th>Status</th>
                <th className={tableStyles.right}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.email}>
                  <td>{c.nome}</td>
                  <td>{c.cargo}</td>
                  <td>{c.depto}</td>
                  <td className={styles.emailCell}>{c.email}</td>
                  <td>
                    {c.provisionado ? (
                      <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">
                        Provisionado
                      </Badge>
                    ) : (
                      <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">
                        Sem acesso
                      </Badge>
                    )}
                  </td>
                  <td className={tableStyles.right}>
                    {!c.provisionado && (
                      <Button variant="primary" onClick={() => handleLiberar(c.email)} disabled={provisionando === c.email}>
                        {provisionando === c.email ? "Liberando..." : "Liberar acesso"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
