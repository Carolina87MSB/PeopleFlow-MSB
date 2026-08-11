import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import { useConta } from "../../store/useConta";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { state, loading, error } = usePortalStore();
  const conta = useConta();
  const { logout } = useAuth();
  const location = useLocation();
  // Menu off-canvas — só existe visualmente ≤1024px (ver Sidebar.module.css);
  // acima disso a sidebar já é sempre visível e este estado não tem efeito.
  const [menuAberto, setMenuAberto] = useState(false);

  // Troca de rota fecha o menu automaticamente (cobre navegação por outros
  // meios além do clique no próprio link, ex.: botão "voltar" do navegador).
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

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

  // Perfil "Colaborador" (acesso restrito à AVD) só alcança /desempenho —
  // centralizado aqui em vez de espalhar guarda em cada página, pra nenhuma
  // tela nova esquecer de bloquear esse perfil (ver README > "Gestão de
  // Desempenho").
  if (conta.perfil === "Colaborador" && location.pathname !== "/desempenho") {
    return <Navigate to="/desempenho" replace />;
  }

  return (
    <div className={styles.shell}>
      {/* Sidebar precisa continuar sendo o 1º filho de .shell — a regra
          @media print abaixo esconde a sidebar via `:first-child`. */}
      <Sidebar open={menuAberto} onClose={() => setMenuAberto(false)} />
      <button type="button" className={styles.mobileMenuBtn} onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
        <Menu size={20} strokeWidth={2} />
        <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.mobileLogo} />
      </button>
      {menuAberto && <div className={styles.overlay} onClick={() => setMenuAberto(false)} />}
      <div className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
