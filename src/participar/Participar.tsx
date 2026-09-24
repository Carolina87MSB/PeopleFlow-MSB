// Página /participar/:token — confirmação de presença por QR (módulo Desenvolvimento).
// Leve de propósito: não carrega o portal (nem a base de colaboradores).
// A pessoa se identifica pelo login com e-mail corporativo (magic link); o
// servidor confere o QR (validade/encerramento), a inscrição e grava a
// presença — o navegador nunca escreve no banco.
import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import styles from "./Participar.module.css";

/** Lido pelo script de index.html: se o link do e-mail cair na raiz do portal, volta para cá. */
const CHAVE_PENDENTE = "pf_participar_pendente";
const DOMINIO = "@msbbrasil.com";

interface Info {
  titulo: string;
  documento: string | null;
  data: string | null;
  primeiro_nome: string;
  situacao: "pendente" | "confirmada" | "nao_inscrito";
  confirmada_em?: string;
}

type Estado =
  | { tipo: "carregando" }
  | { tipo: "login"; aviso?: string }
  | { tipo: "link_enviado"; email: string }
  | { tipo: "info"; info: Info }
  | { tipo: "erro"; mensagem: string };

function lerToken(): string {
  const m = window.location.pathname.match(/^\/participar\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? new URLSearchParams(window.location.search).get("t") ?? "";
}

function formatarData(iso: string | null | undefined) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

async function chamar(acao: "presenca_info" | "presenca_confirmar", token: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/desenvolvimento?acao=${acao}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ token }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; dados?: Info };
  return { status: res.status, erro: body.error, info: body.dados };
}

export function Participar() {
  const token = lerToken();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) {
      setEstado({ tipo: "erro", mensagem: "Link de presença inválido. Leia o QR novamente." });
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setEstado({ tipo: "login" });
      return;
    }
    const r = await chamar("presenca_info", token);
    if (r.status === 401) setEstado({ tipo: "login", aviso: r.erro });
    else if (!r.info) setEstado({ tipo: "erro", mensagem: r.erro ?? "Não foi possível abrir a presença." });
    else {
      try {
        localStorage.removeItem(CHAVE_PENDENTE);
      } catch {
        // sem armazenamento local: nada a limpar
      }
      setEstado({ tipo: "info", info: r.info });
    }
  }, [token]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setEstado({ tipo: "erro", mensagem: "Portal não configurado." });
      return;
    }
    // O link do e-mail volta com a sessão na URL: espera o Supabase processá-la.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") void carregar();
    });
    void carregar();
    return () => data.subscription.unsubscribe();
  }, [carregar]);

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    const alvo = email.trim().toLowerCase();
    if (!alvo.endsWith(DOMINIO) && !/^[^@\s]+@biomedical\.com\.br$/.test(alvo)) {
      setEstado({ tipo: "login", aviso: "Use seu e-mail corporativo." });
      return;
    }
    setEnviando(true);
    try {
      localStorage.setItem(CHAVE_PENDENTE, JSON.stringify({ token, ts: Date.now() }));
    } catch {
      // sem armazenamento local: o link do e-mail ainda funciona se voltar direto para esta página
    }
    const { error } = await supabase.auth.signInWithOtp({ email: alvo, options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split("#")[0] } });
    setEnviando(false);
    if (error) {
      setEstado({ tipo: "login", aviso: /signup|not allowed|not found/i.test(error.message) ? "E-mail sem acesso ao PeopleFlow. Procure o responsável pelo treinamento." : error.message });
      return;
    }
    setEstado({ tipo: "link_enviado", email: alvo });
  }

  async function confirmar() {
    setEnviando(true);
    const r = await chamar("presenca_confirmar", token);
    setEnviando(false);
    if (r.info) setEstado({ tipo: "info", info: r.info });
    else setEstado({ tipo: "erro", mensagem: r.erro ?? "Não foi possível confirmar." });
  }

  return (
    <main className={styles.pagina}>
      <section className={styles.cartao}>
        <img src="/assets/msb-logo.png" alt="MSB" className={styles.logo} />
        <p className={styles.eyebrow}>Presença em treinamento</p>

        {estado.tipo === "carregando" && <p className={styles.texto}>Carregando…</p>}

        {estado.tipo === "login" && (
          <form onSubmit={pedirLink} className={styles.form}>
            <h1 className={styles.titulo}>Identifique-se</h1>
            <p className={styles.texto}>Entre com seu e-mail corporativo. Enviaremos um link de acesso; abra-o neste celular.</p>
            <input className={styles.input} type="email" inputMode="email" autoComplete="email" placeholder="nome.sobrenome@msbbrasil.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {estado.aviso && <p className={styles.aviso}>{estado.aviso}</p>}
            <button className={styles.botao} type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Receber link"}
            </button>
          </form>
        )}

        {estado.tipo === "link_enviado" && (
          <>
            <h1 className={styles.titulo}>Verifique seu e-mail</h1>
            <p className={styles.texto}>
              Enviamos um link para <strong>{estado.email}</strong>. Abra-o neste aparelho para confirmar a presença. Se o link abrir a tela inicial do portal, leia o QR de novo.
            </p>
          </>
        )}

        {estado.tipo === "info" && (
          <>
            <p className={styles.texto}>Olá, {estado.info.primeiro_nome}.</p>
            <h1 className={styles.titulo}>{estado.info.titulo}</h1>
            <p className={styles.texto}>
              {estado.info.documento && <>{estado.info.documento} · </>}
              {formatarData(estado.info.data)}
            </p>
            {estado.info.situacao === "pendente" && (
              <button className={styles.botao} type="button" onClick={() => void confirmar()} disabled={enviando}>
                {enviando ? "Confirmando…" : "Confirmar minha presença"}
              </button>
            )}
            {estado.info.situacao === "confirmada" && (
              <p className={styles.ok}>
                ✓ Presença confirmada
                {estado.info.confirmada_em ? ` em ${new Date(estado.info.confirmada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}.
              </p>
            )}
            {estado.info.situacao === "nao_inscrito" && <p className={styles.aviso}>Você não está na lista de participantes deste treinamento. Procure o responsável — ele pode incluir você e registrar a presença.</p>}
            <button
              className={styles.link}
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setEstado({ tipo: "login" });
              }}
            >
              Não é você? Sair
            </button>
          </>
        )}

        {estado.tipo === "erro" && (
          <>
            <h1 className={styles.titulo}>Não foi possível registrar</h1>
            <p className={styles.aviso}>{estado.mensagem}</p>
          </>
        )}
      </section>
    </main>
  );
}
