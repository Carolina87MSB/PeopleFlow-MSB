import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Drawer } from "../../components/ui";
import { usePortalData } from "../../store/usePortalData";
import type { CompetenciaComportamental, PdiBibliotecaItem, TipoCompetenciaPdi } from "../../types/domain";
import styles from "./CompetenciasComportamentaisTab.module.css";

interface PdiBibliotecaDrawerProps {
  item: PdiBibliotecaItem;
  chavesExistentes: Set<string>;
  competenciasDisponiveis: CompetenciaComportamental[];
  nomesKpiDisponiveis: string[];
  onClose: () => void;
}

/** Edição de um modelo da biblioteca de PDI — a chave (competência
 * comportamental do catálogo ou nome do KPI) só é escolhida na criação;
 * depois disso fica travada (trocar a chave é excluir e criar de novo,
 * evitando reassociar sem querer um modelo já em uso). */
export function PdiBibliotecaDrawer({ item, chavesExistentes, competenciasDisponiveis, nomesKpiDisponiveis, onClose }: PdiBibliotecaDrawerProps) {
  const { competenciasComportamentais, salvarItemBibliotecaPdi, podeEditarGestaoDesempenho } = usePortalData();

  const ehNovo = item.chave === "";
  const [tipo, setTipo] = useState<TipoCompetenciaPdi>(item.tipoCompetencia);
  const [chave, setChave] = useState(item.chave);
  const [objetivo, setObjetivo] = useState(item.objetivoSugerido);
  const [acoes, setAcoes] = useState<string[]>(item.acoesSugeridas.length > 0 ? item.acoesSugeridas : [""]);
  const [salvando, setSalvando] = useState(false);

  const competenciaPorId = new Map(competenciasComportamentais.map((c) => [c.id, c]));
  const nome = ehNovo ? "Novo modelo" : tipo === "Comportamental" ? competenciaPorId.get(chave)?.nome ?? chave : chave;

  const chaveJaExiste = ehNovo && chave !== "" && chavesExistentes.has(`${tipo}::${chave}`);
  const chaveValida = chave.trim() !== "" && !chaveJaExiste;

  function atualizarAcao(indice: number, valor: string) {
    setAcoes(acoes.map((a, i) => (i === indice ? valor : a)));
  }

  function removerAcao(indice: number) {
    setAcoes(acoes.filter((_, i) => i !== indice));
  }

  function adicionarAcao() {
    setAcoes([...acoes, ""]);
  }

  async function handleSalvar() {
    setSalvando(true);
    const acoesLimpas = acoes.map((a) => a.trim()).filter(Boolean);
    const result = await salvarItemBibliotecaPdi({
      chave,
      tipoCompetencia: tipo,
      objetivoSugerido: objetivo.trim(),
      acoesSugeridas: acoesLimpas,
      updatedAt: item.updatedAt,
      updatedBy: item.updatedBy,
    });
    setSalvando(false);
    if (result.ok) onClose();
  }

  return (
    <Drawer
      onClose={onClose}
      header={
        <div className={styles.drawerHeader}>
          <div className={styles.drawerNome}>{nome}</div>
          <div className={styles.drawerSub}>Modelo de PDI</div>
        </div>
      }
    >
      {ehNovo ? (
        <>
          <div className={styles.campo}>
            <span className={styles.label}>Tipo</span>
            <select
              className={styles.select}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoCompetenciaPdi);
                setChave("");
              }}
            >
              <option value="Comportamental">Competência Comportamental</option>
              <option value="Tecnica">KPI (Competência Técnica)</option>
            </select>
          </div>

          {tipo === "Comportamental" ? (
            <div className={styles.campo}>
              <span className={styles.label}>Competência</span>
              <select className={styles.select} value={chave} onChange={(e) => setChave(e.target.value)}>
                <option value="">Selecione...</option>
                {competenciasDisponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.campo}>
              <span className={styles.label}>Nome do KPI</span>
              <input
                className={styles.input}
                list="pdi-biblioteca-kpis"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder="Ex.: Produtividade mensal"
              />
              <datalist id="pdi-biblioteca-kpis">
                {nomesKpiDisponiveis.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          )}
          {chaveJaExiste && <p className={styles.explicacao}>Já existe um modelo cadastrado para esta chave.</p>}
        </>
      ) : (
        <div className={styles.campo}>
          <span className={styles.label}>{tipo === "Comportamental" ? "Competência" : "KPI"}</span>
          <input className={styles.input} value={nome} disabled />
        </div>
      )}

      <div className={styles.campo}>
        <span className={styles.label}>Objetivo de desenvolvimento sugerido</span>
        <textarea
          className={styles.textarea}
          rows={3}
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          disabled={!podeEditarGestaoDesempenho}
        />
      </div>

      <div className={styles.campo}>
        <span className={styles.label}>Ações sugeridas</span>
        <div className={styles.listaAfirmacoes}>
          {acoes.map((acao, indice) => (
            <div key={indice} className={styles.afirmacaoItem}>
              <input
                className={styles.input}
                value={acao}
                onChange={(e) => atualizarAcao(indice, e.target.value)}
                disabled={!podeEditarGestaoDesempenho}
                placeholder={`Ação sugerida ${indice + 1}`}
              />
              {podeEditarGestaoDesempenho && (
                <div className={styles.afirmacaoAcoes}>
                  <button type="button" className={styles.iconBtnPequeno} onClick={() => removerAcao(indice)} title="Remover ação">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {podeEditarGestaoDesempenho && (
          <Button variant="secondary" icon={<Plus size={13} />} onClick={adicionarAcao}>
            Adicionar ação sugerida
          </Button>
        )}
      </div>

      {podeEditarGestaoDesempenho && (
        <div className={styles.edicaoAcoes}>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSalvar} disabled={salvando || !chaveValida}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
