import { avatarBg, initials } from "../../domain/avatar";
import styles from "./Avatar.module.css";

interface AvatarProps {
  nome: string;
  size?: number;
}

export function Avatar({ nome, size = 34 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ background: avatarBg(nome), width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(nome)}
    </span>
  );
}
