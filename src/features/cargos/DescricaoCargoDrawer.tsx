import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Drawer } from "../../components/ui";
import { CAMPOS_DESCRICAO_CARGO, descricaoCargoVazia } from "../../domain/descricaoCargo";
import type { CampoDescricaoCargo, CampoMeta } from "../../domain/descricaoCargo";
import { usePortalData } from "../../store/usePortalData";
import type { HistoricoDescricaoCargo } from "../../types/domain";
import styles from "./DescricaoCargoDrawer.module.css";

interface DescricaoCargoDrawerProps {
  cargoNome: string;
  onClose: () => void;
}

/** Ficha do formulário de descrição de cargo (POP-RH-001): todos os campos do
 * documento oficial, editáveis campo a campo (só RH), com histórico de
 * atualizações — dados de controle (código/revisão/data) ficam em destaque
 * no topo por serem usados em auditorias. */
export function DescricaoCargoDrawer({ cargoNome, onClose }: DescricaoCargoDrawerProps) {
  const { descricoesCargo, podeEditarDescricaoCargo, atualizarCampoDescricaoCargo, carregarHistoricoDescricaoCargo } = usePortalData();

  const descricao = useMemo(
    () => descricoesCargo.find((d) => d.cargoNome === cargoNome) ?? descricaoCargoVazia(cargoNome),
    [descricoesCargo, cargoNome],
  );

  const [historico, setHistorico] = useState<HistoricoDescricaoCargo[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregandoHistorico(true);
    carregarHistoricoDescricaoCargo(cargoNome)
      .then((h) => {
        if (!cancelado) setHistorico(h);
      })
      .finally(() => {
        if (!cancelado) setCarregandoHistorico(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cargoNome, carregarHistoricoDescricaoCargo]);

  const grupos = useMemo(() => {
    const map = new Map<string, CampoMeta[]>();
    CAMPOS_DESCRICAO_CARGO.forEach((c) => {
      const list = map.get(c.grupo) || [];
      list.push(c);
      map.set(c.grupo, list);
    });
    return [...map.entries()];
  }, []);

  async function handleSalvarCampo(campo: CampoDescricaoCargo, valorNovo: string) {
    const result = await atualizarCampoDescricaoCargo(cargoNome, campo, valorNovo);
    if (result.ok) {
      const h = await carregarHistoricoDescricaoCargo(cargoNome);
      setHistorico(h);
    }
    return result;
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{cargoNome}</div>
          <div className={styles.drawerSub}>Descrição de cargo · POP-RH-001</div>
        </div>
      }
    >
      {grupos.map(([grupo, campos]) => (
        <div key={grupo} className={grupo === "Dados do formulário (auditoria)" ? styles.grupoAuditoria : styles.grupo}>
          <h4 className={styles.sectionTitle}>{grupo}</h4>
          <div className={styles.camposGrupo}>
            {campos.map((campo) => (
              <CampoEditavel
                key={campo.key}
                meta={campo}
                valor={descricao[campo.key]}
                podeEditar={podeEditarDescricaoCargo}
                onSalvar={(novo) => handleSalvarCampo(campo.key, novo)}
              />
            ))}
          </div>
        </div>
      ))}

      <h4 className={styles.sectionTitle}>Histórico de atualizações{historico.length > 0 ? ` (${historico.length})` : ""}</h4>
      {carregandoHistorico ? (
        <div className={styles.semHistorico}>Carregando histórico...</div>
      ) : historico.length === 0 ? (
        <div className={styles.semHistorico}>Nenhuma alteração registrada ainda para esta descrição de cargo.</div>
      ) : (
        <div className={styles.timeline}>
          {historico.map((h) => (
            <div key={h.id} className={styles.item}>
              <span className={styles.dot} />
              <div className={styles.itemContent}>
                <div className={styles.itemTopo}>
                  <span className={styles.itemTitulo}>{h.campoLabel}</span>
                  <span className={styles.itemData}>{formatarDataHora(h.editadoEm)}</span>
                </div>
                <p className={styles.itemDescricao}>
                  {h.valorAnterior ? (
                    <>
                      <s className={styles.valorAnterior}>{truncar(h.valorAnterior)}</s>{" "}
                    </>
                  ) : null}
                  {truncar(h.valorNovo) || "(vazio)"}
                </p>
                <p className={styles.itemAutor}>por {h.editadoPor}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function truncar(s: string, max = 160): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface CampoEditavelProps {
  meta: CampoMeta;
  valor: string;
  podeEditar: boolean;
  onSalvar: (valorNovo: string) => Promise<{ ok: true } | { ok: false }>;
}

function CampoEditavel({ meta, valor, podeEditar, onSalvar }: CampoEditavelProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const [salvando, setSalvando] = useState(false);

  function iniciarEdicao() {
    setRascunho(valor);
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    const result = await onSalvar(rascunho.trim());
    setSalvando(false);
    if (result.ok) setEditando(false);
  }

  return (
    <div className={styles.campo}>
      <div className={styles.campoTopo}>
        <span className={styles.campoLabel}>{meta.label}</span>
        {podeEditar && !editando ? (
          <button type="button" className={styles.editarBtn} onClick={iniciarEdicao} title={`Editar ${meta.label}`}>
            <Pencil size={12} />
          </button>
        ) : null}
      </div>
      {editando ? (
        <div className={styles.edicao}>
          {meta.multiline ? (
            <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={4} className={styles.textarea} />
          ) : (
            <input value={rascunho} onChange={(e) => setRascunho(e.target.value)} className={styles.input} />
          )}
          <div className={styles.edicaoAcoes}>
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.campoValor}>{valor || <span className={styles.vazio}>Não preenchido</span>}</div>
      )}
    </div>
  );
}
