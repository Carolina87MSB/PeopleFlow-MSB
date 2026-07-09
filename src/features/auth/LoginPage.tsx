import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, Mail, MailCheck } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const { email: authEmail, requestMagicLink } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  if (authEmail) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const result = await requestMagicLink(email);
    setEnviando(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnviadoPara(email.trim().toLowerCase());
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src="/assets/msb-logo.png" alt="MSB — Medical System do Brasil" className={styles.logo} />
          <div className={styles.brandName}>Portal PeopleFlow</div>
          <div className={styles.brandSub}>Movimentações de Pessoal</div>
        </div>

        {enviadoPara ? (
          <>
            <h1 className={styles.heading}>Verifique seu e-mail</h1>
            <p className={styles.info}>
              Enviamos um link de acesso para <strong>{enviadoPara}</strong>. Abra o e-mail e clique no link para
              entrar — ele expira em alguns minutos.
            </p>
            <button type="button" className={styles.linkButton} onClick={() => setEnviadoPara(null)}>
              Usar outro e-mail
            </button>
          </>
        ) : (
          <>
            <h1 className={styles.heading}>Acesse com seu e-mail corporativo</h1>
            <p className={styles.info}>
              O acesso é exclusivo para gestores cadastrados, validados pelo e-mail <strong>@msbbrasil.com</strong>.
              Enviaremos um link de acesso — sem senha para lembrar.
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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && (
                <div className={styles.error}>
                  <AlertCircle size={15} strokeWidth={2} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className={styles.submit} disabled={enviando}>
                <MailCheck size={16} strokeWidth={2} />
                {enviando ? "Enviando..." : "Enviar link de acesso"}
              </button>
            </form>
          </>
        )}

        <div className={styles.footer}>
          Apenas e-mails corporativos MSB com conta provisionada pelo RH têm acesso. Não há cadastro aberto de
          usuários.
        </div>
      </div>
    </div>
  );
}
