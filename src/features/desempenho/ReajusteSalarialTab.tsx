import { useMemo, useState } from "react";
import { Badge, Button, EmptyState, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import {
  competenciaParaIso,
  construirReajusteSalarial,
  parseTabelaReajuste,
  validarLinhaReajuste,
} from "../../domain/reajusteSalarial";
import type { LinhaReajusteValidada } from "../../domain/reajusteSalarial";
import { formatarPercentual, formatarValorMonetario } from "../../domain/salario";
import { usePortalData } from "../../store/usePortalData";
import type { ReajusteSalarial } from "../../types/domain";
import styles from "./ReajusteSalarialTab.module.css";

const STATUS_META: Record<LinhaReajusteValidada["status"], { label: string; bg: string; fg: string }> = {
  elegivel: { label: "Elegível", bg: "var(--color-success-bg)", fg: "var(--color-success-fg)" },
  pj: { label: "PJ — excluído", bg: "var(--color-neutral-bg)", fg: "var(--color-neutral-fg)" },
  naoEncontrado: { label: "Não encontrado", bg: "var(--color-danger-bg, #fbe4e4)", fg: "var(--color-danger-fg, #a3342a)" },
  divergencia: { label: "Divergência", bg: "var(--color-warning-bg, #fbeee0)", fg: "var(--color-warning-fg, #a3672a)" },
  duplicado: { label: "Já aplicado", bg: "var(--color-neutral-bg)", fg: "var(--color-neutral-fg)" },
  invalido: { label: "Linha inválida", bg: "var(--color-danger-bg, #fbe4e4)", fg: "var(--color-danger-fg, #a3342a)" },
};

const PLACEHOLDER_COLADO = `VINCULO\tCOLABORADOR\tADMISSÃO\tSALÁRIO\tREAJUSTE BASE\tFATORIAL\tNOVO SALÁRIO
CLT\tAlice Coutinho da Cruz\t15/09/2025\t1621.00\t0.06\t1.00\t1718.26`;

/** Reajuste Salarial — resultado do 2º Ciclo da AVD. Cola-se aqui o texto
 * copiado direto da planilha oficial (Excel → Ctrl+C → Ctrl+V); cada linha é
 * conferida contra o cadastro e o salário vigente JÁ EXISTENTE
 * (salarioVigente() em domain/salario.ts) antes de qualquer coisa ser
 * aplicada — nenhuma linha com pendência é aplicada silenciosamente. Depois
 * de "Efetivar", o reajuste vira mais uma fonte de salarioVigente() (sem
 * tocar em `colaboradores` nem duplicar a estrutura de salário) e um evento
 * na Timeline do colaborador. RH-only (ver GestaoDesempenhoPage.tsx). */
export function ReajusteSalarialTab() {
  const { colaboradores, movimentacoes, salariosBase, reajustesSalariais, aplicarReajustesSalariais, conta } = usePortalData();
  const { flash } = useToast();

  const [textoColado, setTextoColado] = useState("");
  const [competencia, setCompetencia] = useState("Agosto/2026");
  const [origem, setOrigem] = useState("AVD 2º Ciclo");
  const [validadas, setValidadas] = useState<LinhaReajusteValidada[] | null>(null);
  const [incluidas, setIncluidas] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  const competenciaIso = useMemo(() => competenciaParaIso(competencia), [competencia]);

  function handleAnalisar() {
    if (!competenciaIso) {
      flash('Competência inválida — use o formato "Mês/aaaa", ex.: "Agosto/2026".');
      return;
    }
    const brutas = parseTabelaReajuste(textoColado);
    if (brutas.length === 0) {
      flash("Nada reconhecido — confira se colou a tabela inteira, com o cabeçalho.");
      return;
    }
    const resultado = brutas.map((linha) =>
      validarLinhaReajuste(linha, colaboradores, movimentacoes, salariosBase, reajustesSalariais, competenciaIso, origem),
    );
    setValidadas(resultado);
    setIncluidas(new Set(resultado.map((v, i) => (v.status === "elegivel" ? i : -1)).filter((i) => i >= 0)));
  }

  function toggleIncluida(i: number) {
    setIncluidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
  }

  async function handleEfetivar() {
    if (!validadas || !competenciaIso) return;
    const reajustes: ReajusteSalarial[] = [];
    validadas.forEach((v, i) => {
      if (!incluidas.has(i)) return;
      const r = construirReajusteSalarial(v, competencia, competenciaIso, origem, conta.nome);
      if (r) reajustes.push(r);
    });
    if (reajustes.length === 0) {
      flash("Nenhuma linha elegível selecionada.");
      return;
    }
    setAplicando(true);
    const result = await aplicarReajustesSalariais(reajustes);
    setAplicando(false);
    if (result.ok) {
      setValidadas(null);
      setIncluidas(new Set());
      setTextoColado("");
    }
  }

  const elegiveisCount = validadas?.filter((v) => v.status === "elegivel").length ?? 0;
  const aplicadosOrdenados = useMemo(
    () => [...reajustesSalariais].sort((a, b) => b.aplicadoEm.localeCompare(a.aplicadoEm)),
    [reajustesSalariais],
  );

  return (
    <>
      <div className={styles.topo}>
        <p className={styles.explicacao}>
          Reajuste salarial como resultado da AVD — o salário é atualizado usando a mesma estrutura de Salário/Custo
          Mensal Folha já existente (nada é duplicado): cole aqui a planilha oficial, confira a validação linha a
          linha e efetive só o que estiver correto. O salário anterior nunca é perdido, e o evento aparece na Timeline
          do colaborador com a origem indicada.
        </p>
      </div>

      <div className={styles.painelImportacao}>
        <div className={styles.camposTopo}>
          <label className={styles.campo}>
            <span>Competência</span>
            <input value={competencia} onChange={(e) => setCompetencia(e.target.value)} placeholder="Agosto/2026" />
          </label>
          <label className={styles.campo}>
            <span>Origem</span>
            <input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="AVD 2º Ciclo" />
          </label>
        </div>

        <label className={styles.campoTextarea}>
          <span>Cole aqui a tabela da planilha (Excel → Ctrl+C → Ctrl+V), com o cabeçalho incluído</span>
          <textarea
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            placeholder={PLACEHOLDER_COLADO}
            rows={6}
          />
        </label>

        <div className={styles.acoesImportacao}>
          <Button variant="primary" onClick={handleAnalisar} disabled={!textoColado.trim()}>
            Analisar
          </Button>
        </div>
      </div>

      {validadas && (
        <>
          <p className={styles.resumoValidacao}>
            {validadas.length} linha(s) analisada(s) — <strong>{elegiveisCount} elegível(is)</strong>,{" "}
            {validadas.length - elegiveisCount} com pendência (PJ, divergência, duplicado ou não encontrado).
          </p>

          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Colaborador</th>
                  <th className={tableStyles.right}>Salário atual</th>
                  <th className={tableStyles.right}>Reajuste base</th>
                  <th className={tableStyles.right}>Fatorial</th>
                  <th className={tableStyles.right}>Reajuste efetivo</th>
                  <th className={tableStyles.right}>Novo salário</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {validadas.map((v, i) => {
                  const meta = STATUS_META[v.status];
                  return (
                    <tr key={`${v.linha.colaborador}-${i}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={incluidas.has(i)}
                          disabled={v.status !== "elegivel"}
                          onChange={() => toggleIncluida(i)}
                        />
                      </td>
                      <td>{v.colaboradorNome ?? v.linha.colaborador}</td>
                      <td className={tableStyles.right}>
                        {v.salarioAtualSistema !== null ? formatarValorMonetario(v.salarioAtualSistema) : (v.linha.salario !== null ? formatarValorMonetario(v.linha.salario) : "—")}
                      </td>
                      <td className={tableStyles.right}>{v.linha.reajusteBase !== null ? formatarPercentual(v.linha.reajusteBase) : "—"}</td>
                      <td className={tableStyles.right}>{v.linha.fatorial !== null ? formatarPercentual(v.linha.fatorial) : "—"}</td>
                      <td className={tableStyles.right}>
                        {v.reajusteEfetivoCalculado !== null ? formatarPercentual(v.reajusteEfetivoCalculado) : "—"}
                      </td>
                      <td className={tableStyles.right}>
                        {v.novoSalarioCalculado !== null ? formatarValorMonetario(v.novoSalarioCalculado) : "—"}
                      </td>
                      <td>
                        <div className={styles.statusCelula}>
                          <Badge bg={meta.bg} fg={meta.fg}>
                            {meta.label}
                          </Badge>
                          {v.motivo && <span className={styles.motivo}>{v.motivo}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.acoesImportacao}>
            <Button variant="primary" onClick={handleEfetivar} disabled={aplicando || incluidas.size === 0}>
              {aplicando ? "Aplicando..." : `Efetivar ${incluidas.size} reajuste(s)`}
            </Button>
          </div>
        </>
      )}

      <h4 className={styles.sectionTitle}>Reajustes já aplicados</h4>
      {aplicadosOrdenados.length === 0 ? (
        <EmptyState message="Nenhum reajuste salarial aplicado ainda." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th className={tableStyles.right}>Salário atual</th>
                <th className={tableStyles.right}>Reajuste base</th>
                <th className={tableStyles.right}>Fatorial</th>
                <th className={tableStyles.right}>Reajuste efetivo</th>
                <th className={tableStyles.right}>Novo salário</th>
                <th>Competência</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {aplicadosOrdenados.map((r) => (
                <tr key={r.id}>
                  <td>{r.colaboradorNome}</td>
                  <td className={tableStyles.right}>{formatarValorMonetario(r.salarioAnterior)}</td>
                  <td className={tableStyles.right}>{formatarPercentual(r.reajusteBase)}</td>
                  <td className={tableStyles.right}>{formatarPercentual(r.fatorial)}</td>
                  <td className={tableStyles.right}>{formatarPercentual(r.reajusteEfetivo)}</td>
                  <td className={tableStyles.right}>{formatarValorMonetario(r.novoSalario)}</td>
                  <td>{r.competencia}</td>
                  <td>{r.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
