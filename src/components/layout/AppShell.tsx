import { Outlet } from "react-router-dom";
import { usePortalStore } from "../../store/PortalStoreContext";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { state, loading } = usePortalStore();

  if (loading && state.colaboradores.length === 0) {
    return <div className={styles.loading}>Carregando portal...</div>;
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
