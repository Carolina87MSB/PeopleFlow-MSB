import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Drawer } from "../../components/ui";
import {
  arredondar,
  avaliacaoCompleta,
  calcularNotasAvaliacao,
  ESCALA_COMPORTAMENTAL,
  formatarResultadoKpi,
  itensPendentes,
  mediaAfirmacoes,
  notaKpi,
  parseResultadoKpi,
  percentualAtingimentoKpi,
} from "../../domain/avaliacaoDesempenho";
import { formatarDataHora, formatarHoraAtual } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho, StatusAvaliacaoDesempenho, TipoAvaliacaoDesempenho } from "../../types/domain";
import { STATUS_CALIBRACAO_TONE } from "./CalibracaoTab";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

const AUTOSAVE_DEBOUNCE_MS = 1200;

const TIPO_LABEL: Record<TipoAvaliacaoDesempenho, string> = {
  GESTOR: "Avaliação do Gestor",
  AUTOAVALIACAO: "Autoavaliação",
  LIDERANCA: "Avaliação da Liderança",
};

interface AvaliacaoDesempenhoDrawerProps {
  avaliacao: AvaliacaoDesempenho;
  onClose: () => void;
}

/** Ficha de preenchimento da Avaliação de Desempenho — bloco Comportamental
 * (nota de 1 a 5 por afirmação de cada competência) + bloco Técnico (KPIs do
 * cargo, só o "Resultado obtido" é editável). Médias e nota final calculadas
 * ao vivo (ver domain/avaliacaoDesempenho.ts). "Concluir avaliação" só fica
 * disponível quando tudo estiver preenchido, e trava a edição depois. */
export function AvaliacaoDesempenhoDrawer({ avaliacao, onClose }: AvaliacaoDesempenhoDrawerProps) {
  const {
    conta,
    competenciasComportamentais,
    kpisCargo,
    configAvaliacaoDesempenho,
    ciclosAvaliacaoDesempenho,
    salvarAvaliacaoDesempenho,
    podeEditarAvaliacaoDesempenho,
    podeMarcarDevolutiva,
    marcarDevolutivaRealizada,
  } = usePortalData();

  const podeEditar = podeEditarAvaliacaoDesempenho(avaliacao);
  const cicloEncerrado = ciclosAvaliacaoDesempenho.find((c) => c.id === avaliacao.cicloId)?.status === "Encerrado";

  // Recuperação da última versão salva: o rascunho sempre parte do que está
  // persistido no Supabase (prop `avaliacao`), então reabrir o Drawer já
  // retoma de onde parou — não precisa de nenhuma lógica adicional.
  const [rascunho, setRascunho] = useState<AvaliacaoDesempenho>(() => ({
    ...avaliacao,
    resultadosComportamentais: avaliacao.resultadosComportamentais.map((r) => ({ ...r, notasAfirmacoes: [...r.notasAfirmacoes] })),
    resultadosKpis: avaliacao.resultadosKpis.map((r) => ({ ...r })),
  }));
  // Texto exatamente como o gestor digita em cada campo "Resultado obtido" —
  // NUNCA lido de volta do número já convertido (isso é o que causava vírgula/
  // ponto/"%" sendo engolidos a cada tecla: o input reexibia o valor já
  // arredondado/convertido pelo Number(), então cada novo caractere digitado
  // se combinava com um número "errado", tipo 0,425 virando 42500). O número
  // usado no cálculo (`rascunho.resultadosKpis[...].resultado`) é atualizado à
  // parte, em paralelo — ver atualizarResultadoKpi().
  const [resultadoTexto, setResultadoTexto] = useState<Record<number, string>>(() => {
    const mapa: Record<number, string> = {};
    for (const r of avaliacao.resultadosKpis) mapa[r.kpiId] = formatarResultadoKpi(r.resultado);
    return mapa;
  });
  const [salvando, setSalvando] = useState<"progresso" | "concluir" | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [ultimoSalvoAutoHora, setUltimoSalvoAutoHora] = useState<string | null>(null);
  const [marcandoDevolutiva, setMarcandoDevolutiva] = useState(false);

  const kpisPorId = useMemo(() => new Map(kpisCargo.map((k) => [k.id, k])), [kpisCargo]);
  const competenciasPorId = useMemo(() => new Map(competenciasComportamentais.map((c) => [c.id, c])), [competenciasComportamentais]);

  // Ponto único de cálculo — o mesmo usado ao salvar e na lista de
  // Avaliações, pra este preview nunca divergir do valor efetivamente
  // gravado (ver calcularNotasAvaliacao() em domain/avaliacaoDesempenho.ts).
  // Já vem arredondado (1 casa) — não precisa de arredondar() de novo abaixo.
  const { mediaTecnica: mediaTecnicaValor, mediaComportamental: mediaComportamentalValor, notaFinal } = calcularNotasAvaliacao(
    rascunho,
    kpisCargo,
    configAvaliacaoDesempenho,
  );
  const completa = avaliacaoCompleta(rascunho);
  const pendencias = useMemo(
    () => itensPendentes(rascunho, competenciasComportamentais, kpisCargo),
    [rascunho, competenciasComportamentais, kpisCargo],
  );

  async function persistir(status: StatusAvaliacaoDesempenho) {
    const atualizado: AvaliacaoDesempenho = { ...rascunho, status };
    const result = await salvarAvaliacaoDesempenho(atualizado);
    if (result.ok) {
      setRascunho(atualizado);
      setSujo(false);
    }
    return result;
  }

  // Autosave debounced: qualquer edição agenda uma gravação silenciosa (sem
  // toast) ~1,2s depois da última mudança; a 1ª gravação já promove "Não
  // iniciada" -> "Em andamento" sozinha, igual ao salvamento manual.
  useEffect(() => {
    if (!podeEditar || !sujo || salvando !== null) return;
    const timer = setTimeout(async () => {
      setSalvandoAuto(true);
      const status = rascunho.status === "Não iniciada" ? "Em andamento" : rascunho.status;
      await persistir(status);
      setSalvandoAuto(false);
      setUltimoSalvoAutoHora(formatarHoraAtual());
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho, sujo, podeEditar, salvando]);

  function atualizarNotaAfirmacao(competenciaId: string, indice: number, nota: number) {
    setRascunho((r) => ({
      ...r,
      resultadosComportamentais: r.resultadosComportamentais.map((res) =>
        res.competenciaId === competenciaId
          ? { ...res, notasAfirmacoes: res.notasAfirmacoes.map((n, i) => (i === indice ? nota : n)) }
          : res,
      ),
    }));
    setSujo(true);
  }

  function atualizarResultadoKpi(kpiId: number, valorTexto: string) {
    setResultadoTexto((t) => ({ ...t, [kpiId]: valorTexto }));
    const resultado = parseResultadoKpi(valorTexto);
    setRascunho((r) => ({
      ...r,
      resultadosKpis: r.resultadosKpis.map((res) => (res.kpiId === kpiId ? { ...res, resultado } : res)),
    }));
    setSujo(true);
  }

  function atualizarComentario(campo: "comentarioComportamental" | "comentarioTecnico" | "comentarioGeral", valor: string) {
    setRascunho((r) => ({ ...r, [campo]: valor }));
    setSujo(true);
  }

  async function handleSalvar(tipo: "progresso" | "concluir") {
    setSalvando(tipo);
    const status = tipo === "concluir" ? "Concluída" : rascunho.status === "Não iniciada" ? "Em andamento" : rascunho.status;
    const result = await persistir(status);
    setSalvando(null);
    if (result.ok && tipo === "concluir") onClose();
  }

  // Devolutiva (Etapa 8) — ação independente do fluxo de edição da ficha em
  // si (a ficha já está travada, "Concluída" há muito tempo quando isso se
  // aplica); atualiza o rascunho local direto, sem esperar o Drawer reabrir.
  async function handleMarcarDevolutiva() {
    setMarcandoDevolutiva(true);
    const result = await marcarDevolutivaRealizada(rascunho);
    if (result.ok) {
      setRascunho((r) => ({ ...r, devolutivaRealizada: true, devolutivaPor: conta.nome, devolutivaEm: new Date().toISOString() }));
    }
    setMarcandoDevolutiva(false);
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{avaliacao.colaboradorNome}</div>
          <div className={styles.drawerSub}>
            {TIPO_LABEL[avaliacao.tipo]}
            {avaliacao.tipo === "LIDERANCA" && ` de ${avaliacao.avaliado}`}
            {" · "}
            {avaliacao.cargo ? formatarNomeCargo(avaliacao.cargo) : "—"} · {avaliacao.ciclo}
          </div>
        </div>
      }
    >
      <div className={styles.statusRow}>
        <Badge bg="var(--color-brand-pale, #eef7f9)" fg="var(--color-brand)">
          {rascunho.status}
        </Badge>
        {!podeEditar && rascunho.status === "Concluída" && (
          <span className={styles.trancada}>
            Concluída por {rascunho.concluidoPor || "—"} em {formatarDataHora(rascunho.concluidoEm)}.
          </span>
        )}
        {!podeEditar && rascunho.status !== "Concluída" && cicloEncerrado && (
          <span className={styles.trancada}>Ciclo encerrado — sem edição.</span>
        )}
        {!podeEditar && rascunho.status !== "Concluída" && !cicloEncerrado && (
          <span className={styles.trancada}>Somente leitura — quem preenche é {rascunho.gestorAvaliador || "outra pessoa"}.</span>
        )}
        {podeEditar && (salvandoAuto || ultimoSalvoAutoHora) && (
          <span className={styles.autosaveIndicador}>{salvandoAuto ? "Salvando..." : `Salvo automaticamente às ${ultimoSalvoAutoHora}`}</span>
        )}
      </div>

      <h4 className={styles.sectionTitle}>Competências Comportamentais</h4>
      {rascunho.resultadosComportamentais.map((resultado) => {
        // Nome/descrição/afirmações vêm do snapshot congelado na própria
        // avaliação — o catálogo (competenciasPorId) só serve de fallback
        // pra avaliações antigas, geradas antes do snapshot existir.
        const competenciaCatalogo = competenciasPorId.get(resultado.competenciaId);
        const nome = resultado.competenciaNome || competenciaCatalogo?.nome || "Competência";
        const descricao = resultado.competenciaDescricao || competenciaCatalogo?.descricao || "";
        const afirmacoes = resultado.afirmacoes?.length ? resultado.afirmacoes : competenciaCatalogo?.afirmacoes ?? [];
        const mediaCompetencia = arredondar(mediaAfirmacoes(resultado.notasAfirmacoes));
        return (
          <div key={resultado.competenciaId} className={styles.competenciaBloco}>
            <div className={styles.competenciaTopo}>
              <span className={styles.competenciaNome}>{nome}</span>
              {mediaCompetencia !== null && <span className={styles.mediaPill}>Média: {mediaCompetencia}</span>}
            </div>
            {descricao && <p className={styles.competenciaDescricao}>{descricao}</p>}
            {afirmacoes.map((afirmacao, indice) => (
              <div key={indice} className={styles.afirmacaoRow}>
                <span className={styles.afirmacaoTexto}>{afirmacao}</span>
                <div className={styles.escala}>
                  {ESCALA_COMPORTAMENTAL.map(({ nota }) => (
                    <button
                      key={nota}
                      type="button"
                      className={resultado.notasAfirmacoes[indice] === nota ? styles.notaBotaoAtivo : styles.notaBotao}
                      onClick={() => atualizarNotaAfirmacao(resultado.competenciaId, indice, nota)}
                      disabled={!podeEditar}
                      title={ESCALA_COMPORTAMENTAL.find((e) => e.nota === nota)?.significado}
                    >
                      {nota}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {rascunho.resultadosKpis.length > 0 && (
        <>
          <h4 className={styles.sectionTitle}>Competências Técnicas (KPIs)</h4>
          {rascunho.resultadosKpis.map((resultado) => {
            // Nome/descrição/meta/unidade/sentido/peso vêm do snapshot congelado
            // no próprio resultado — o catálogo (kpisPorId) só serve de fallback
            // pra avaliações antigas, geradas antes do snapshot existir.
            const kpiCatalogo = kpisPorId.get(resultado.kpiId);
            const nome = resultado.kpiNome || kpiCatalogo?.nomeIndicador || `KPI #${resultado.kpiId}`;
            const descricao = resultado.kpiDescricao || kpiCatalogo?.observacao || "";
            const meta = resultado.meta ?? kpiCatalogo?.meta ?? null;
            const unidadeMedida = resultado.unidadeMedida || kpiCatalogo?.unidadeMedida || "";
            const sentidoMeta = resultado.sentidoMeta ?? kpiCatalogo?.sentidoMeta;
            const peso = resultado.peso ?? kpiCatalogo?.peso ?? null;
            const percentual = sentidoMeta ? percentualAtingimentoKpi(meta, resultado.resultado, sentidoMeta) : null;
            const nota = notaKpi(resultado, kpiCatalogo);
            return (
              <div key={resultado.kpiId} className={styles.kpiBloco}>
                <div className={styles.kpiTopo}>
                  <span className={styles.kpiNome}>{nome}</span>
                  {nota !== null && (
                    <span className={styles.mediaPill}>
                      {arredondar(percentual)}% · Nota {nota}
                    </span>
                  )}
                </div>
                {descricao && <p className={styles.competenciaDescricao}>{descricao}</p>}
                <div className={styles.kpiDetalhes}>
                  <span>
                    Meta: <strong>{meta ?? "—"}</strong> {unidadeMedida}
                  </span>
                  <span>{sentidoMeta}</span>
                  {peso !== null && <span>Peso: {peso}</span>}
                </div>
                <div className={styles.resultadoCampo}>
                  <label className={styles.label} htmlFor={`kpi-resultado-${resultado.kpiId}`}>
                    Resultado obtido
                  </label>
                  <input
                    id={`kpi-resultado-${resultado.kpiId}`}
                    className={styles.input}
                    value={resultadoTexto[resultado.kpiId] ?? ""}
                    onChange={(e) => atualizarResultadoKpi(resultado.kpiId, e.target.value)}
                    disabled={!podeEditar}
                    inputMode="decimal"
                  />
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className={styles.resumo}>
        <h4 className={styles.sectionTitle}>Resumo</h4>
        {rascunho.resultadosKpis.length > 0 ? (
          <>
            <div className={styles.resumoLinha}>
              <span>Média Competências Técnicas</span>
              <strong>{mediaTecnicaValor ?? "—"}</strong>
            </div>
            <div className={styles.resumoLinha}>
              <span>Média Competências Comportamentais</span>
              <strong>{mediaComportamentalValor ?? "—"}</strong>
            </div>
            <div className={styles.resumoLinhaFinal}>
              <span>Nota Final da Avaliação</span>
              <strong>{notaFinal ?? "—"}</strong>
            </div>
          </>
        ) : (
          <div className={styles.resumoLinhaFinal}>
            <span>Média Competências de Liderança</span>
            <strong>{mediaComportamentalValor ?? "—"}</strong>
          </div>
        )}
      </div>

      {avaliacao.tipo === "GESTOR" && rascunho.statusCalibracao !== "Não iniciada" && (
        <div className={styles.resumo}>
          <h4 className={styles.sectionTitle}>Calibração</h4>
          <div className={styles.resumoLinha}>
            <span>Status da calibração</span>
            <Badge bg={STATUS_CALIBRACAO_TONE[rascunho.statusCalibracao].bg} fg={STATUS_CALIBRACAO_TONE[rascunho.statusCalibracao].fg}>
              {rascunho.statusCalibracao}
            </Badge>
          </div>
          {rascunho.statusCalibracao === "Homologada" && (
            <>
              <div className={styles.resumoLinhaFinal}>
                <span>Nota Oficial</span>
                <strong>{rascunho.notaFinalOficial ?? "—"}</strong>
              </div>
              <div className={styles.resumoLinha}>
                {rascunho.devolutivaRealizada ? (
                  <span className={styles.trancada}>
                    Devolutiva realizada por {rascunho.devolutivaPor || "—"} em {formatarDataHora(rascunho.devolutivaEm)}.
                  </span>
                ) : podeMarcarDevolutiva(rascunho) ? (
                  <Button variant="secondary" onClick={handleMarcarDevolutiva} disabled={marcandoDevolutiva}>
                    {marcandoDevolutiva ? "Marcando..." : "Marcar devolutiva como realizada"}
                  </Button>
                ) : (
                  <span className={styles.trancada}>Devolutiva ainda não realizada.</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <h4 className={styles.sectionTitle}>Comentários (opcionais)</h4>
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="comentario-comportamental">
          Comentário — Competências Comportamentais
        </label>
        <textarea
          id="comentario-comportamental"
          className={styles.textarea}
          rows={2}
          value={rascunho.comentarioComportamental}
          onChange={(e) => atualizarComentario("comentarioComportamental", e.target.value)}
          disabled={!podeEditar}
        />
      </div>
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="comentario-tecnico">
          Comentário — Competências Técnicas
        </label>
        <textarea
          id="comentario-tecnico"
          className={styles.textarea}
          rows={2}
          value={rascunho.comentarioTecnico}
          onChange={(e) => atualizarComentario("comentarioTecnico", e.target.value)}
          disabled={!podeEditar}
        />
      </div>
      <div className={styles.campo}>
        <label className={styles.label} htmlFor="comentario-geral">
          Comentário Geral
        </label>
        <textarea
          id="comentario-geral"
          className={styles.textarea}
          rows={2}
          value={rascunho.comentarioGeral}
          onChange={(e) => atualizarComentario("comentarioGeral", e.target.value)}
          disabled={!podeEditar}
        />
      </div>

      {podeEditar && !completa && pendencias.length > 0 && (
        <div className={styles.pendencias}>
          <span className={styles.pendenciasTitulo}>Itens pendentes para concluir:</span>
          <ul className={styles.pendenciasLista}>
            {pendencias.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {podeEditar && (
        <div className={styles.edicaoAcoes}>
          <Button variant="secondary" onClick={() => handleSalvar("progresso")} disabled={salvando !== null}>
            {salvando === "progresso" ? "Salvando..." : "Salvar progresso"}
          </Button>
          <Button variant="primary" onClick={() => handleSalvar("concluir")} disabled={!completa || salvando !== null}>
            {salvando === "concluir" ? "Concluindo..." : "Concluir avaliação"}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
