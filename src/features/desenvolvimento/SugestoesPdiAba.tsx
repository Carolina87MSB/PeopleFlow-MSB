import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import { acoesPdiJaTratadas, gravar, type CategoriaNecessidade } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio } from "./componentes";
import { useConsulta } from "./hooks";
import { CATEGORIA_NECESSIDADE, formatarData } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

/** Palavras que indicam ação de capacitação/desenvolvimento. O PDI pode ter ações que não são
 * treinamento — por isso isto é só uma SUGESTÃO; o RH confirma ou dispensa cada uma. */
const PALAVRAS_CAPACITACAO =
  /\b(treinament\w*|curso\w*|capacita\w*|qualifica\w*|workshop\w*|palestra\w*|semin[aá]ri\w*|congresso\w*|certifica\w*|forma[cç][aã]o|p[oó]s[- ]?gradua\w*|mba|especializa\w*|e-?learning|ead|aula\w*|oficina\w*|imers[aã]o|reciclagem|instru[cç][aã]o|trilha\w*|mentoria\w*)\b/i;

interface Sugestao {
  pdiId: number;
  itemId: string;
  acaoId: string;
  colaboradorNome: string;
  colaboradorId: number | null;
  ciclo: string;
  competencia: string;
  tipo: "Comportamental" | "Tecnica";
  acao: string;
  prazo: string | null;
  status: string;
  relacionada: boolean;
}

export function SugestoesPdiAba() {
  const { pessoas } = useDesenvolvimento();
  const { state } = usePortalStore();
  const tratadas = useConsulta(() => acoesPdiJaTratadas(), []);
  const [modo, setModo] = useState("Relacionadas a capacitação");
  const [confirmando, setConfirmando] = useState<Sugestao | null>(null);

  const idPorNome = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of pessoas) m.set(p.nome, m.has(p.nome) ? null : p.id); // homônimo → não identifica
    return m;
  }, [pessoas]);

  // Leitura dos PDIs já carregados pelo PeopleFlow — nada é gravado no PDI.
  const sugestoes = useMemo<Sugestao[]>(() => {
    const out: Sugestao[] = [];
    for (const pdi of state.pdi) {
      for (const item of pdi.itens) {
        for (const acao of item.acoes) {
          if (acao.status === "Concluída" || acao.status === "Cancelada") continue;
          if (!acao.descricao.trim()) continue;
          out.push({
            pdiId: pdi.id,
            itemId: item.id,
            acaoId: acao.id,
            colaboradorNome: pdi.colaboradorNome,
            colaboradorId: idPorNome.get(pdi.colaboradorNome) ?? null,
            ciclo: pdi.ciclo,
            competencia: item.competenciaNome,
            tipo: item.tipoCompetencia,
            acao: acao.descricao,
            prazo: acao.prazo,
            status: acao.status,
            relacionada: PALAVRAS_CAPACITACAO.test(acao.descricao),
          });
        }
      }
    }
    return out;
  }, [state.pdi, idPorNome]);

  const visiveis = useMemo(() => {
    const ja = tratadas.dados ?? new Set<string>();
    return sugestoes
      .filter((s) => !ja.has(s.acaoId))
      .filter((s) => modo !== "Relacionadas a capacitação" || s.relacionada)
      .sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"));
  }, [sugestoes, tratadas.dados, modo]);

  const removerDaLista = (acaoId: string) => tratadas.mutar((s) => new Set([...s, acaoId]));

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Sugestões a partir do PDI</h3>
          <p className={styles.cardSubtitle}>Ações de PDI em aberto que podem representar uma Necessidade de Desenvolvimento. Confirme para incluir na Base de Necessidades de Desenvolvimento.</p>
        </div>
        <FilterChips options={["Relacionadas a capacitação", "Todas as ações em aberto"]} value={modo} onChange={setModo} />
      </div>

      {tratadas.erro ? (
        <Erro mensagem={tratadas.erro} />
      ) : tratadas.carregando ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          icone={<Sparkles size={26} strokeWidth={1.6} />}
          titulo="Nenhuma sugestão no momento."
          descricao="Aparecem aqui as ações de PDI em aberto ainda não confirmadas nem dispensadas. O PDI nunca é alterado por esta tela."
        />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Ação no PDI</th>
                <th>Competência / KPI</th>
                <th>Ciclo</th>
                <th>Prazo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((s) => (
                <tr key={s.acaoId}>
                  <td>
                    {s.colaboradorNome}
                    {!s.colaboradorId && <div className={styles.secundario}>Não identificado de forma única</div>}
                  </td>
                  <td>{s.acao}</td>
                  <td className={styles.secundario}>
                    {s.competencia}
                    <div>{s.tipo === "Tecnica" ? "KPI" : "Competência"}</div>
                  </td>
                  <td className={styles.secundario}>{s.ciclo}</td>
                  <td className={styles.mono}>{formatarData(s.prazo)}</td>
                  <td>
                    <div className={styles.acoes}>
                      <Button variant="primary" disabled={!s.colaboradorId} onClick={() => setConfirmando(s)}>
                        Confirmar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmando && (
        <ConfirmarSugestaoDrawer
          sugestao={confirmando}
          onFechar={() => setConfirmando(null)}
          onTratada={() => {
            removerDaLista(confirmando.acaoId);
            setConfirmando(null);
          }}
        />
      )}
    </Card>
  );
}

function ConfirmarSugestaoDrawer({ sugestao, onFechar, onTratada }: { sugestao: Sugestao; onFechar: () => void; onTratada: () => void }) {
  const { flash } = useToast();
  const [form, setForm] = useState({
    // A competência/KPI que originou o PDI não define a categoria da capacitação: o RH escolhe.
    categoria: "",
    prioridade: "media",
    justificativa: `PDI ${sugestao.ciclo} — ${sugestao.tipo === "Tecnica" ? "KPI" : "competência"} "${sugestao.competencia}"`,
    sugestao_capacitacao: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Sugestão do PDI" titulo={sugestao.acao} sub={`${sugestao.colaboradorNome} · ${sugestao.ciclo}`} />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            await gravar("pdi_sugestao_aceitar", { pdi_acao_id: sugestao.acaoId, ...form });
            flash("Incluída na Base de Necessidades de Desenvolvimento (origem PDI).");
            onTratada();
          } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <h4 className={styles.secaoTitulo}>Confirmar como Necessidade de Desenvolvimento</h4>
        <div className={styles.grid}>
          <label className={styles.campo}>
            Categoria *
            <select value={form.categoria} onChange={set("categoria")} required>
              <option value="">Selecione</option>
              {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_NECESSIDADE[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Prioridade inicial
            <select value={form.prioridade} onChange={set("prioridade")}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa
            <textarea value={form.justificativa} onChange={set("justificativa")} maxLength={2000} />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Sugestão de treinamento / capacitação
            <input value={form.sugestao_capacitacao} onChange={set("sugestao_capacitacao")} maxLength={500} />
          </label>
        </div>
        <span className={styles.dica}>A Necessidade de Desenvolvimento guarda a referência ao PDI de origem. O PDI não é alterado.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" className={styles.botaoLongo} disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar Necessidade de Desenvolvimento"}
          </Button>
        </div>
      </form>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Não é Necessidade de Desenvolvimento?</h4>
        <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
          <ConfirmarComMotivo
            rotulo="Dispensar sugestão"
            confirmar="Dispensar"
            variante="danger"
            motivoObrigatorio
            onConfirmar={async (motivo) => {
              try {
                await gravar("pdi_sugestao_dispensar", { pdi_acao_id: sugestao.acaoId, motivo });
                flash("Sugestão dispensada.");
                onTratada();
              } catch (err) {
                setErro(err instanceof Error ? err.message : String(err));
                throw err;
              }
            }}
          />
        </div>
      </div>
    </Drawer>
  );
}
