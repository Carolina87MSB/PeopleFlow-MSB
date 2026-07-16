import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { blankForm } from "../../domain/formMovimentacao";
import { contarPorGestor } from "../../domain/agregados";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { useToast } from "./ToastContext";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { NovaMovimentacaoForm, TipoCod } from "../../types/domain";
import styles from "./NovaMovimentacaoModal.module.css";

const TIPOS_SEM_CADASTRO_PREVIO: TipoCod[] = ["NOV", "ADM"];

export function NovaMovimentacaoModal({ onClose }: { onClose: () => void }) {
  const { state } = usePortalStore();
  const { colaboradoresVisiveis, colaboradores, criarMovimentacao } = usePortalData();
  const { flash } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<NovaMovimentacaoForm>(blankForm());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const departamentos = useMemo(() => [...new Set(colaboradores.map((c) => c.depto))].sort(), [colaboradores]);
  const gestores = useMemo(() => [...contarPorGestor(colaboradores).keys()].sort(), [colaboradores]);
  const cargosExistentes = useMemo(
    () => [...new Set([...colaboradores.map((c) => c.cargo), ...state.cargosCustom.map((c) => c.nome)])].filter(Boolean).sort(),
    [colaboradores, state.cargosCustom],
  );

  function set<K extends keyof NovaMovimentacaoForm>(key: K, value: NovaMovimentacaoForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setEnviando(true);
    const result = await criarMovimentacao(form);
    setEnviando(false);
    if (!result.ok) {
      setErro(result.error ?? "Preencha todos os campos obrigatórios antes de enviar.");
      return;
    }
    flash(`Movimentação ${result.movimentacao.id} enviada para aprovação.`);
    onClose();
    navigate("/workflow");
  }

  const tipo = form.tipo;
  const colaboradorSelecionado = colaboradoresVisiveis.find((c) => c.nome === form.colab);

  return (
    <Modal
      title="Nova movimentação"
      subtitle="Registre uma solicitação para entrar no fluxo de aprovação."
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={handleSubmit} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar para aprovação"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Tipo de movimentação</span>
          <select value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoCod | "")}>
            <option value="">Selecione…</option>
            {state.tipos.map((t) => (
              <option key={t.cod} value={t.cod}>
                {t.cod} · {t.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Prioridade</span>
          <select value={form.prioridade} onChange={(e) => set("prioridade", e.target.value as NovaMovimentacaoForm["prioridade"])}>
            <option value="Alta">Alta</option>
            <option value="Média">Média</option>
            <option value="Baixa">Baixa</option>
          </select>
        </label>

        {tipo && !TIPOS_SEM_CADASTRO_PREVIO.includes(tipo) && (
          <label className={[styles.field, styles.full].join(" ")}>
            <span>Colaborador</span>
            <select value={form.colab} onChange={(e) => set("colab", e.target.value)}>
              <option value="">Selecione…</option>
              {colaboradoresVisiveis.map((c) => (
                <option key={c.nome} value={c.nome}>
                  {c.nome} — {c.cargo}
                </option>
              ))}
            </select>
          </label>
        )}

        {tipo === "NOV" && (
          <>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Nome do cargo</span>
              <input
                value={form.cargoNome}
                onChange={(e) => set("cargoNome", e.target.value)}
                placeholder="Ex.: Analista de Dados Industriais"
                list="cargos-existentes"
              />
            </label>
            <label className={styles.field}>
              <span>Departamento</span>
              <select value={form.cargoDepto} onChange={(e) => set("cargoDepto", e.target.value)}>
                <option value="">Selecione…</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Gestor responsável</span>
              <select value={form.cargoGestor} onChange={(e) => set("cargoGestor", e.target.value)}>
                <option value="">Selecione…</option>
                {gestores.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Quantidade de vagas</span>
              <input value={form.cargoVagas} onChange={(e) => set("cargoVagas", e.target.value)} placeholder="1" />
            </label>
            <label className={styles.field}>
              <span>Faixa salarial</span>
              <input value={form.cargoFaixa} onChange={(e) => set("cargoFaixa", e.target.value)} placeholder="R$ 6.500 – R$ 8.200" />
            </label>
            <label className={styles.field}>
              <span>Data prevista de implantação</span>
              <input value={form.cargoData} onChange={(e) => set("cargoData", e.target.value)} placeholder="dd/mmm/aaaa" />
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Observações</span>
              <input value={form.cargoObs} onChange={(e) => set("cargoObs", e.target.value)} />
            </label>
          </>
        )}

        {tipo === "ADM" && (
          <>
            <label className={styles.field}>
              <span>Cargo solicitado</span>
              <input value={form.admCargo} onChange={(e) => set("admCargo", e.target.value)} list="cargos-existentes" />
            </label>
            <label className={styles.field}>
              <span>Departamento</span>
              <select value={form.admDepto} onChange={(e) => set("admDepto", e.target.value)}>
                <option value="">Selecione…</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Gestor responsável</span>
              <select value={form.admGestor} onChange={(e) => set("admGestor", e.target.value)}>
                <option value="">Selecione…</option>
                {gestores.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Vínculo</span>
              <select value={form.admVinculo} onChange={(e) => set("admVinculo", e.target.value)}>
                <option value="">Selecione…</option>
                <option value="CLT">CLT</option>
                <option value="PJ">PJ</option>
                <option value="Estágio">Estágio</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Quantidade de vagas</span>
              <input value={form.admVagas} onChange={(e) => set("admVagas", e.target.value)} placeholder="1" />
            </label>
            <label className={styles.field}>
              <span>Motivo da contratação</span>
              <input value={form.admMotivo} onChange={(e) => set("admMotivo", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Candidato (se houver)</span>
              <input value={form.admCandidato} onChange={(e) => set("admCandidato", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Data prevista de admissão</span>
              <input type="date" value={form.admData} onChange={(e) => set("admData", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Faixa salarial</span>
              <input value={form.admFaixa} onChange={(e) => set("admFaixa", e.target.value)} />
            </label>
          </>
        )}

        {tipo === "PRO" && (
          <>
            <label className={styles.field}>
              <span>Cargo atual</span>
              <input value={colaboradorSelecionado?.cargo ?? "—"} disabled />
            </label>
            <label className={styles.field}>
              <span>Novo cargo</span>
              <input value={form.proNovoCargo} onChange={(e) => set("proNovoCargo", e.target.value)} list="cargos-existentes" />
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Justificativa de progressão</span>
              <input value={form.proJustProg} onChange={(e) => set("proJustProg", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Alteração salarial</span>
              <select value={form.proAltSal} onChange={(e) => set("proAltSal", e.target.value as "Sim" | "Não")}>
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
            {form.proAltSal === "Sim" && (
              <label className={styles.field}>
                <span>Novo salário</span>
                <input value={form.proNovoSalario} onChange={(e) => set("proNovoSalario", e.target.value)} />
              </label>
            )}
            <label className={styles.field}>
              <span>Data prevista</span>
              <input value={form.proData} onChange={(e) => set("proData", e.target.value)} placeholder="dd/mmm/aaaa" />
            </label>
          </>
        )}

        {tipo === "SAL" && (
          <>
            <label className={styles.field}>
              <span>Salário atual</span>
              <input value={form.salAtual} onChange={(e) => set("salAtual", e.target.value)} placeholder="R$ 4.800" />
            </label>
            <label className={styles.field}>
              <span>Novo salário</span>
              <input value={form.salNovo} onChange={(e) => set("salNovo", e.target.value)} placeholder="R$ 5.300" />
            </label>
          </>
        )}

        {tipo === "TRF" && (
          <>
            <label className={styles.field}>
              <span>Departamento atual</span>
              <input value={colaboradorSelecionado?.depto ?? "—"} disabled />
            </label>
            <label className={styles.field}>
              <span>Novo departamento</span>
              <select value={form.trfNovoDepto} onChange={(e) => set("trfNovoDepto", e.target.value)}>
                <option value="">Selecione…</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Novo cargo (se aplicável)</span>
              <input value={form.trfNovoCargo} onChange={(e) => set("trfNovoCargo", e.target.value)} list="cargos-existentes" />
            </label>
          </>
        )}

        {tipo === "FUN" && (
          <>
            <label className={styles.field}>
              <span>Função atual</span>
              <input value={colaboradorSelecionado?.cargo ?? "—"} disabled />
            </label>
            <label className={styles.field}>
              <span>Nova função</span>
              <input value={form.funNova} onChange={(e) => set("funNova", e.target.value)} />
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Motivo da alteração</span>
              <input value={form.funMotivo} onChange={(e) => set("funMotivo", e.target.value)} />
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Treinamentos obrigatórios</span>
              <input value={form.funTreinos} onChange={(e) => set("funTreinos", e.target.value)} />
            </label>
          </>
        )}

        {tipo === "DES" && (
          <>
            <label className={styles.field}>
              <span>Motivo do desligamento</span>
              <input value={form.desMotivo} onChange={(e) => set("desMotivo", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Data prevista</span>
              <input type="date" value={form.desData} onChange={(e) => set("desData", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Último dia trabalhado</span>
              <input type="date" value={form.desUltimoDia} onChange={(e) => set("desUltimoDia", e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Substituição</span>
              <select value={form.desSubst} onChange={(e) => set("desSubst", e.target.value as "Sim" | "Não")}>
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
            <label className={[styles.field, styles.full].join(" ")}>
              <span>Observações</span>
              <input value={form.desObs} onChange={(e) => set("desObs", e.target.value)} />
            </label>
          </>
        )}

        <label className={[styles.field, styles.full].join(" ")}>
          <span>Justificativa</span>
          <textarea rows={3} value={form.justificativa} onChange={(e) => set("justificativa", e.target.value)} />
        </label>
      </div>

      {/* Sugestões de cargos já cadastrados para os campos de nome de cargo acima — o campo
       * continua sendo texto livre (essencial para "Nome do cargo" no tipo Novo Cargo, que
       * precisa aceitar um nome que ainda não existe), só ganha autocomplete. */}
      <datalist id="cargos-existentes">
        {cargosExistentes.map((cargo) => (
          <option key={cargo} value={cargo} />
        ))}
      </datalist>

      {erro && <div className={styles.error}>{erro}</div>}
    </Modal>
  );
}
