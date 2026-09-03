import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { blankForm } from "../../domain/formMovimentacao";
import { contarPorGestor } from "../../domain/agregados";
import { ehGestorDoDepartamento, gestorDoDepartamento } from "../../domain/hierarquia";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import { useToast } from "./ToastContext";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { NovaMovimentacaoForm, TipoCod } from "../../types/domain";
import styles from "./NovaMovimentacaoModal.module.css";

const TIPOS_SEM_CADASTRO_PREVIO: TipoCod[] = ["ADM"];

export function NovaMovimentacaoModal({ onClose }: { onClose: () => void }) {
  const { state } = usePortalStore();
  const { conta, colaboradores, criarMovimentacao } = usePortalData();
  const { flash } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<NovaMovimentacaoForm>(blankForm());
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Lista completa (não restrita à árvore hierárquica do gestor solicitante) —
  // uma movimentação pode ser aberta para qualquer colaborador ativo da empresa,
  // não só para quem está sob a gestão direta/indireta de quem está solicitando.
  const colaboradoresParaSelecao = useMemo(
    () => colaboradores.filter((c) => !c.desligado).sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradores],
  );

  // Inclui também o depto de cargos custom (0 ocupantes) — sem isso, um
  // departamento que só existe por causa de um cargo novo (ex.: criado direto
  // no banco, ainda sem ninguém alocado) nunca aparece pra escolher como
  // destino de uma movimentação.
  const departamentos = useMemo(
    () => [...new Set([...colaboradores.map((c) => c.depto), ...state.cargosCustom.map((c) => c.depto)])].sort(),
    [colaboradores, state.cargosCustom],
  );
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
  const colaboradorSelecionado = colaboradoresParaSelecao.find((c) => c.nome === form.colab);

  // "Gestor de destino" é sempre derivado do departamento escolhido (não de
  // quem está logado) — mesma função usada na validação de verdade em
  // validarForm()/construirMovimentacao() (domain/formMovimentacao.ts). Aqui
  // só serve para preencher o campo somente-leitura e avisar quem preenche
  // se não é a pessoa certa para enviar esta movimentação.
  const proGestorDestino = form.proNovoDepto ? gestorDoDepartamento(colaboradores, form.proNovoDepto, state.cargosCustom) : null;
  const trfGestorDestino = form.trfNovoDepto ? gestorDoDepartamento(colaboradores, form.trfNovoDepto, state.cargosCustom) : null;

  // O aviso/trava real considera QUALQUER gestor que já lidera alguém no
  // departamento (ehGestorDoDepartamento) — não só o nome exibido acima
  // (gestorDoDepartamento só mostra o gestor com mais gente, mas um
  // departamento pode ter mais de uma liderança legítima, ex.:
  // "Administrativo" dividido entre Daniel e Cintia).
  function avisoGestorErrado(): string | null {
    if (tipo === "PRO" && form.proMudaDepto === "Sim" && form.proNovoDepto && !ehGestorDoDepartamento(colaboradores, form.proNovoDepto, conta.nome, state.cargosCustom)) {
      return proGestorDestino
        ? `Somente um gestor que já lidera colaboradores de ${form.proNovoDepto} pode enviar esta movimentação (ex.: ${proGestorDestino}).`
        : "Não foi possível identificar o gestor do departamento de destino selecionado.";
    }
    if (tipo === "PRO" && form.proMudaDepto === "Não" && colaboradorSelecionado && colaboradorSelecionado.gestor !== conta.nome) {
      return `Somente ${colaboradorSelecionado.gestor}, gestor(a) atual de ${colaboradorSelecionado.nome}, pode enviar esta promoção.`;
    }
    if (tipo === "TRF" && form.trfNovoDepto && !ehGestorDoDepartamento(colaboradores, form.trfNovoDepto, conta.nome, state.cargosCustom)) {
      return trfGestorDestino
        ? `Somente um gestor que já lidera colaboradores de ${form.trfNovoDepto} pode enviar esta movimentação (ex.: ${trfGestorDestino}).`
        : "Não foi possível identificar o gestor do departamento de destino selecionado.";
    }
    return null;
  }
  const avisoGestor = avisoGestorErrado();

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
              {colaboradoresParaSelecao.map((c) => (
                <option key={c.nome} value={c.nome}>
                  {c.nome} — {c.cargo}
                </option>
              ))}
            </select>
          </label>
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
              <select value={form.proNovoCargo} onChange={(e) => set("proNovoCargo", e.target.value)}>
                <option value="">Selecione…</option>
                {cargosExistentes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Salário atual</span>
              <input value={form.proSalarioAtual} onChange={(e) => set("proSalarioAtual", e.target.value)} placeholder="R$ 0,00" />
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
                <input value={form.proNovoSalario} onChange={(e) => set("proNovoSalario", e.target.value)} placeholder="R$ 0,00" />
              </label>
            )}
            <label className={styles.field}>
              <span>O colaborador mudará de departamento?</span>
              <select value={form.proMudaDepto} onChange={(e) => set("proMudaDepto", e.target.value as "Sim" | "Não")}>
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
            {form.proMudaDepto === "Sim" && (
              <>
                <label className={styles.field}>
                  <span>Departamento de origem</span>
                  <input value={colaboradorSelecionado?.depto ?? "—"} disabled />
                </label>
                <label className={styles.field}>
                  <span>Departamento de destino</span>
                  <select value={form.proNovoDepto} onChange={(e) => set("proNovoDepto", e.target.value)}>
                    <option value="">Selecione…</option>
                    {departamentos.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Gestor de destino</span>
                  <input value={proGestorDestino ?? "—"} disabled />
                </label>
              </>
            )}
            <label className={styles.field}>
              <span>Data prevista da movimentação</span>
              <input type="date" value={form.proData} onChange={(e) => set("proData", e.target.value)} />
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
            <label className={styles.field}>
              <span>Gestor de destino</span>
              <input value={trfGestorDestino ?? "—"} disabled />
            </label>
            <label className={styles.field}>
              <span>Data prevista</span>
              <input type="date" value={form.trfData} onChange={(e) => set("trfData", e.target.value)} />
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

      {avisoGestor && <div className={styles.info}>{avisoGestor}</div>}

      {/* Sugestão de cargos já cadastrados para "Cargo solicitado" (Admissão) — campo
       * continua sendo texto livre, já que uma admissão pode pedir um cargo inédito. */}
      <datalist id="cargos-existentes">
        {cargosExistentes.map((cargo) => (
          <option key={cargo} value={cargo} />
        ))}
      </datalist>

      {erro && <div className={styles.error}>{erro}</div>}
    </Modal>
  );
}
