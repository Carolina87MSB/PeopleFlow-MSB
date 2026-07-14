import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  UserMinus,
  Users,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { agregarCargos, agregarDepartamentos } from "../../domain/agregados";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { Avatar } from "../ui/Avatar";
import styles from "./Sidebar.module.css";

function NavItem({ to, icon, label, badge, badgeTone }: { to: string; icon: React.ReactNode; label: string; badge?: number; badgeTone?: "warning" | "success" | "neutral" }) {
  return (
    <NavLink to={to} className={({ isActive }) => [styles.navItem, isActive ? styles.active : ""].join(" ")}>
      {icon}
      <span className={styles.navLabel}>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className={[styles.badge, badgeTone ? styles[`badge_${badgeTone}`] : ""].join(" ")}>{badge}</span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { logout } = useAuth();
  const { state } = usePortalStore();
  const { conta, colaboradoresVisiveis, movimentacoesVisiveis, podeVerColaboradores, podeVerCadastros, pendenciasFinanceirasCount } =
    usePortalData();

  const totalDeptos = agregarDepartamentos(colaboradoresVisiveis).length;
  const totalCargos = agregarCargos(colaboradoresVisiveis, state.cargosCustom).length;
  const pendentesCount = movimentacoesVisiveis.filter((m) => m.status === "Em Aprovação").length;
  const aprovadasCount = movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído").length;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.logo} />
        <div className={styles.brandRow}>
          <span className={styles.brandDot} />
          <div>
            <div className={styles.brandName}>Portal PeopleFlow</div>
            <div className={styles.brandSub}>Movimentações de Pessoal</div>
          </div>
        </div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.sectionLabel}>Visão geral</div>
        <NavItem to="/dashboard" icon={<LayoutDashboard size={18} strokeWidth={1.9} />} label="Dashboard" />

        <div className={styles.sectionLabel}>Cadastros</div>
        {podeVerColaboradores && (
          <NavItem to="/colaboradores" icon={<Users size={18} strokeWidth={1.9} />} label="Colaboradores" badge={colaboradoresVisiveis.length} badgeTone="neutral" />
        )}
        {podeVerCadastros && (
          <>
            <NavItem to="/departamentos" icon={<Building2 size={18} strokeWidth={1.9} />} label="Departamentos" badge={totalDeptos} badgeTone="neutral" />
            <NavItem to="/cargos" icon={<Briefcase size={18} strokeWidth={1.9} />} label="Cargos" badge={totalCargos} badgeTone="neutral" />
          </>
        )}
        <NavItem to="/tipos" icon={<ArrowLeftRight size={18} strokeWidth={1.9} />} label="Tipos de movimentação" />
        {podeVerCadastros && <NavItem to="/acessos" icon={<KeyRound size={18} strokeWidth={1.9} />} label="Acessos" />}

        <div className={styles.sectionLabel}>Operação</div>
        <NavItem to="/workflow" icon={<ClipboardList size={18} strokeWidth={1.9} />} label="Workflow de aprovação" badge={pendentesCount} badgeTone="warning" />
        <NavItem to="/aprovadas" icon={<CheckCircle2 size={18} strokeWidth={1.9} />} label="Movimentações aprovadas" badge={aprovadasCount} badgeTone="success" />
        <NavItem to="/historico" icon={<History size={18} strokeWidth={1.9} />} label="Histórico" />
        {podeVerCadastros && (
          <NavItem
            to="/desligados"
            icon={<UserMinus size={18} strokeWidth={1.9} />}
            label="Desligados"
            badge={pendenciasFinanceirasCount}
            badgeTone="warning"
          />
        )}
      </nav>

      <div className={styles.footer}>
        <div className={styles.profile}>
          <Avatar nome={conta?.nome ?? ""} size={34} />
          <div className={styles.profileInfo}>
            <div className={styles.profileName}>{conta?.nome}</div>
            <div className={styles.profileRole}>{conta?.cargo}</div>
          </div>
        </div>
        <button type="button" className={styles.logout} onClick={logout}>
          <LogOut size={15} strokeWidth={1.9} />
          Sair
        </button>
      </div>
    </aside>
  );
}
