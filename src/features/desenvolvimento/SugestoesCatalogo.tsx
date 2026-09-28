import { useMemo, useState } from "react";
import { Button, Card } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { supabase } from "../../lib/supabaseClient";
import { gravar, opcoesHabilidades } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Carregando, ConfirmarComMotivo, Erro, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { possiveisCorrespondencias } from "./buscaHabilidades";
import { formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

interface SugestaoHabilidade {
  id: number;
  cargo_nome: string;
  habilidade_id: number | null;
  descricao_sugerida: string | null;
  observacao: string;
  justificativa: string;
  sugerido_por_colaborador_id: number | null;
  created_at: string;
  habilidade: { nome: string } | null;
}

/** Somente RH (RLS): habilidades técnicas sugeridas por Gestores (na Descrição de Cargo ou em Por cargo). */
async function listarSugestoes(): Promise<SugestaoHabilidade[]> {
  const { data, error } = await supabase
    .from("peopleflow_dev_cargo_requisitos")
    .select("id, cargo_nome, habilidade_id, descricao_sugerida, observacao, justificativa, sugerido_por_colaborador_id, created_at, habilidade:peopleflow_dev_habilidades(nome)")
    .eq("tipo_requisito", "habilidade")
    .eq("status", "sugerido")
    .eq("origem", "gestor")
    .order("created_at")
    .limit(500);
  if (error) throw new Error(`Sugestões: ${error.message}`);
  return (data ?? []) as unknown as SugestaoHabilidade[];
}

/** Uso de cada habilidade pelos cargos (vigente ou aguardando validação). */
export async function usoPorHabilidade(): Promise<Map<number, string[]>> {
  const { data, error } = await supabase
    .from("peopleflow_dev_cargo_requisitos")
    .select("habilidade_id, cargo_nome")
    .eq("tipo_requisito", "habilidade")
    .in("status", ["vigente", "sugerido"])
    .not("habilidade_id", "is", null)
    .limit(5000);
  if (error) throw new Error(`Uso por cargo: ${error.message}`);
  const m = new Map<number, string[]>();
  for (const r of data ?? []) {
    const id = Number(r.habilidade_id);
    m.set(id, [...(m.get(id) ?? []), String(r.cargo_nome)]);
  }
  return m;
}

export function SugestoesCatalogo({ onAlterado }: { onAlterado: () => void }) {
  const lista = useConsulta(() => listarSugestoes(), []);
  const catalogo = useConsulta(() => opcoesHabilidades(), []);
  const itens = lista.dados ?? [];
  if (lista.carregando && !lista.dados) return null;
  if (!lista.erro && itens.length === 0) return null;
  const recarregar = () => {
    lista.recarregar();
    catalogo.recarregar();
    onAlterado();
  };
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Sugestões aguardando validação ({itens.length})</h3>
          <p className={styles.cardSubtitle}>
            Habilidades técnicas sugeridas por Gestores. Validadas entram no catálogo (ou são vinculadas a uma existente) e passam a valer para o cargo.
          </p>
        </div>
      </div>
      {lista.erro ? (
        <Erro mensagem={lista.erro} />
      ) : !catalogo.dados ? (
        <Carregando />
      ) : (
        itens.map((s) => <LinhaSugestao key={s.id} s={s} catalogo={catalogo.dados!} onAlterado={recarregar} />)
      )}
    </Card>
  );
}

function LinhaSugestao({ s, catalogo, onAlterado }: { s: SugestaoHabilidade; catalogo: { id: number; nome: string; categoria: string | null }[]; onAlterado: () => void }) {
  const { pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const nova = s.habilidade_id == null;
  const [validando, setValidando] = useState(false);
  const [nome, setNome] = useState(s.descricao_sugerida ?? "");
  const [descricao, setDescricao] = useState(s.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const parecidas = useMemo(() => (nova ? possiveisCorrespondencias(catalogo, nome) : []), [nova, catalogo, nome]);

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
      flash(ok);
      onAlterado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={styles.linhaReq}>
      <div style={{ minWidth: 0 }}>
        <strong>{nova ? s.descricao_sugerida : s.habilidade?.nome}</strong>
        <div className={styles.secundario}>
          {s.cargo_nome} · {nova ? "habilidade nova (fora do catálogo)" : "do catálogo, selecionada pelo Gestor"}
          {s.sugerido_por_colaborador_id ? ` · por ${pessoaPorId.get(s.sugerido_por_colaborador_id)?.nome ?? `#${s.sugerido_por_colaborador_id}`}` : ""} · {formatarData(s.created_at)}
        </div>
        {nova && s.observacao && <div className={styles.secundario}>Descrição: {s.observacao}</div>}
        {s.justificativa && <div className={styles.secundario}>Justificativa: {s.justificativa}</div>}
        {validando && (
          <div className={styles.secao} style={{ marginTop: 8, borderBottom: 0 }}>
            {parecidas.length > 0 && (
              <div className={styles.dica}>
                Possíveis correspondências no catálogo:
                {parecidas.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{h.nome}</span>
                    <button
                      type="button"
                      className={styles.linkAcao}
                      disabled={ocupado}
                      onClick={() => void executar(() => gravar("habilidade_sugestao_validar", { requisito_id: s.id, habilidade_id: h.id }), `Vinculada a "${h.nome}".`).catch(() => undefined)}
                    >
                      Vincular a esta
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className={styles.campo}>
              Nome no catálogo *
              <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
            </label>
            <label className={styles.campo}>
              Descrição
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
            </label>
            <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
              <Button variant="ghost" onClick={() => setValidando(false)} disabled={ocupado}>
                Voltar
              </Button>
              <Button
                variant="success"
                disabled={ocupado || nome.trim().length < 3}
                onClick={() => void executar(() => gravar("habilidade_sugestao_validar", { requisito_id: s.id, nome: nome.trim(), descricao: descricao.trim() }), "Cadastrada no catálogo e validada para o cargo.").catch(() => undefined)}
              >
                Cadastrar no catálogo e validar
              </Button>
            </div>
          </div>
        )}
        {erro && <Erro mensagem={erro} />}
      </div>
      <div className={styles.secundario}>
        <Selo tom="warning">Aguardando validação do RH</Selo>
      </div>
      <div className={styles.linhaReqAcoes}>
        {!validando && (
          <Button
            variant="success"
            disabled={ocupado}
            onClick={() => (nova ? setValidando(true) : void executar(() => gravar("requisito_status", { id: s.id, status: "vigente" }), "Validada para o cargo.").catch(() => undefined))}
          >
            Validar
          </Button>
        )}
        <ConfirmarComMotivo
          rotulo="Não validar"
          confirmar="Não validar"
          variante="secondary"
          motivoObrigatorio
          onConfirmar={(motivo) => executar(() => gravar("requisito_status", { id: s.id, status: "inativo", motivo: `Não validada pelo RH: ${motivo}` }), "Sugestão não validada (decisão registrada).")}
        />
      </div>
    </div>
  );
}
