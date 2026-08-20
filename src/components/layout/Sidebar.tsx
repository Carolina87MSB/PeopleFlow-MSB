import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Target,
  UserMinus,
  Users,
  X,
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

interface SidebarProps {
  /** Controla o menu off-canvas em telas ≤1024px (ver AppShell.tsx) — sem
   * efeito acima desse breakpoint, onde a sidebar já é sempre visível. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const { state } = usePortalStore();
  const {
    conta,
    perfil,
    colaboradoresVisiveis,
    movimentacoesVisiveis,
    podeVerColaboradores,
    podeVerCadastros,
    podeVerCargos,
    pendenciasFinanceirasCount,
    pendenciasAvaliacaoExperiencia,
  } = usePortalData();

  const totalDeptos = agregarDepartamentos(colaboradoresVisiveis).length;
  // Mesmo escopo de CargosPage.tsx — Gestor só conta os próprios cargos-novos-pendentes.
  const cargosCustomVisiveis = perfil === "Gestor" ? state.cargosCustom.filter((c) => c.gestor === conta?.nome) : state.cargosCustom;
  const totalCargos = agregarCargos(colaboradoresVisiveis, cargosCustomVisiveis).length;
  const pendentesCount = movimentacoesVisiveis.filter((m) => m.status === "Em Aprovação").length;
  const aprovadasCount = movimentacoesVisiveis.filter((m) => m.status === "Aprovado" || m.status === "Concluído").length;

  // Perfil "Colaborador" (acesso restrito à AVD) só alcança /desempenho —
  // menu mínimo em vez da navegação completa, que só levaria a telas que o
  // AppShell já bloqueia pra esse perfil.
  if (conta?.perfil === "Colaborador") {
    return (
      <aside className={[styles.sidebar, open ? styles.open : ""].join(" ")}>
        <div className={styles.brand}>
          <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.logo} />
          <div className={styles.brandRow}>
            <span className={styles.brandDot} />
            <div>
              <div className={styles.brandName}>Portal PeopleFlow</div>
              <div className={styles.brandSub}>Avaliação de Desempenho</div>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar menu">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <nav className={styles.nav} onClick={onClose}>
          <NavItem to="/desempenho" icon={<Target size={18} strokeWidth={1.9} />} label="Minhas Avaliações" />
        </nav>

        <div className={styles.footer}>
          <div className={styles.profile}>
            <Avatar nome={conta.nome} size={34} />
            <div className={styles.profileInfo}>
              <div className={styles.profileName} title={conta.nome}>
                {conta.nome}
              </div>
              <div className={styles.profileRole} title={conta.cargo}>
                {conta.cargo}
              </div>
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

  return (
    <aside className={[styles.sidebar, open ? styles.open : ""].join(" ")}>
      <div className={styles.brand}>
        <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.logo} />
        <div className={styles.brandRow}>
          <span className={styles.brandDot} />
          <div>
            <div className={styles.brandName}>Portal PeopleFlow</div>
            <div className={styles.brandSub}>Movimentações de Pessoal</div>
          </div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar menu">
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      <nav className={styles.nav} onClick={onClose}>
        <div className={styles.sectionLabel}>Visão geral</div>
        <NavItem to="/dashboard" icon={<LayoutDashboard size={18} strokeWidth={1.9} />} label="Dashboard" />

        <div className={styles.sectionLabel}>Cadastros</div>
        {podeVerColaboradores && (
          <NavItem to="/colaboradores" icon={<Users size={18} strokeWidth={1.9} />} label="Colaboradores" badge={colaboradoresVisiveis.length} badgeTone="neutral" />
        )}
        {podeVerCadastros && (
          <NavItem to="/departamentos" icon={<Building2 size={18} strokeWidth={1.9} />} label="Departamentos" badge={totalDeptos} badgeTone="neutral" />
        )}
        {podeVerCargos && (
          <NavItem to="/cargos" icon={<Briefcase size={18} strokeWidth={1.9} />} label="Cargos" badge={totalCargos} badgeTone="neutral" />
        )}
        {/* Visível pra todo mundo (não só RH) desde a Etapa 2.1 — Gestor/Diretoria
            precisam chegar lá pra preencher avaliações dos liderados/próprias. */}
        <NavItem to="/desempenho" icon={<Target size={18} strokeWidth={1.9} />} label="Gestão de Desempenho" />
        <NavItem to="/tipos" icon={<ArrowLeftRight size={18} strokeWidth={1.9} />} label="Tipos de movimentação" />
        {podeVerCadastros && <NavItem to="/acessos" icon={<KeyRound size={18} strokeWidth={1.9} />} label="Acessos" />}

        <div className={styles.sectionLabel}>Operação</div>
        <NavItem to="/workflow" icon={<ClipboardList size={18} strokeWidth={1.9} />} label="Workflow de aprovação" badge={pendentesCount} badgeTone="warning" />
        <NavItem to="/aprovadas" icon={<CheckCircle2 size={18} strokeWidth={1.9} />} label="Movimentações aprovadas" badge={aprovadasCount} badgeTone="success" />
        <NavItem to="/historico" icon={<History size={18} strokeWidth={1.9} />} label="Histórico" />
        <NavItem
          to="/avaliacoes"
          icon={<ClipboardCheck size={18} strokeWidth={1.9} />}
          label="Avaliações de experiência"
          badge={pendenciasAvaliacaoExperiencia.length}
          badgeTone="warning"
        />
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
            <div className={styles.profileName} title={conta?.nome}>
              {conta?.nome}
            </div>
            <div className={styles.profileRole} title={conta?.cargo}>
              {conta?.cargo}
            </div>
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
