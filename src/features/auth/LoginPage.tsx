import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import styles from "./LoginPage.module.css";

const DEMO_NOMES = [
  "Carolina Matos da Cruz",
  "Yuri Ivonei Crispim",
  "Daniel Emiliano Suguer",
  "Tainara Correia dos Santos",
  "Ravena Peixoto dos Santos",
  "Selma Ribeiro Bispo",
];

export function LoginPage() {
  const { login, contasDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const demoAccounts = DEMO_NOMES.map((nome) => contasDemo.find((a) => a.nome === nome)).filter((a): a is NonNullable<typeof a> => Boolean(a));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = login(email);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    const conta = contasDemo.find((a) => a.email === email.trim().toLowerCase());
    navigate(conta?.perfil === "Diretoria" ? "/workflow" : "/dashboard", { replace: true });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.logo} />
          <div className={styles.brandName}>Portal PeopleFlow</div>
          <div className={styles.brandSub}>Movimentações de Pessoal</div>
        </div>

        <h1 className={styles.heading}>Acesse com seu e-mail corporativo</h1>
        <p className={styles.info}>
          O acesso é exclusivo para gestores cadastrados, validados pelo e-mail <strong>@msbbrasil.com</strong>.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="login-email">
            E-mail corporativo
          </label>
          <div className={styles.inputWrap}>
            <Mail size={16} className={styles.inputIcon} strokeWidth={1.8} />
            <input
              id="login-email"
              type="email"
              className={styles.input}
              placeholder="nome.sobrenome@msbbrasil.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {error && (
            <div className={styles.error}>
              <AlertCircle size={15} strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className={styles.submit}>
            Entrar no portal
            <ArrowRight size={16} strokeWidth={2} />
          </button>
        </form>

        <div className={styles.divider}>ACESSO RÁPIDO · DEMONSTRAÇÃO</div>

        <div className={styles.demoList}>
          {demoAccounts.map((a) => (
            <button
              key={a.email}
              type="button"
              className={styles.demoItem}
              onClick={() => {
                setEmail(a.email);
                setError(null);
              }}
            >
              <span className={styles.demoInfo}>
                <span className={styles.demoName}>{a.nome}</span>
                <span className={styles.demoEmail}>{a.email}</span>
              </span>
              <span className={styles.demoBadge}>{a.perfil}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
