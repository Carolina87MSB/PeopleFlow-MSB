import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { useToast } from "../../components/shared/ToastContext";
import { Badge, Button, Card, EmptyState, FilterChips, tableStyles } from "../../components/ui";
import { ORIENTACOES_SEGURANCA, PERFIS_PORTAL, permissoesPorPerfil } from "../../domain/permissoesPerfis";
import { listarAcessos, provisionarAcesso, type ContaAcesso } from "../../repositories/acessosRepository";
import { usePortalData } from "../../store/usePortalData";
import styles from "./AcessosPage.module.css";

const PERFIL_BADGE: Record<ContaAcesso["perfil"], { bg: string; fg: string }> = {
  RH: { bg: "var(--color-brand-pale)", fg: "var(--color-navy-soft)" },
  Gestor: { bg: "var(--color-brand-pale)", fg: "var(--color-navy-soft)" },
  Diretoria: { bg: "#1f4e5e", fg: "#fff" },
  Colaborador: { bg: "var(--color-neutral-bg)", fg: "var(--color-neutral-fg)" },
};

const FILTRO_PERFIL = ["Todos", "RH", "Gestor", "Diretoria"];
const FILTRO_ACESSO = ["Todos", "Provisionado", "Sem acesso"];
const FILTRO_COLAB = ["Todos", "Ativo", "Desligado"];

type Aba = "usuarios" | "permissoes" | "seguranca";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "usuarios", rotulo: "Usuários" },
  { id: "permissoes", rotulo: "Permissões por perfil" },
  { id: "seguranca", rotulo: "Segurança de acesso" },
];

export function AcessosPage() {
  const { podeVerCadastros } = usePortalData();
  const { flash } = useToast();

  const [contas, setContas] = useState<ContaAcesso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [provisionando, setProvisionando] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("usuarios");
  const [filtroPerfil, setFiltroPerfil] = useState("Todos");
  const [filtroAcesso, setFiltroAcesso] = useState("Todos");
  const [filtroColab, setFiltroColab] = useState("Todos");

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    listarAcessos()
      .then(setContas)
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    if (podeVerCadastros) carregar();
  }, [podeVerCadastros, carregar]);

  const filtradas = useMemo(
    () =>
      (contas ?? []).filter((c) => {
        const situacao = c.situacao ?? "ativo";
        if (filtroPerfil !== "Todos" && c.perfil !== filtroPerfil) return false;
        if (filtroAcesso === "Provisionado" && !c.provisionado) return false;
        if (filtroAcesso === "Sem acesso" && c.provisionado) return false;
        if (filtroColab === "Ativo" && situacao !== "ativo") return false;
        if (filtroColab === "Desligado" && situacao !== "desligado") return false;
        return true;
      }),
    [contas, filtroPerfil, filtroAcesso, filtroColab],
  );
  const desligadosComConta = (contas ?? []).filter((c) => c.situacao === "desligado").length;
  const permissoes = useMemo(() => permissoesPorPerfil(), []);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  async function handleLiberar(email: string) {
    setProvisionando(email);
    try {
      const { jaExistia } = await provisionarAcesso(email);
      flash(jaExistia ? "Esse e-mail já tinha acesso provisionado." : `Acesso liberado para ${email}.`);
      // Recarrega do servidor em vez de só marcar "provisionado" localmente —
      // a chamada pode retornar sucesso sem o e-mail ficar de fato utilizável
      // pro login (ver mesmo ajuste em AcessosAvdTab.tsx).
      carregar();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Falha ao liberar acesso.");
    } finally {
      setProvisionando(null);
    }
  }

  return (
    <>
      <Header />

      <div className={styles.banner}>
        <KeyRound size={16} strokeWidth={1.8} />
        <span>
          Central de consulta e gestão de acessos: quem tem conta no Supabase Auth e consegue pedir o link de acesso ao portal. Colaboradores sem conta aparecem como "Sem acesso" — clique em "Liberar acesso" para
          provisionar. Nenhum acesso é concedido ou revogado automaticamente.
        </span>
      </div>

      <div className={styles.abas} role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={[styles.aba, aba === a.id ? styles.abaAtiva : ""].join(" ")} onClick={() => setAba(a.id)}>
            {a.rotulo}
            {a.id === "usuarios" && desligadosComConta > 0 ? <span className={styles.abaAlerta}>{desligadosComConta}</span> : null}
          </button>
        ))}
      </div>

      {aba === "usuarios" && (
        <>
          {erro && (
            <div className={styles.erro}>
              {erro}
              <button type="button" onClick={carregar}>
                Tentar de novo
              </button>
            </div>
          )}

          {!erro && carregando && !contas && <div className={styles.carregando}>Carregando acessos...</div>}

          {!erro && contas && contas.length === 0 && <EmptyState message="Nenhum colaborador cadastrado ainda." />}

          {!erro && contas && contas.length > 0 && (
            <>
              <div className={styles.filtros}>
                <div className={styles.filtroGrupo}>
                  <span className={styles.filtroRotulo}>Perfil</span>
                  <FilterChips options={FILTRO_PERFIL} value={filtroPerfil} onChange={setFiltroPerfil} />
                </div>
                <div className={styles.filtroGrupo}>
                  <span className={styles.filtroRotulo}>Acesso</span>
                  <FilterChips options={FILTRO_ACESSO} value={filtroAcesso} onChange={setFiltroAcesso} />
                </div>
                <div className={styles.filtroGrupo}>
                  <span className={styles.filtroRotulo}>Colaborador</span>
                  <FilterChips options={FILTRO_COLAB} value={filtroColab} onChange={setFiltroColab} />
                </div>
              </div>
              <p className={styles.contagem}>
                {filtradas.length} de {contas.length} conta(s)
                {desligadosComConta > 0 ? ` · ${desligadosComConta} de colaborador(es) desligado(s) ainda com conta de login — o RH decide a revogação` : ""}
              </p>

              <div className={tableStyles.wrap}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Cargo</th>
                      <th>Perfil</th>
                      <th>E-mail</th>
                      <th>Colaborador</th>
                      <th>Acesso</th>
                      <th className={tableStyles.right}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((c) => {
                      const badge = PERFIL_BADGE[c.perfil];
                      const desligado = c.situacao === "desligado";
                      return (
                        <tr key={c.email}>
                          <td>{c.nome}</td>
                          <td>{c.cargo}</td>
                          <td>
                            <Badge bg={badge.bg} fg={badge.fg}>
                              {c.perfil}
                            </Badge>
                          </td>
                          <td className={styles.emailCell}>{c.email}</td>
                          <td>
                            {desligado ? (
                              <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">
                                Desligado{c.dataDesligamento ? ` em ${c.dataDesligamento}` : ""}
                              </Badge>
                            ) : (
                              <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">
                                Ativo
                              </Badge>
                            )}
                          </td>
                          <td>
                            {c.provisionado ? (
                              <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">
                                Provisionado
                              </Badge>
                            ) : (
                              <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">
                                Sem acesso
                              </Badge>
                            )}
                          </td>
                          <td className={tableStyles.right}>
                            {!c.provisionado && !desligado && (
                              <Button variant="primary" onClick={() => handleLiberar(c.email)} disabled={provisionando === c.email}>
                                {provisionando === c.email ? "Liberando..." : "Liberar acesso"}
                              </Button>
                            )}
                            {desligado && <span className={styles.semAcao}>Revogação: decisão do RH</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {filtradas.length === 0 && (
                      <tr>
                        <td colSpan={7}>Nenhuma conta neste filtro.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {aba === "permissoes" && (
        <Card>
          <h3 className={styles.cardTitle}>Permissões por perfil</h3>
          <p className={styles.cardDesc}>O que cada perfil vê e faz hoje no portal. O quadro é calculado a partir das regras de permissão em uso (menu e telas), não de texto fixo.</p>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Área</th>
                  {PERFIS_PORTAL.map((p) => (
                    <th key={p}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissoes.map((l) => (
                  <tr key={l.item}>
                    <td className={styles.permItem}>
                      {l.item}
                      {l.grupo === "Financeiro" && <span className={styles.permRestrito}>restrito</span>}
                    </td>
                    {PERFIS_PORTAL.map((p) => (
                      <td key={p} className={l.valores[p] === "—" ? styles.permNao : styles.permSim}>
                        {l.valores[p]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.nota}>
            Os dados financeiros de desligamentos (valores individuais e totais) são exclusivos do RH. "Colaborador" é o perfil restrito: só responde a própria Avaliação de Desempenho e acompanha os treinamentos.
          </p>
        </Card>
      )}

      {aba === "seguranca" && (
        <Card>
          <h3 className={styles.cardTitle}>
            <ShieldCheck size={16} strokeWidth={1.9} className={styles.cardIcon} /> Segurança de acesso
          </h3>
          <div className={styles.segGrid}>
            {ORIENTACOES_SEGURANCA.map((o) => (
              <div key={o.titulo} className={styles.segItem}>
                <h4 className={styles.segTitulo}>{o.titulo}</h4>
                <p className={styles.segTexto}>{o.texto}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
