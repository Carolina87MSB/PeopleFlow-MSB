import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { useToast } from "../../components/shared/ToastContext";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { listarAcessos, provisionarAcesso, type ContaAcesso } from "../../repositories/acessosRepository";
import { usePortalData } from "../../store/usePortalData";
import styles from "./AcessosPage.module.css";

const PERFIL_BADGE: Record<ContaAcesso["perfil"], { bg: string; fg: string }> = {
  RH: { bg: "var(--color-brand-pale)", fg: "var(--color-navy-soft)" },
  Gestor: { bg: "var(--color-brand-pale)", fg: "var(--color-navy-soft)" },
  Diretoria: { bg: "#1f4e5e", fg: "#fff" },
};

export function AcessosPage() {
  const { podeVerCadastros } = usePortalData();
  const { flash } = useToast();

  const [contas, setContas] = useState<ContaAcesso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [provisionando, setProvisionando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    listarAcessos()
      .then(setContas)
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    if (podeVerCadastros) carregar();
  }, [podeVerCadastros, carregar]);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

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
      <Header />

      <div className={styles.banner}>
        <KeyRound size={16} strokeWidth={1.8} />
        <span>
          Gerencia quem tem conta no Supabase Auth e consegue pedir o link de acesso ao portal. Colaboradores sem
          conta aparecem como "Sem acesso" — clique em "Liberar acesso" para provisionar.
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

      {!erro && contas && contas.length === 0 && <EmptyState message="Nenhum colaborador cadastrado ainda." />}

      {!erro && contas && contas.length > 0 && (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Perfil</th>
                <th>E-mail</th>
                <th>Status</th>
                <th className={tableStyles.right}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const badge = PERFIL_BADGE[c.perfil];
                return (
                  <tr key={c.email}>
                    <td>{c.nome}</td>
                    <td>{c.cargo}</td>
                    <td>
                      <Badge bg={badge.bg} fg={badge.fg}>
                        {c.perfil}
                      </Badge>
                    </td>
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
                        <Button
                          variant="primary"
                          onClick={() => handleLiberar(c.email)}
                          disabled={provisionando === c.email}
                        >
                          {provisionando === c.email ? "Liberando..." : "Liberar acesso"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
