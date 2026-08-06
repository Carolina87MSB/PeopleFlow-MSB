import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Drawer } from "../../components/ui";
import { formatarNomeCargo } from "../../domain/formatoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { KpiCargo } from "../../types/domain";
import styles from "./CompetenciasTecnicasTab.module.css";

interface KpiCargoDrawerProps {
  cargoNome: string;
  onClose: () => void;
}

interface RascunhoKpi {
  nomeIndicador: string;
  meta: string;
  unidadeMedida: string;
  sentidoMeta: KpiCargo["sentidoMeta"];
  peso: string;
  observacao: string;
}

const RASCUNHO_VAZIO: RascunhoKpi = { nomeIndicador: "", meta: "", unidadeMedida: "", sentidoMeta: "Maior é Melhor", peso: "", observacao: "" };

function paraRascunho(kpi: KpiCargo): RascunhoKpi {
  return {
    nomeIndicador: kpi.nomeIndicador,
    meta: kpi.meta === null ? "" : String(kpi.meta),
    unidadeMedida: kpi.unidadeMedida,
    sentidoMeta: kpi.sentidoMeta,
    peso: kpi.peso === null ? "" : String(kpi.peso),
    observacao: kpi.observacao,
  };
}

function paraNumero(valor: string): number | null {
  if (!valor.trim()) return null;
  const n = Number(valor.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Aviso (não bloqueia salvar) para o erro real que motivou esta função: meta
 * de KPI em % digitada em formato decimal-fração (0,98 em vez de 98). Não
 * bloqueia porque a mesma unidade "%" também cobre metas legitimamente < 1
 * (ex.: "Erro de Separação / Expedição" = 0,2%, "Retrabalho Comercial" =
 * 0,9%) — um bloqueio de "< 1" impediria justamente essas metas reais de
 * serem salvas de novo. Só sinaliza o padrão suspeito pra quem está digitando
 * decidir, evitando o retrabalho sem travar um caso legítimo. */
function avisoMetaPercentual(unidadeMedida: string, meta: string): string | null {
  if (unidadeMedida.trim() !== "%") return null;
  const n = paraNumero(meta);
  if (n === null) return null;
  if (n > 0 && n < 1) return `Unidade "%" usa escala 0–100 (ex.: 98, não 0,98). Confirme: ${n} representa ${n}%.`;
  if (n > 100) return `Unidade "%" usa escala 0–100 — ${n} parece alto para uma meta em %.`;
  return null;
}

/** KPIs (Competências Técnicas) de um cargo específico — listar, editar,
 * excluir e adicionar novo. Etapa 1: sem cálculo de resultado, só cadastro. */
export function KpiCargoDrawer({ cargoNome, onClose }: KpiCargoDrawerProps) {
  const { kpisCargo, criarKpiCargo, atualizarKpiCargo, excluirKpiCargo, podeEditarGestaoDesempenho } = usePortalData();

  const kpisDoCargo = useMemo(
    () => kpisCargo.filter((k) => k.cargoNome === cargoNome).sort((a, b) => a.ordem - b.ordem),
    [kpisCargo, cargoNome],
  );

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoKpi>(RASCUNHO_VAZIO);
  const [adicionando, setAdicionando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function iniciarEdicao(kpi: KpiCargo) {
    setEditandoId(kpi.id);
    setRascunho(paraRascunho(kpi));
    setAdicionando(false);
  }

  function iniciarNovo() {
    setAdicionando(true);
    setEditandoId(null);
    setRascunho(RASCUNHO_VAZIO);
  }

  function cancelar() {
    setEditandoId(null);
    setAdicionando(false);
  }

  async function salvarEdicao(kpi: KpiCargo) {
    setSalvando(true);
    const result = await atualizarKpiCargo({
      ...kpi,
      nomeIndicador: rascunho.nomeIndicador.trim(),
      meta: paraNumero(rascunho.meta),
      unidadeMedida: rascunho.unidadeMedida.trim(),
      sentidoMeta: rascunho.sentidoMeta,
      peso: paraNumero(rascunho.peso),
      observacao: rascunho.observacao.trim(),
    });
    setSalvando(false);
    if (result.ok) setEditandoId(null);
  }

  async function salvarNovo() {
    setSalvando(true);
    const result = await criarKpiCargo({
      cargoNome,
      nomeIndicador: rascunho.nomeIndicador.trim(),
      meta: paraNumero(rascunho.meta),
      unidadeMedida: rascunho.unidadeMedida.trim(),
      sentidoMeta: rascunho.sentidoMeta,
      peso: paraNumero(rascunho.peso),
      observacao: rascunho.observacao.trim(),
      ordem: kpisDoCargo.length,
    });
    setSalvando(false);
    if (result.ok) setAdicionando(false);
  }

  async function handleExcluir(id: number) {
    await excluirKpiCargo(id);
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{formatarNomeCargo(cargoNome)}</div>
          <div className={styles.drawerSub}>Competências Técnicas (KPIs)</div>
        </div>
      }
    >
      {kpisDoCargo.length === 0 && !adicionando && <p className={styles.semKpi}>Nenhum KPI cadastrado para este cargo ainda.</p>}

      <div className={styles.listaKpis}>
        {kpisDoCargo.map((kpi) =>
          editandoId === kpi.id ? (
            <FormularioKpi
              key={kpi.id}
              rascunho={rascunho}
              setRascunho={setRascunho}
              onCancelar={cancelar}
              onSalvar={() => salvarEdicao(kpi)}
              salvando={salvando}
            />
          ) : (
            <div key={kpi.id} className={styles.kpiItem}>
              <div className={styles.kpiTopo}>
                <span className={styles.kpiNome}>{kpi.nomeIndicador}</span>
                {podeEditarGestaoDesempenho && (
                  <div className={styles.kpiAcoes}>
                    <button type="button" className={styles.iconBtn} onClick={() => iniciarEdicao(kpi)} title="Editar KPI">
                      <Pencil size={13} />
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={() => handleExcluir(kpi.id)} title="Excluir KPI">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.kpiDetalhes}>
                <span>
                  Meta: <strong>{kpi.meta ?? "—"}</strong> {kpi.unidadeMedida}
                </span>
                <span>{kpi.sentidoMeta}</span>
                {kpi.peso !== null && <span>Peso: {kpi.peso}</span>}
              </div>
              {kpi.observacao && <p className={styles.kpiObs}>{kpi.observacao}</p>}
            </div>
          ),
        )}
      </div>

      {adicionando && (
        <FormularioKpi rascunho={rascunho} setRascunho={setRascunho} onCancelar={cancelar} onSalvar={salvarNovo} salvando={salvando} novo />
      )}

      {podeEditarGestaoDesempenho && !adicionando && editandoId === null && (
        <Button variant="secondary" icon={<Plus size={14} />} onClick={iniciarNovo}>
          Adicionar KPI
        </Button>
      )}
    </Drawer>
  );
}

interface FormularioKpiProps {
  rascunho: RascunhoKpi;
  setRascunho: (r: RascunhoKpi) => void;
  onCancelar: () => void;
  onSalvar: () => void;
  salvando: boolean;
  novo?: boolean;
}

function FormularioKpi({ rascunho, setRascunho, onCancelar, onSalvar, salvando, novo }: FormularioKpiProps) {
  const aviso = avisoMetaPercentual(rascunho.unidadeMedida, rascunho.meta);
  return (
    <div className={styles.formularioKpi}>
      <input
        className={styles.input}
        placeholder="Nome do indicador"
        value={rascunho.nomeIndicador}
        onChange={(e) => setRascunho({ ...rascunho, nomeIndicador: e.target.value })}
      />
      <div className={styles.linhaFormulario}>
        <input
          className={styles.inputPequeno}
          placeholder="Meta"
          value={rascunho.meta}
          onChange={(e) => setRascunho({ ...rascunho, meta: e.target.value })}
        />
        <input
          className={styles.inputPequeno}
          placeholder="Unidade (%, dias...)"
          value={rascunho.unidadeMedida}
          onChange={(e) => setRascunho({ ...rascunho, unidadeMedida: e.target.value })}
        />
        <select
          className={styles.inputPequeno}
          value={rascunho.sentidoMeta}
          onChange={(e) => setRascunho({ ...rascunho, sentidoMeta: e.target.value as KpiCargo["sentidoMeta"] })}
        >
          <option value="Maior é Melhor">Maior é Melhor</option>
          <option value="Menor é Melhor">Menor é Melhor</option>
        </select>
        <input
          className={styles.inputPequeno}
          placeholder="Peso"
          value={rascunho.peso}
          onChange={(e) => setRascunho({ ...rascunho, peso: e.target.value })}
        />
      </div>
      {aviso && <p className={styles.avisoMeta}>{aviso}</p>}
      <textarea
        className={styles.textarea}
        rows={2}
        placeholder="Observação (opcional)"
        value={rascunho.observacao}
        onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
      />
      <div className={styles.edicaoAcoes}>
        <Button variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={onSalvar} disabled={salvando || !rascunho.nomeIndicador.trim()}>
          {salvando ? "Salvando..." : novo ? "Adicionar" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
