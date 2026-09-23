import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Lock, Wrench } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import { iniciarSessao, SemAcessoDesenvolvimentoError, type PerfilDesenvolvimento } from "./devRepository";
import { Carregando, Erro, EstadoVazio } from "./componentes";
import { ContextoDesenvolvimentoCtx as Ctx, type ContextoDesenvolvimento } from "./contexto";

// A sessão do módulo vale 12 h no banco; renova antes disso se a tela ficar aberta.
const RENOVAR_MS = 60 * 60 * 1000;

type Estado =
  | { tipo: "carregando" }
  | { tipo: "sem_acesso"; mensagem: string }
  | { tipo: "nao_instalado"; perfil: PerfilDesenvolvimento }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "ok"; ctx: ContextoDesenvolvimento };

/** Casca do módulo: carrega a sessão (perfil + escopo) só quando o usuário
 * entra em /desenvolvimento, e bloqueia perfis ainda não liberados. */
export default function DesenvolvimentoLayout() {
  const { perfil } = usePortalData();
  const liberado = perfil === "RH" || perfil === "Gestor";
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    if (!liberado) return;
    let vivo = true;
    const carregar = () =>
      iniciarSessao()
        .then((s) => {
          if (!vivo) return;
          if (!s.instalado) setEstado({ tipo: "nao_instalado", perfil: s.perfil });
          else
            setEstado({
              tipo: "ok",
              ctx: { perfil: s.perfil, colaboradorId: s.colaboradorId, pessoas: s.pessoas, pessoaPorId: new Map(s.pessoas.map((p) => [p.id, p])) },
            });
        })
        .catch((e: unknown) => {
          if (!vivo) return;
          if (e instanceof SemAcessoDesenvolvimentoError) setEstado({ tipo: "sem_acesso", mensagem: e.message });
          else setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : String(e) });
        });
    carregar();
    const timer = window.setInterval(carregar, RENOVAR_MS);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [liberado]);

  if (!liberado || estado.tipo === "sem_acesso") {
    return (
      <>
        <Header />
        <Card>
          <EstadoVazio
            icone={<Lock size={26} strokeWidth={1.6} />}
            titulo="Módulo não disponível para o seu perfil"
            descricao="O módulo Desenvolvimento está liberado nesta etapa para o RH e para gestores."
          />
        </Card>
      </>
    );
  }

  if (estado.tipo === "carregando") {
    return (
      <>
        <Header />
        <Card>
          <Carregando />
        </Card>
      </>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <>
        <Header />
        <Erro mensagem={`Não foi possível abrir o módulo Desenvolvimento: ${estado.mensagem}`} />
      </>
    );
  }

  if (estado.tipo === "nao_instalado") {
    return (
      <>
        <Header />
        <Card>
          <EstadoVazio
            icone={<Wrench size={26} strokeWidth={1.6} />}
            titulo="Módulo em implantação"
            descricao={
              estado.perfil === "RH"
                ? "A estrutura de dados do módulo ainda não foi instalada no banco (supabase/desenvolvimento_fase1.sql)."
                : "O módulo Desenvolvimento estará disponível em breve."
            }
          />
        </Card>
      </>
    );
  }

  return (
    <Ctx.Provider value={estado.ctx}>
      <Outlet />
    </Ctx.Provider>
  );
}
