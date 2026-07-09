import { Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import { useConta } from "../../store/useConta";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { state, loading, error } = usePortalStore();
  const conta = useConta();
  const { logout } = useAuth();

  if (error) {
    return (
      <div className={styles.loading}>
        <p>Não foi possível carregar os dados do portal: {error}</p>
        <button type="button" onClick={() => logout()}>
          Sair
        </button>
      </div>
    );
  }

  if (loading && state.colaboradores.length === 0) {
    return <div className={styles.loading}>Carregando portal...</div>;
  }

  if (!conta) {
    return (
      <div className={styles.loading}>
        <p>
          Seu e-mail está autenticado, mas não há cadastro de gestor associado a ele no Portal PeopleFlow.
          <br />
          Fale com o RH para liberar seu acesso.
        </p>
        <button type="button" onClick={() => logout()}>
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
