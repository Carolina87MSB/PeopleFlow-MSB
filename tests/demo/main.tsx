// Demonstração LOCAL do Portal de Treinamentos: as telas REAIS do módulo (TreinamentosPage, TreinamentoPage, MeusTreinamentosPage) sobre um servidor
// local com banco em memória e pessoas fictícias. O menu lateral e o cabeçalho abaixo são simplificados (o menu real está coberto por outros testes).
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import "../../src/index.css";
import { ToastProvider } from "../../src/components/shared/ToastContext";
import { ContextoDesenvolvimentoCtx, type ContextoDesenvolvimento } from "../../src/features/desenvolvimento/contexto";
import { iniciarSessao } from "../../src/features/desenvolvimento/devRepository";
import TreinamentosPage from "../../src/features/desenvolvimento/TreinamentosPage";
import TreinamentoPage from "../../src/features/desenvolvimento/TreinamentoPage";
import MeusTreinamentosPage from "../../src/features/desenvolvimento/MeusTreinamentosPage";

interface Pessoa { token: string; nome: string; cargo: string; depto: string; papel: string; semConta: boolean }
interface Estado { modo: string; pessoas: Pessoa[] }
interface Passo { cenario: number; descricao: string; esperado: string; ok: boolean; observado: string }

const ROTULO_PERFIL: Record<string, string> = { RH: "RH", Gestor: "Gestor(a)", Responsavel: "Responsável habilitado" };
const css = {
  topo: { background: "#33485a", color: "#fff", padding: "8px 16px", fontSize: 13, display: "flex", flexWrap: "wrap" as const, gap: 12, alignItems: "center" },
  grade: { display: "flex", minHeight: "calc(100vh - 46px)", alignItems: "stretch", flexWrap: "wrap" as const },
  lateral: { width: 250, flex: "none", background: "#fff", borderRight: "1px solid #e2ebee", padding: 16, display: "flex", flexDirection: "column" as const, gap: 6 },
  principal: { flex: 1, minWidth: 0, maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px", display: "flex", flexDirection: "column" as const, gap: 20 },
  link: { padding: "9px 12px", borderRadius: 8, textDecoration: "none", color: "#33485a", fontWeight: 600, fontSize: 14 },
};

function Resultados() {
  const [r, setR] = useState<{ passos: Passo[] } | null | undefined>(undefined);
  useEffect(() => { void fetch("/demo/resultados").then((x) => x.json()).then(setR); }, []);
  if (r === undefined) return <p>Carregando…</p>;
  if (!r) return <p style={{ padding: 24 }}>Os cenários só rodam no modo “demonstração completa”. Use o botão no alto para carregá-la.</p>;
  const grupos = new Map<number, Passo[]>();
  for (const p of r.passos) grupos.set(p.cenario, [...(grupos.get(p.cenario) ?? []), p]);
  return (
    <div style={{ padding: "24px 0" }}>
      <h1 style={{ margin: 0 }}>Resultado da homologação local</h1>
      <p>{r.passos.filter((p) => p.ok).length} de {r.passos.length} passos conformes. Cada linha: o que se esperava × o que foi verificado, executado pela API real sobre o banco de demonstração.</p>
      {[...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([c, ps]) => (
        <section key={c} style={{ margin: "16px 0", background: "#fff", border: "1px solid #e2ebee", borderRadius: 10, padding: 14 }}>
          <h3 style={{ margin: "0 0 8px" }}>{c === 0 ? "Preparação (registros históricos)" : `Cenário ${c}`}</h3>
          {ps.map((p, i) => (
            <div key={i} style={{ margin: "8px 0", fontSize: 14 }}>
              <strong>{p.ok ? "✓" : "✗"} {p.descricao}</strong>
              <div style={{ color: "#51606b" }}>Esperado: {p.esperado}</div>
              <div style={{ color: p.ok ? "#51606b" : "#a23b3b" }}>Verificado: {p.observado}</div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Area({ persona, estado }: { persona: Pessoa; estado: Estado }) {
  const [ctx, setCtx] = useState<ContextoDesenvolvimento | null | "carregando">("carregando");
  useEffect(() => {
    let vivo = true;
    setCtx("carregando");
    iniciarSessao()
      .then((s) => {
        if (!vivo) return;
        if (!s.instalado) return setCtx(null);
        setCtx({ perfil: s.perfil, colaboradorId: s.colaboradorId, pessoas: s.pessoas, pessoaPorId: new Map(s.pessoas.map((p) => [p.id, p])), podeRegistrar: s.podeRegistrar ?? s.perfil === "RH", habilitado: s.habilitado ?? s.perfil === "RH" });
      })
      .catch(() => vivo && setCtx(null));
    return () => { vivo = false; };
  }, [persona.token, estado.modo]);
  const modulo = ctx && ctx !== "carregando" ? ctx : null;
  const link = ({ isActive }: { isActive: boolean }) => ({ ...css.link, background: isActive ? "#e8f6f4" : "transparent" });
  return (
    <div style={css.grade}>
      <nav style={css.lateral}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "#33485a" }}>{persona.nome}</div>
          <div style={{ fontSize: 12, color: "#7d8c93" }}>{persona.cargo} · {persona.depto}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {ctx === "carregando" ? "Abrindo o módulo…" : modulo ? <>Perfil no módulo: <strong>{ROTULO_PERFIL[modulo.perfil] ?? modulo.perfil}</strong>{modulo.perfil === "Gestor" && !modulo.habilitado ? " (acompanha)" : ""}</> : "Sem acesso à Gestão de Treinamentos (como no portal real)"}
          </div>
        </div>
        <NavLink to="/meus-treinamentos" style={link}>Meus treinamentos</NavLink>
        {modulo && <NavLink to="/desenvolvimento/treinamentos/agenda" style={link}>{modulo.perfil === "Responsavel" ? "Treinamentos que conduzo" : "Treinamentos"}</NavLink>}
        <NavLink to="/resultados" style={link}>Resultado da homologação</NavLink>
        <p style={{ fontSize: 11, color: "#7d8c93", marginTop: "auto" }}>Menu simplificado da demonstração. As telas ao lado são as reais do módulo.</p>
      </nav>
      <main style={css.principal}>
        {ctx === "carregando" ? (
          <p style={{ padding: 24 }}>Carregando…</p>
        ) : (
          <ContextoDesenvolvimentoCtx.Provider value={modulo as ContextoDesenvolvimento}>
            <Routes>
              <Route path="/meus-treinamentos" element={<MeusTreinamentosPage />} />
              <Route path="/resultados" element={<Resultados />} />
              {modulo && <Route path="/desenvolvimento/treinamentos/:aba?" element={<TreinamentosPage />} />}
              {modulo && <Route path="/desenvolvimento/treinamento/:id" element={<TreinamentoPage />} />}
              <Route path="*" element={<Navigate to={modulo ? "/desenvolvimento/treinamentos/agenda" : "/meus-treinamentos"} replace />} />
            </Routes>
          </ContextoDesenvolvimentoCtx.Provider>
        )}
      </main>
    </div>
  );
}

function App() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [persona, setPersona] = useState(() => localStorage.getItem("demo-persona") ?? "rh");
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => fetch("/demo/estado").then((r) => r.json()).then(setEstado);
  useEffect(() => { void carregar(); }, []);
  if (!estado) return <p style={{ padding: 24 }}>Conectando ao servidor da demonstração… (se não abrir, inicie: <code>npm run demo:api</code> em <code>tests</code>)</p>;
  const atual = estado.pessoas.find((p) => p.token === persona) ?? estado.pessoas[0];
  const reiniciar = async (modo: "zero" | "completo") => {
    setOcupado(true);
    await fetch("/demo/reiniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo }) });
    await carregar();
    setOcupado(false);
  };
  return (
    <HashRouter>
      <ToastProvider>
        <div style={css.topo}>
          <strong>DEMONSTRAÇÃO LOCAL</strong>
          <span>dados fictícios · banco em memória · nada vai para produção</span>
          <label>
            Entrar como:{" "}
            <select value={atual.token} onChange={(e) => { localStorage.setItem("demo-persona", e.target.value); setPersona(e.target.value); }} style={{ padding: 4, borderRadius: 6 }}>
              {estado.pessoas.filter((p) => !p.semConta).map((p) => (
                <option key={p.token} value={p.token}>{p.nome} — {p.papel}</option>
              ))}
            </select>
          </label>
          <span>Estado: {estado.modo === "completo" ? "demonstração completa (cenários já executados)" : "do zero (ninguém habilitado)"}</span>
          <button disabled={ocupado} onClick={() => void reiniciar("zero")}>Reiniciar do zero</button>
          <button disabled={ocupado} onClick={() => void reiniciar("completo")}>Carregar demonstração completa</button>
        </div>
        <Area key={`${atual.token}-${estado.modo}`} persona={atual} estado={estado} />
      </ToastProvider>
    </HashRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
