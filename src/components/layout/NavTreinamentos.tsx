import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { iniciarSessao } from "../../features/desenvolvimento/devRepository";
import styles from "./Sidebar.module.css";

function Item({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => [styles.navItem, isActive ? styles.active : ""].join(" ")}>
      <GraduationCap size={18} strokeWidth={1.9} />
      <span className={styles.navLabel}>{label}</span>
    </NavLink>
  );
}

/** Treinamentos para quem NÃO tem o menu de Desenvolvimento (RH/Gestor): "Meus treinamentos" (próprio histórico) e, só para quem foi
 * designado responsável/instrutor ou indicado pela gestão, "Treinamentos que conduzo". Quem decide é o servidor: a sessão do módulo só abre
 * para o designado (os demais recebem 403 e o item não aparece). A consulta só roda para este perfil. */
export function NavTreinamentos() {
  const [conduz, setConduz] = useState(false);
  useEffect(() => {
    let vivo = true;
    iniciarSessao()
      .then(() => vivo && setConduz(true))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      {conduz && <Item to="/desenvolvimento/treinamentos/agenda" label="Treinamentos que conduzo" />}
      <Item to="/meus-treinamentos" label="Meus treinamentos" />
    </>
  );
}
