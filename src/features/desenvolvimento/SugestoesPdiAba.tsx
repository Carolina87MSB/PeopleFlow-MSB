import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, FilterChips } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { usePortalStore } from "../../store/PortalStoreContext";
import { useDesenvolvimento } from "./contexto";
import { Carregando, Erro, EstadoVazio } from "./componentes";
import { plural } from "./lntRotulos";
import { useConsulta } from "./hooks";
import { PdiItemCard, type SituacaoItem } from "./PdiItemCard";
import { ConfirmarDrawer, ManterDrawer, SepararDrawer } from "./PdiTriagemDrawers";
import { ROTULO_FILTRO_FORMA, ROTULO_FILTRO_TIPO, ROTULO_SITUACAO_TRIAGEM, type FiltroForma, type FiltroTipo } from "./pdiClassificacao";
import { contagemPorFormaItens, contar, filtrarItens, montarTriagem, type ItemCard, type SugestaoCard } from "./pdiTriagemItens";
import { lerTriagemPdi, triagemPdi } from "./pdiTriagemRepository";
import styles from "./Desenvolvimento.module.css";

const FORMAS: FiltroForma[] = ["todas", "mentoria", "pratica", "treinamento", "outra"];
const SITUACOES: SituacaoItem[] = ["aguardando", "confirmadas", "mantidas"];

type Aberto = { modo: "confirmar" | "editar" | "separar" | "manter"; card: ItemCard; sugestao: SugestaoCard };

export function SugestoesPdiAba() {
  const { pessoas } = useDesenvolvimento();
  const { state } = usePortalStore();
  const { flash } = useToast();
  const triagem = useConsulta(() => lerTriagemPdi(), []);
  const [situacao, setSituacao] = useState<SituacaoItem>("aguardando");
  const [forma, setForma] = useState<FiltroForma>("todas");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [departamento, setDepartamento] = useState("");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  // Departamento pelo cadastro oficial (colaboradores já carregados pelo PeopleFlow).
  const deptoPorNome = useMemo(() => new Map(state.colaboradores.filter((c) => !c.desligado).map((c) => [c.nome, c.depto])), [state.colaboradores]);
  // A Necessidade exige vínculo por id: nome ausente ou repetido (homônimo) não permite confirmar.
  const identificaveis = useMemo(() => {
    const conta = new Map<string, number>();
    for (const p of pessoas) conta.set(p.nome, (conta.get(p.nome) ?? 0) + 1);
    return new Set([...conta].filter(([, n]) => n === 1).map(([nome]) => nome));
  }, [pessoas]);

  const modelo = useMemo(() => (triagem.dados ? montarTriagem({ pdis: state.pdi, triagem: triagem.dados, departamentoPorNome: deptoPorNome }) : null), [state.pdi, triagem.dados, deptoPorNome]);
  const base = useMemo(() => modelo?.[situacao] ?? [], [modelo, situacao]);
  const filtros = useMemo(() => ({ departamento, tipo, forma }), [departamento, tipo, forma]);
  const visiveis = useMemo(() => filtrarItens(base, filtros), [base, filtros]);
  const contagemForma = useMemo(() => contagemPorFormaItens(base, { departamento, tipo }), [base, departamento, tipo]);
  const departamentos = useMemo(() => {
    const todos = modelo ? [...modelo.aguardando, ...modelo.confirmadas, ...modelo.mantidas] : [];
    return [...new Set(todos.map((c) => c.departamento).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [modelo]);

  const totais = useMemo(() => ({ aguardando: contar(modelo?.aguardando ?? []), confirmadas: contar(modelo?.confirmadas ?? []), mantidas: contar(modelo?.mantidas ?? []) }), [modelo]);
  const semSugestao = useMemo(() => {
    const itens = (modelo?.aguardando ?? []).filter((c) => c.acoesSemSugestao.length > 0);
    return { itens: itens.length, acoes: itens.reduce((n, c) => n + c.acoesSemSugestao.length, 0) };
  }, [modelo]);

  // Gravações do servidor: depois de cada uma as leituras são refeitas (a fonte de verdade é o banco).
  const executar = async (fn: () => Promise<{ auditoria?: string } | unknown>, aviso: string) => {
    setErroAcao(null);
    setOcupado(true);
    try {
      const r = (await fn()) as { auditoria?: string } | undefined;
      flash(r?.auditoria === "pendente" ? "Gravado, mas o registro de auditoria não pôde ser salvo. Avise o suporte; não é preciso repetir." : aviso);
      triagem.recarregar();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : String(e));
      triagem.recarregar(); // uma falha no meio do caminho pode ter mudado o estado: a tela mostra o que realmente ficou gravado
    } finally {
      setOcupado(false);
    }
  };
  const gerar = (itemIds?: string[]) => executar(() => triagemPdi.gerar(itemIds), "Sugestões geradas.");
  const regenerar = (s: SugestaoCard) => executar(() => triagemPdi.regenerar(s.id), "Sugestão atualizada com o PDI atual.");

  const concluido = () => {
    setAberto(null);
    triagem.recarregar();
  };
  const abrir = (modo: Aberto["modo"]) => (card: ItemCard) => (sugestao: SugestaoCard) => setAberto({ modo, card, sugestao });

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Sugestões a partir do PDI</h3>
          <p className={styles.cardSubtitle}>
            Cada item do PDI (competência ou KPI, objetivo e ações) pode apontar uma Necessidade de Desenvolvimento, que só depois será atendida da forma mais adequada (treinamento, mentoria, prática no trabalho…). A ação do PDI é a evidência de origem, não a necessidade. Para cada item, decida: <strong>confirmar necessidade</strong> (entra na Base de Necessidades de Desenvolvimento), <strong>separar ações</strong> (o item sustenta mais de uma necessidade) ou <strong>manter somente no PDI</strong> (continua no PDI e sai desta fila).
          </p>
        </div>
        {modelo && (
          <span className={styles.secundario}>
            Aguardando análise: {plural(totais.aguardando.itens, "item", "itens")} · {plural(totais.aguardando.acoes, "ação", "ações")}
          </span>
        )}
      </div>
      <div className={styles.toolbar}>
        <FilterChips
          options={SITUACOES.map((s) => `${ROTULO_SITUACAO_TRIAGEM[s]} (${totais[s].itens})`)}
          value={`${ROTULO_SITUACAO_TRIAGEM[situacao]} (${totais[situacao].itens})`}
          onChange={(v) => {
            setSituacao(SITUACOES.find((s) => v.startsWith(`${ROTULO_SITUACAO_TRIAGEM[s]} (`)) ?? "aguardando");
            setForma("todas");
          }}
        />
      </div>
      <div className={styles.toolbar}>
        <FilterChips
          options={FORMAS.map((f) => `${ROTULO_FILTRO_FORMA[f]} (${contagemForma[f]})`)}
          value={`${ROTULO_FILTRO_FORMA[forma]} (${contagemForma[forma]})`}
          onChange={(v) => setForma(FORMAS.find((f) => v.startsWith(`${ROTULO_FILTRO_FORMA[f]} (`)) ?? "todas")}
        />
      </div>
      <span className={styles.dica} style={{ display: "block", marginBottom: 10 }}>
        Os indícios (mentoria, aprendizagem prática, treinamento) vêm apenas do texto das ações e ajudam a leitura. Não definem como a necessidade será atendida, e nenhum item some da lista por causa deles.
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

      {situacao === "aguardando" && semSugestao.itens > 0 && (
        <div className={styles.painelGerar}>
          <span>
            {plural(semSugestao.itens, "item", "itens")} ({plural(semSugestao.acoes, "ação", "ações")}) ainda sem sugestão de necessidade. A sugestão é montada por uma regra simples, sem inteligência artificial, e você revisa antes de decidir.
          </span>
          <Button variant="primary" disabled={ocupado} onClick={() => gerar()}>
            {ocupado ? "Gerando..." : "Gerar sugestões"}
          </Button>
        </div>
      )}
      {erroAcao && <Erro mensagem={erroAcao} />}

      {triagem.erro ? (
        <Erro mensagem={triagem.erro} />
      ) : !modelo ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <EstadoVazio icone={<Sparkles size={26} strokeWidth={1.6} />} {...textoVazio(situacao, base.length)} />
      ) : (
        <ul className={styles.itensPdi}>
          {visiveis.map((card) => (
            <PdiItemCard
              key={card.chave}
              card={card}
              situacao={situacao}
              ocupado={ocupado}
              confirmavel={identificaveis.has(card.colaboradorNome)}
              onConfirmar={abrir("confirmar")(card)}
              onEditar={abrir("editar")(card)}
              onSeparar={abrir("separar")(card)}
              onManter={abrir("manter")(card)}
              onRegenerar={regenerar}
              onGerar={(id) => gerar([id])}
            />
          ))}
        </ul>
      )}

      {aberto && (aberto.modo === "confirmar" || aberto.modo === "editar") && (
        <ConfirmarDrawer
          card={aberto.card}
          sugestao={aberto.sugestao}
          editar={aberto.modo === "editar"}
          onFechar={() => setAberto(null)}
          onConcluido={concluido}
          onManter={() => setAberto({ ...aberto, modo: "manter" })}
        />
      )}
      {aberto?.modo === "manter" && <ManterDrawer card={aberto.card} sugestao={aberto.sugestao} onFechar={() => setAberto(null)} onConcluido={concluido} />}
      {aberto?.modo === "separar" && <SepararDrawer card={aberto.card} sugestao={aberto.sugestao} onFechar={() => setAberto(null)} onConcluido={concluido} />}
    </Card>
  );
}

function textoVazio(situacao: SituacaoItem, totalNaSituacao: number): { titulo: string; descricao: string } {
  if (totalNaSituacao > 0) return { titulo: "Nenhum item com esses filtros.", descricao: "Escolha “Todas” e “Todos os tipos” para ver tudo desta lista." };
  if (situacao === "aguardando") return { titulo: "Nenhum item de PDI aguardando análise.", descricao: "Todo item com ação em aberto já recebeu uma decisão. O PDI nunca é alterado por esta tela." };
  if (situacao === "confirmadas") return { titulo: "Nenhum item confirmado ainda.", descricao: "Aparecem aqui os itens que o RH confirmou como Necessidade de Desenvolvimento." };
  return { titulo: "Nenhum item mantido somente no PDI.", descricao: "Aparecem aqui os itens que continuam apenas no PDI, sem entrar na Base de Necessidades de Desenvolvimento." };
}
