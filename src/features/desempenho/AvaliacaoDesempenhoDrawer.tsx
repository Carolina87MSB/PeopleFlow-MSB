import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Drawer } from "../../components/ui";
import {
  arredondar,
  avaliacaoCompleta,
  ESCALA_COMPORTAMENTAL,
  itensPendentes,
  mediaAfirmacoes,
  mediaComportamental,
  mediaTecnica,
  notaFinalAvaliacao,
  notaKpi,
  percentualAtingimentoKpi,
} from "../../domain/avaliacaoDesempenho";
import { formatarDataHora, formatarHoraAtual } from "../../domain/dates";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { AvaliacaoDesempenho, StatusAvaliacaoDesempenho } from "../../types/domain";
import styles from "./AvaliacaoDesempenhoDrawer.module.css";

const AUTOSAVE_DEBOUNCE_MS = 1200;

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
  const { colaboradores, competenciasComportamentais, kpisCargo, configAvaliacaoDesempenho, salvarAvaliacaoDesempenho, podeEditarAvaliacaoDesempenho } =
    usePortalData();

  const podeEditar = podeEditarAvaliacaoDesempenho(avaliacao);
  const colaborador = colaboradores.find((c) => c.nome === avaliacao.colaboradorNome);

  // Recuperação da última versão salva: o rascunho sempre parte do que está
  // persistido no Supabase (prop `avaliacao`), então reabrir o Drawer já
  // retoma de onde parou — não precisa de nenhuma lógica adicional.
  const [rascunho, setRascunho] = useState<AvaliacaoDesempenho>(() => ({
    ...avaliacao,
    resultadosComportamentais: avaliacao.resultadosComportamentais.map((r) => ({ ...r, notasAfirmacoes: [...r.notasAfirmacoes] })),
    resultadosKpis: avaliacao.resultadosKpis.map((r) => ({ ...r })),
  }));
  const [salvando, setSalvando] = useState<"progresso" | "concluir" | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvandoAuto, setSalvandoAuto] = useState(false);
  const [ultimoSalvoAutoHora, setUltimoSalvoAutoHora] = useState<string | null>(null);

  const kpisPorId = useMemo(() => new Map(kpisCargo.map((k) => [k.id, k])), [kpisCargo]);
  const competenciasPorId = useMemo(() => new Map(competenciasComportamentais.map((c) => [c.id, c])), [competenciasComportamentais]);

  const mediaTecnicaValor = mediaTecnica(rascunho.resultadosKpis, kpisCargo);
  const mediaComportamentalValor = mediaComportamental(rascunho.resultadosComportamentais);
  const notaFinal = notaFinalAvaliacao(mediaTecnicaValor, mediaComportamentalValor, configAvaliacaoDesempenho);
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

  function atualizarResultadoKpi(kpiId: number, valor: string) {
    const resultado = valor.trim() === "" ? null : Number(valor.replace(",", "."));
    setRascunho((r) => ({
      ...r,
      resultadosKpis: r.resultadosKpis.map((res) => (res.kpiId === kpiId ? { ...res, resultado: Number.isNaN(resultado) ? null : resultado } : res)),
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

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{avaliacao.colaboradorNome}</div>
          <div className={styles.drawerSub}>
            {colaborador ? formatarNomeCargo(colaborador.cargo) : "—"} · {avaliacao.ciclo}
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
        {!podeEditar && rascunho.status !== "Concluída" && <span className={styles.trancada}>Ciclo encerrado — sem edição.</span>}
        {podeEditar && (salvandoAuto || ultimoSalvoAutoHora) && (
          <span className={styles.autosaveIndicador}>{salvandoAuto ? "Salvando..." : `Salvo automaticamente às ${ultimoSalvoAutoHora}`}</span>
        )}
      </div>

      <h4 className={styles.sectionTitle}>Competências Comportamentais</h4>
      {rascunho.resultadosComportamentais.map((resultado) => {
        const competencia = competenciasPorId.get(resultado.competenciaId);
        if (!competencia) return null;
        const mediaCompetencia = arredondar(mediaAfirmacoes(resultado.notasAfirmacoes));
        return (
          <div key={resultado.competenciaId} className={styles.competenciaBloco}>
            <div className={styles.competenciaTopo}>
              <span className={styles.competenciaNome}>{competencia.nome}</span>
              {mediaCompetencia !== null && <span className={styles.mediaPill}>Média: {mediaCompetencia}</span>}
            </div>
            {competencia.descricao && <p className={styles.competenciaDescricao}>{competencia.descricao}</p>}
            {competencia.afirmacoes.map((afirmacao, indice) => (
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

      <h4 className={styles.sectionTitle}>Competências Técnicas (KPIs)</h4>
      {rascunho.resultadosKpis.map((resultado) => {
        const kpi = kpisPorId.get(resultado.kpiId);
        if (!kpi) return null;
        const percentual = percentualAtingimentoKpi(kpi.meta, resultado.resultado, kpi.sentidoMeta);
        const nota = notaKpi(resultado, kpi);
        return (
          <div key={resultado.kpiId} className={styles.kpiBloco}>
            <div className={styles.kpiTopo}>
              <span className={styles.kpiNome}>{kpi.nomeIndicador}</span>
              {nota !== null && (
                <span className={styles.mediaPill}>
                  {arredondar(percentual)}% · Nota {nota}
                </span>
              )}
            </div>
            <div className={styles.kpiDetalhes}>
              <span>
                Meta: <strong>{kpi.meta ?? "—"}</strong> {kpi.unidadeMedida}
              </span>
              <span>{kpi.sentidoMeta}</span>
              {kpi.peso !== null && <span>Peso: {kpi.peso}</span>}
            </div>
            <div className={styles.resultadoCampo}>
              <label className={styles.label} htmlFor={`kpi-resultado-${kpi.id}`}>
                Resultado obtido
              </label>
              <input
                id={`kpi-resultado-${kpi.id}`}
                className={styles.input}
                value={resultado.resultado ?? ""}
                onChange={(e) => atualizarResultadoKpi(kpi.id, e.target.value)}
                disabled={!podeEditar}
                inputMode="decimal"
              />
            </div>
          </div>
        );
      })}

      <div className={styles.resumo}>
        <h4 className={styles.sectionTitle}>Resumo</h4>
        <div className={styles.resumoLinha}>
          <span>Média Competências Técnicas</span>
          <strong>{arredondar(mediaTecnicaValor) ?? "—"}</strong>
        </div>
        <div className={styles.resumoLinha}>
          <span>Média Competências Comportamentais</span>
          <strong>{arredondar(mediaComportamentalValor) ?? "—"}</strong>
        </div>
        <div className={styles.resumoLinhaFinal}>
          <span>Nota Final da Avaliação</span>
          <strong>{arredondar(notaFinal) ?? "—"}</strong>
        </div>
      </div>

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
