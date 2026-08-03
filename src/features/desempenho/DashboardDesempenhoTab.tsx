import { usePortalData } from "../../store/usePortalData";
import { DashboardDiretoriaTab } from "./DashboardDiretoriaTab";
import { DashboardGestorTab } from "./DashboardGestorTab";
import { DashboardRHTab } from "./DashboardRHTab";

/** Wrapper fino (Etapa 8) — único componente registrado na aba "Dashboard"
 * de GestaoDesempenhoPage.tsx, escolhe RH/Gestor/Diretoria conforme `perfil`
 * (Colaborador nunca alcança esta aba, ver ABAS_GESTAO). */
export function DashboardDesempenhoTab() {
  const { perfil } = usePortalData();

  if (perfil === "RH") return <DashboardRHTab />;
  if (perfil === "Diretoria") return <DashboardDiretoriaTab />;
  return <DashboardGestorTab />;
}
