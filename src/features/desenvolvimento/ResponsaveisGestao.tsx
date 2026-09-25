import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { gravar } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro } from "./componentes";
import { useConsulta } from "./hooks";
import { formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

interface ResponsavelGestao {
  id: number;
  indicado_em: string;
  gestor: { id: number; nome: string };
  colaborador: { id: number; nome: string; cargo: string; departamento: string };
}

/** Gestor indica pessoas da sua equipe para registrar/acompanhar treinamentos da gestão.
 * Acesso restrito à Gestão de Treinamentos — não vira Gestor. RH vê todas e pode revogar. */
export function ResponsaveisGestaoDrawer({ onFechar }: { onFechar: () => void }) {
  const { perfil, pessoas, colaboradorId } = useDesenvolvimento();
  const { flash } = useToast();
  const ehGestor = perfil === "Gestor";
  const lista = useConsulta(() => gravar<ResponsavelGestao[]>("responsaveis_gestao_listar", {}), []);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const indicados = new Set((lista.dados ?? []).map((r) => r.colaborador.id));
  const opcoes = pessoas.filter((p) => p.id !== colaboradorId && !indicados.has(p.id));
  const link = `${window.location.origin}/desenvolvimento/treinamentos/agenda`;

  return (
    <Drawer
      onClose={onFechar}
      header={
        <CabecalhoDrawer
          eyebrow="Treinamentos"
          titulo="Responsáveis por Treinamentos da Gestão"
          sub={ehGestor ? "Podem registrar e acompanhar os treinamentos da sua gestão — sem acesso a salários, AVD, PDI ou outras áreas." : "Indicações feitas pelos gestores"}
        />
      }
    >
      <div className={styles.secao}>
        {ehGestor && (
          <form
            className={styles.filtros}
            style={{ alignItems: "flex-end" }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!novo) return;
              setErro(null);
              setSalvando(true);
              try {
                await gravar("responsavel_gestao_indicar", { colaborador_id: Number(novo) });
                flash("Responsável indicado. Envie a ele o link de acesso aos Treinamentos.");
                setNovo("");
                lista.recarregar();
              } catch (err) {
                setErro(err instanceof Error ? err.message : String(err));
              } finally {
                setSalvando(false);
              }
            }}
          >
            <label className={styles.campo} style={{ flex: "1 1 220px" }}>
              Pessoa da sua equipe
              <select value={novo} onChange={(e) => setNovo(e.target.value)}>
                <option value="">Selecione</option>
                {opcoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.cargo}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={!novo || salvando}>
              {salvando ? "Indicando..." : "Indicar"}
            </Button>
          </form>
        )}
        {erro && <Erro mensagem={erro} />}
        {lista.erro ? (
          <Erro mensagem={lista.erro} />
        ) : lista.carregando && !lista.dados ? (
          <Carregando />
        ) : (lista.dados ?? []).length === 0 ? (
          <p className={styles.secundario}>Nenhum Responsável por Treinamentos indicado.</p>
        ) : (
          <ul className={styles.historico}>
            {(lista.dados ?? []).map((r) => (
              <li key={r.id} className={styles.itemAssociacao}>
                <div style={{ minWidth: 0 }}>
                  <strong>{r.colaborador.nome}</strong>
                  <div className={styles.secundario}>
                    {[r.colaborador.cargo, r.colaborador.departamento].filter(Boolean).join(" · ")}
                    {!ehGestor ? ` · gestão de ${r.gestor.nome}` : ""} · desde {formatarData(r.indicado_em)}
                  </div>
                </div>
                <ConfirmarComMotivo
                  rotulo="Revogar"
                  confirmar="Revogar indicação"
                  variante="secondary"
                  motivoObrigatorio
                  onConfirmar={async (motivo) => {
                    setErro(null);
                    try {
                      await gravar("responsavel_gestao_revogar", { id: r.id, motivo });
                      flash("Indicação revogada.");
                      lista.recarregar();
                    } catch (e) {
                      setErro(e instanceof Error ? e.message : String(e));
                      throw e;
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {ehGestor && (
          <p className={styles.dica}>
            Link de acesso para o responsável (entra com o e-mail corporativo): {link}{" "}
            <button
              type="button"
              className={styles.linkAcao}
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                flash("Link copiado.");
              }}
            >
              Copiar link
            </button>
          </p>
        )}
      </div>
    </Drawer>
  );
}
