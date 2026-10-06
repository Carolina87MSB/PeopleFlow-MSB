import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import { acoesPdiJaTratadas, gravar, type CategoriaNecessidade } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, ConfirmarComMotivo, Erro, EstadoVazio, Selo } from "./componentes";
import { plural } from "./lntRotulos";
import { useConsulta } from "./hooks";
import { CATEGORIA_NECESSIDADE, formatarData } from "./rotulos";
import { contagemPorForma, filtrarAcoes, indiciosDaAcao, ROTULO_FILTRO_FORMA, ROTULO_FILTRO_TIPO, ROTULO_INDICIO, type FiltroForma, type FiltroTipo, type IndicioForma } from "./pdiClassificacao";
import styles from "./Desenvolvimento.module.css";

const FORMAS: FiltroForma[] = ["todas", "mentoria", "pratica", "treinamento", "outra"];

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
  indicios: IndicioForma[];
  departamento: string | undefined;
}

export function SugestoesPdiAba() {
  const { pessoas } = useDesenvolvimento();
  const { state } = usePortalStore();
  const tratadas = useConsulta(() => acoesPdiJaTratadas(), []);
  const [forma, setForma] = useState<FiltroForma>("todas");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [departamento, setDepartamento] = useState("");
  // Departamento pelo cadastro oficial (colaboradores já carregados pelo PeopleFlow).
  const deptoPorNome = useMemo(() => new Map(state.colaboradores.filter((c) => !c.desligado).map((c) => [c.nome, c.depto])), [state.colaboradores]);
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
            indicios: indiciosDaAcao(acao.descricao),
            departamento: deptoPorNome.get(pdi.colaboradorNome),
          });
        }
      }
    }
    return out;
  }, [state.pdi, idPorNome, deptoPorNome]);

  // Universo principal: TODA ação em aberto ainda não confirmada nem dispensada. Os filtros só estreitam a vista.
  const aguardando = useMemo(() => {
    const ja = tratadas.dados ?? new Set<string>();
    return sugestoes.filter((s) => !ja.has(s.acaoId)).sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"));
  }, [sugestoes, tratadas.dados]);
  const filtros = useMemo(() => ({ departamento, tipo, forma }), [departamento, tipo, forma]);
  const visiveis = useMemo(() => filtrarAcoes(aguardando, filtros), [aguardando, filtros]);
  const contagem = useMemo(() => contagemPorForma(aguardando, filtros), [aguardando, filtros]);
  const departamentos = useMemo(
    () => [...new Set(sugestoes.map((s) => deptoPorNome.get(s.colaboradorNome)).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [sugestoes, deptoPorNome],
  );

  const removerDaLista = (acaoId: string) => tratadas.mutar((s) => new Set([...s, acaoId]));

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Sugestões a partir do PDI</h3>
          <p className={styles.cardSubtitle}>
            Ações de PDI em aberto que ainda precisam da sua análise. Cada uma pode apontar uma Necessidade de Desenvolvimento, que só depois será atendida da forma mais adequada (treinamento, mentoria, prática no trabalho…). Confirme para incluir na Base de Necessidades de Desenvolvimento.
          </p>
        </div>
        <span className={styles.secundario}>
          {plural(aguardando.length, "ação aguardando análise", "ações aguardando análise")}
        </span>
      </div>
      <div className={styles.toolbar}>
        <FilterChips
          options={FORMAS.map((f) => `${ROTULO_FILTRO_FORMA[f]} (${contagem[f]})`)}
          value={`${ROTULO_FILTRO_FORMA[forma]} (${contagem[forma]})`}
          onChange={(v) => setForma(FORMAS.find((f) => v.startsWith(`${ROTULO_FILTRO_FORMA[f]} (`)) ?? "todas")}
        />
      </div>
      <span className={styles.dica} style={{ display: "block", marginBottom: 10 }}>
        Os indícios (mentoria, aprendizagem prática, treinamento) vêm apenas do texto da ação e ajudam a leitura. Não definem como a necessidade será atendida, e nenhuma ação some da lista por causa deles.
      </span>
      <div className={styles.filtros} style={{ marginBottom: 14 }}>
        <select className={styles.select} style={{ minWidth: 200 }} value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)} aria-label="Tipo de desenvolvimento">
          {(Object.keys(ROTULO_FILTRO_TIPO) as FiltroTipo[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_FILTRO_TIPO[t]}
            </option>
          ))}
        </select>
        <select className={styles.select} style={{ minWidth: 200 }} value={departamento} onChange={(e) => setDepartamento(e.target.value)} aria-label="Departamento/Setor">
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>

      {tratadas.erro ? (
        <Erro mensagem={tratadas.erro} />
      ) : tratadas.carregando ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          icone={<Sparkles size={26} strokeWidth={1.6} />}
          titulo={aguardando.length === 0 ? "Nenhuma ação de PDI aguardando análise." : "Nenhuma ação com esses filtros."}
          descricao={aguardando.length === 0 ? "Aparecem aqui as ações de PDI em aberto ainda não confirmadas nem dispensadas. O PDI nunca é alterado por esta tela." : "Escolha “Todas” e “Todos os tipos” para ver tudo o que aguarda análise."}
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
                  <td>
                    {s.acao}
                    <div className={styles.selos} style={{ marginTop: 4 }}>
                      {s.indicios.length === 0 ? <Selo tom="neutral">Outra ação</Selo> : s.indicios.map((i) => <Selo key={i} tom="info">{ROTULO_INDICIO[i]}</Selo>)}
                    </div>
                  </td>
                  <td className={styles.secundario}>
                    {s.competencia}
                    <div>{s.tipo === "Tecnica" ? "KPI" : "Competência"}</div>
                  </td>
                  <td className={styles.secundario}>{s.ciclo}</td>
                  <td className={styles.mono}>{formatarData(s.prazo)}</td>
                  <td>
                    <div className={styles.acoes}>
                      <Button variant="primary" disabled={!s.colaboradorId} title="Confirmar que esta ação do PDI representa uma Necessidade de Desenvolvimento" onClick={() => setConfirmando(s)}>
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
            Sugestão de ação de desenvolvimento (opcional)
            <input value={form.sugestao_capacitacao} onChange={set("sugestao_capacitacao")} maxLength={500} />
          </label>
        </div>
        <span className={styles.dica}>Confirmar significa que esta ação do PDI representa uma Necessidade de Desenvolvimento. A forma de atendimento (treinamento, mentoria, prática no trabalho…) será definida depois. A necessidade guarda a referência ao PDI de origem e o PDI não é alterado.</span>
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
