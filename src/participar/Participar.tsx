// Página /participar/:token — confirmação de presença por QR (módulo Desenvolvimento).
// Leve de propósito: não carrega o portal (nem a base de colaboradores).
// Quem já tem sessão válida (a mesma do portal, guardada neste navegador) vai direto
// para "Confirmar minha presença". Quem não tem se identifica com o e-mail corporativo:
// pelo link recebido OU digitando o código do mesmo e-mail — o código mantém a sessão
// NESTE navegador mesmo quando o e-mail é aberto no Outlook ou em outro aplicativo.
// O servidor confere o QR (validade/encerramento), a inscrição e grava a presença;
// o navegador nunca escreve no banco e a identidade vem sempre da sessão, nunca do que
// a página envia.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";
import { FormularioReacao } from "../features/desenvolvimento/FormularioReacao";
import styles from "./Participar.module.css";

/** Lido pelo script de index.html: se o link do e-mail cair na raiz do portal, volta para cá. */
const CHAVE_PENDENTE = "pf_participar_pendente";
/** Só o e-mail digitado (para preencher na próxima vez); nunca sessão, token ou código. */
const CHAVE_EMAIL = "pf_participar_email";
const DOMINIO = "@msbbrasil.com";

interface Info {
  /** Código do treinamento (TRN-…): chave da avaliação de reação. */
  codigo?: string;
  /** Avaliação de reação: pendente (logo após a presença confirmada) | vencida (ainda pode responder) | respondida | null (não se aplica). */
  avaliacao?: "pendente" | "vencida" | "respondida" | null;
  /** Último dia para responder (7 dias corridos após a presença). */
  avaliacao_prazo?: string | null;
  titulo: string;
  documento: string | null;
  data: string | null;
  primeiro_nome: string;
  situacao: "pendente" | "confirmada" | "nao_inscrito";
  homologacao?: boolean;
  confirmada_em?: string;
}

type Estado =
  | { tipo: "carregando" }
  | { tipo: "login"; aviso?: string }
  | { tipo: "link_enviado"; email: string }
  | { tipo: "info"; info: Info }
  | { tipo: "erro"; mensagem: string };

function emailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_EMAIL) ?? "";
  } catch {
    return "";
  }
}

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

async function enviarReacao(codigo: string, respostas: number[]) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/desenvolvimento?acao=reacao_responder", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ codigo, respostas }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Não foi possível enviar a avaliação.");
}

export function Participar() {
  const token = lerToken();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [email, setEmail] = useState(emailLembrado);
  const [codigo, setCodigo] = useState("");
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // O Supabase também emite SIGNED_IN ao abrir a página com sessão guardada: não repete a consulta enquanto uma já está em andamento.
  const emAndamento = useRef(false);
  const abrir = useCallback(async () => {
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
  const carregar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      await abrir();
    } finally {
      emAndamento.current = false;
    }
  }, [abrir]);

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
      localStorage.setItem(CHAVE_EMAIL, alvo);
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

  async function entrarComCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (estado.tipo !== "link_enviado") return;
    const digitos = codigo.replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(digitos)) {
      setAvisoCodigo("Digite o código numérico que veio no e-mail.");
      return;
    }
    setEnviando(true);
    setAvisoCodigo(null);
    // Sucesso dispara SIGNED_IN: o listener acima abre direto a confirmação do treinamento.
    const { error } = await supabase.auth.verifyOtp({ email: estado.email, token: digitos, type: "email" });
    setEnviando(false);
    if (error) setAvisoCodigo("Código inválido ou vencido. Confira o último e-mail recebido ou peça um novo link.");
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
            <p className={styles.texto}>Entre com seu e-mail corporativo. Você recebe um e-mail de acesso e só precisa fazer isso uma vez neste aparelho.</p>
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
              Enviamos um e-mail para <strong>{estado.email}</strong>. Abra o link <strong>neste aparelho</strong> para confirmar a presença.
            </p>
            <form onSubmit={entrarComCodigo} className={styles.form}>
              <p className={styles.texto}>
                Abriu o e-mail no Outlook ou em outro aplicativo? Se o e-mail trouxer um <strong>código</strong>, digite-o aqui: você entra neste navegador e continua do ponto em que parou.
              </p>
              <input className={styles.input} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Código do e-mail" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={14} />
              {avisoCodigo && <p className={styles.aviso}>{avisoCodigo}</p>}
              <button className={styles.botao} type="submit" disabled={enviando || !codigo.trim()}>
                {enviando ? "Entrando…" : "Entrar com o código"}
              </button>
            </form>
            <button className={styles.link} type="button" onClick={() => setEstado({ tipo: "login" })}>
              Usar outro e-mail
            </button>
          </>
        )}

        {estado.tipo === "info" && (
          <>
            <p className={styles.texto}>Olá, {estado.info.primeiro_nome}.</p>
            <h1 className={styles.titulo}>{estado.info.titulo}</h1>
            {estado.info.homologacao && <p className={styles.eyebrow}>TESTE — treinamento de homologação, sem validade oficial</p>}
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
            {estado.info.situacao === "confirmada" && (estado.info.avaliacao === "pendente" || estado.info.avaliacao === "vencida") && estado.info.codigo && (
              <FormularioReacao
                titulo={estado.info.titulo}
                textoPrazo={estado.info.avaliacao_prazo ? (estado.info.avaliacao === "vencida" ? `O prazo terminou em ${formatarData(estado.info.avaliacao_prazo)}, mas você ainda pode responder.` : `Responda até ${formatarData(estado.info.avaliacao_prazo)}.`) : undefined}
                onEnviar={async (respostas) => {
                  await enviarReacao(estado.info.codigo as string, respostas);
                  setEstado({ tipo: "info", info: { ...estado.info, avaliacao: "respondida" } });
                }}
              />
            )}
            {estado.info.situacao === "confirmada" && estado.info.avaliacao === "respondida" && <p className={styles.ok}>✓ Avaliação do treinamento registrada. Obrigado!</p>}
            {estado.info.situacao === "confirmada" && (
              <a className={styles.link} href="/meus-treinamentos">
                Ver meus treinamentos
              </a>
            )}
            <button
              className={styles.link}
              type="button"
              onClick={async () => {
                // Só este aparelho: não derruba a sessão do portal em outros dispositivos.
                await supabase.auth.signOut({ scope: "local" });
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
