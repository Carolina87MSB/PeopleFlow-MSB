import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { PortalStoreProvider } from "./store/PortalStoreContext";
import { ToastProvider } from "./components/shared/ToastContext";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ColaboradoresPage } from "./features/colaboradores/ColaboradoresPage";
import { DepartamentosPage } from "./features/departamentos/DepartamentosPage";
import { CargosPage } from "./features/cargos/CargosPage";
import { TiposPage } from "./features/tipos/TiposPage";
import { AcessosPage } from "./features/acessos/AcessosPage";
import { WorkflowPage } from "./features/workflow/WorkflowPage";
import { AprovadasPage } from "./features/aprovadas/AprovadasPage";
import { HistoricoPage } from "./features/historico/HistoricoPage";
import { DesligadosPage } from "./features/desligados/DesligadosPage";
import { AvaliacoesPage } from "./features/avaliacoes/AvaliacoesPage";
import { GestaoDesempenhoPage } from "./features/desempenho/GestaoDesempenhoPage";

// Módulo Desenvolvimento: carregado sob demanda (chunks separados), só
// quando o usuário entra em /desenvolvimento — não pesa no login.
const DesenvolvimentoLayout = lazy(() => import("./features/desenvolvimento/DesenvolvimentoLayout"));
const HabilidadesPage = lazy(() => import("./features/desenvolvimento/HabilidadesPage"));
const LntPage = lazy(() => import("./features/desenvolvimento/LntPage"));
const TreinamentosPage = lazy(() => import("./features/desenvolvimento/TreinamentosPage"));
const TreinamentoPage = lazy(() => import("./features/desenvolvimento/TreinamentoPage"));

function SobDemanda({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function App() {
  return (
    <AuthProvider>
      <PortalStoreProvider>
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
                <Route path="/acessos" element={<AcessosPage />} />
                <Route path="/workflow" element={<WorkflowPage />} />
                <Route path="/aprovadas" element={<AprovadasPage />} />
                <Route path="/historico" element={<HistoricoPage />} />
                <Route path="/desligados" element={<DesligadosPage />} />
                <Route path="/avaliacoes" element={<AvaliacoesPage />} />
                <Route path="/desempenho" element={<GestaoDesempenhoPage />} />
                <Route path="/desempenho/:aba" element={<GestaoDesempenhoPage />} />
                <Route
                  path="/desenvolvimento"
                  element={
                    <SobDemanda>
                      <DesenvolvimentoLayout />
                    </SobDemanda>
                  }
                >
                  <Route index element={<Navigate to="habilidades" replace />} />
                  <Route path="habilidades/:aba?" element={<SobDemanda><HabilidadesPage /></SobDemanda>} />
                  <Route path="lnt/:aba?" element={<SobDemanda><LntPage /></SobDemanda>} />
                  <Route path="treinamentos/:aba?" element={<SobDemanda><TreinamentosPage /></SobDemanda>} />
                  <Route path="treinamento/:id" element={<SobDemanda><TreinamentoPage /></SobDemanda>} />
                  <Route path="*" element={<Navigate to="habilidades" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </PortalStoreProvider>
    </AuthProvider>
  );
}

export default App;
