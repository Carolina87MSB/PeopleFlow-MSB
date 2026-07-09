import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { PortalStoreProvider, usePortalStore } from "./store/PortalStoreContext";
import { ToastProvider } from "./components/shared/ToastContext";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ColaboradoresPage } from "./features/colaboradores/ColaboradoresPage";
import { DepartamentosPage } from "./features/departamentos/DepartamentosPage";
import { CargosPage } from "./features/cargos/CargosPage";
import { TiposPage } from "./features/tipos/TiposPage";
import { WorkflowPage } from "./features/workflow/WorkflowPage";
import { AprovadasPage } from "./features/aprovadas/AprovadasPage";
import { HistoricoPage } from "./features/historico/HistoricoPage";

function AuthProviderBridge({ children }: { children: React.ReactNode }) {
  const { state } = usePortalStore();
  return <AuthProvider colaboradores={state.colaboradores}>{children}</AuthProvider>;
}

function App() {
  return (
    <PortalStoreProvider>
      <AuthProviderBridge>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/colaboradores" element={<ColaboradoresPage />} />
                <Route path="/departamentos" element={<DepartamentosPage />} />
                <Route path="/cargos" element={<CargosPage />} />
                <Route path="/tipos" element={<TiposPage />} />
                <Route path="/workflow" element={<WorkflowPage />} />
                <Route path="/aprovadas" element={<AprovadasPage />} />
                <Route path="/historico" element={<HistoricoPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProviderBridge>
    </PortalStoreProvider>
  );
}

export default App;
