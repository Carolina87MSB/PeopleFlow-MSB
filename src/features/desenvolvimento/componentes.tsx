import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "../../components/ui";
import { TAMANHO_PAGINA } from "./devRepository";
import type { Tom } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

export interface AbaDef<T extends string> {
  id: T;
  rotulo: string;
}

/** Abas com sub-rota própria (/desenvolvimento/<tela>/<aba>), mesmo visual das abas de Gestão de Desempenho. */
export function Abas<T extends string>({ base, abas, atual }: { base: string; abas: AbaDef<T>[]; atual: T }) {
  const navigate = useNavigate();
  return (
    <div className={styles.abas} role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          aria-selected={a.id === atual}
          className={a.id === atual ? styles.abaAtiva : styles.aba}
          onClick={() => navigate(`${base}/${a.id}`)}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={[styles.selo, styles[`tom_${tom}`]].join(" ")}>{children}</span>;
}

export function EstadoVazio({ titulo, descricao, icone }: { titulo: string; descricao?: string; icone: ReactNode }) {
  return (
    <div className={styles.estado}>
      {icone}
      <strong>{titulo}</strong>
      {descricao && <span>{descricao}</span>}
    </div>
  );
}

export function Carregando() {
  return (
    <div className={styles.estado}>
      <LoaderCircle size={22} strokeWidth={1.8} />
      <span>Carregando...</span>
    </div>
  );
}

export function Erro({ mensagem }: { mensagem: string }) {
  return <div className={styles.erro}>{mensagem}</div>;
}

export function Paginacao({ pagina, total, onChange }: { pagina: number; total: number; onChange: (p: number) => void }) {
  if (total <= TAMANHO_PAGINA) return null;
  const de = pagina * TAMANHO_PAGINA + 1;
  const ate = Math.min(total, (pagina + 1) * TAMANHO_PAGINA);
  return (
    <div className={styles.paginacao}>
      <span>
        {de}–{ate} de {total}
      </span>
      <button type="button" aria-label="Página anterior" disabled={pagina === 0} onClick={() => onChange(pagina - 1)}>
        <ChevronLeft size={15} />
      </button>
      <button type="button" aria-label="Próxima página" disabled={ate >= total} onClick={() => onChange(pagina + 1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export function CabecalhoDrawer({ eyebrow, titulo, sub }: { eyebrow: string; titulo: string; sub?: ReactNode }) {
  return (
    <div>
      <div className={styles.drawerEyebrow}>{eyebrow}</div>
      <h2 className={styles.drawerTitle}>{titulo}</h2>
      {sub && <div className={styles.drawerSub}>{sub}</div>}
    </div>
  );
}

/** Botão que abre um campo de motivo antes de confirmar (inativação, rejeição, reativação). */
export function ConfirmarComMotivo(props: {
  rotulo: string;
  confirmar: string;
  variante: "danger" | "success" | "secondary";
  motivoObrigatorio: boolean;
  desabilitado?: boolean;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!aberto) {
    return (
      <Button type="button" variant={props.variante} disabled={props.desabilitado} onClick={() => setAberto(true)}>
        {props.rotulo}
      </Button>
    );
  }
  return (
    <div className={styles.secao} style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 0, width: "100%" }}>
      <label className={styles.campo}>
        Motivo{props.motivoObrigatorio ? " *" : " (opcional)"}
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} autoFocus />
      </label>
      <div className={styles.acoes}>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant={props.variante}
          disabled={enviando || (props.motivoObrigatorio && !motivo.trim())}
          onClick={async () => {
            setEnviando(true);
            try {
              await props.onConfirmar(motivo.trim());
              setAberto(false);
              setMotivo("");
            } catch {
              // o erro já é exibido por quem chamou; mantém o campo aberto para nova tentativa
            } finally {
              setEnviando(false);
            }
          }}
        >
          {enviando ? "Salvando..." : props.confirmar}
        </Button>
      </div>
    </div>
  );
}
