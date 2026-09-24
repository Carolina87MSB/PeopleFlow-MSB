import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { faltantesParaReposicao, gravar, opcoesListaMestra, type Formato, type Modalidade, type TipoTreinamento, type Treinamento } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Carregando, Erro } from "./componentes";
import { useConsulta } from "./hooks";
import { FORMATO, MODALIDADE, TIPO_TREINAMENTO, TIPOS_COM_DOCUMENTO } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

/** novo: abrir solicitação · editar: alterar/retificar · reposicao: agendar para os faltantes de `item`. */
type Modo = "novo" | "editar" | "reposicao";

function paraForm(t: Treinamento | null, modo: Modo) {
  const reposicao = modo === "reposicao";
  return {
    titulo: t?.titulo ?? "",
    tipo: (t?.tipo ?? "") as TipoTreinamento | "",
    modalidade: (t?.modalidade ?? "") as Modalidade | "",
    formato: (t?.formato ?? "") as Formato | "",
    lista_mestra_codigo: t?.lista_mestra_codigo ?? "",
    // Reposição: a nova data é sempre definida por quem agenda.
    data_inicio: reposicao ? "" : (t?.data_inicio ?? ""),
    data_fim: reposicao ? "" : (t?.data_fim ?? ""),
    carga_h: t?.carga_horaria_min ? String(t.carga_horaria_min / 60) : "",
    responsavel_colaborador_id: t?.responsavel_colaborador_id ? String(t.responsavel_colaborador_id) : "",
    instrutor_colaborador_id: t?.instrutor_colaborador_id ? String(t.instrutor_colaborador_id) : "",
    instrutor_externo: t?.instrutor_externo ?? "",
    local_link: t?.local_link ?? "",
    justificativa: reposicao ? `Reposição para faltantes de ${t?.codigo ?? ""}` : (t?.justificativa ?? ""),
    observacao: reposicao ? "" : (t?.observacao ?? ""),
    exige_eficacia: t?.exige_eficacia ?? false,
    eficacia_prazo: reposicao ? "" : (t?.eficacia_prazo ?? ""),
    motivo: "",
  };
}

/** Solicitar, editar ou agendar reposição. Toda regra é conferida de novo no servidor. */
export function TreinamentoDrawer({ item, modo = item ? "editar" : "novo", onFechar, onSalvo }: { item: Treinamento | null; modo?: Modo; onFechar: () => void; onSalvo: (t: Treinamento) => void }) {
  const { perfil, pessoas, pessoaPorId } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  const [form, setForm] = useState(() => paraForm(item, modo));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const documentos = useConsulta(() => opcoesListaMestra(), []);
  const faltantes = useConsulta(() => (modo === "reposicao" && item ? faltantesParaReposicao(item.id) : Promise.resolve([])), [modo, item?.id]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const exigeDoc = TIPOS_COM_DOCUMENTO.includes(form.tipo as TipoTreinamento);
  const docTravado = modo === "editar" && item?.status === "concluido";
  const doc = (documentos.dados ?? []).find((d) => d.codigo === form.lista_mestra_codigo);
  // Responsável/instrutor: pessoas do escopo + quem já está no treinamento de origem.
  const opcoesPessoa = [...pessoas];
  for (const id of [item?.responsavel_colaborador_id, item?.instrutor_colaborador_id]) {
    if (id && !pessoaPorId.has(id)) opcoesPessoa.push({ id, nome: `Colaborador #${id}`, cargo: "", departamento: "" });
  }

  async function salvar(planejar: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const carga = form.carga_h.trim() ? Math.round(Number(form.carga_h.replace(",", ".")) * 60) : null;
      if (carga !== null && !(carga > 0)) throw new Error("Carga horária inválida.");
      if (modo === "reposicao" && !form.data_inicio) throw new Error("Defina a nova data da reposição.");
      const corpo = {
        ...form,
        carga_horaria_min: carga,
        responsavel_colaborador_id: form.responsavel_colaborador_id || null,
        instrutor_colaborador_id: form.instrutor_colaborador_id || null,
        lista_mestra_codigo: form.lista_mestra_codigo || null,
        formato: form.formato || null,
        planejar,
      };
      const salvo =
        modo === "reposicao"
          ? await gravar<Treinamento>("treinamento_reposicao", { ...corpo, treinamento_id: item!.id })
          : await gravar<Treinamento>("treinamento_salvar", { ...corpo, id: modo === "editar" ? item!.id : null });
      flash(modo === "reposicao" ? "Reposição agendada." : modo === "editar" ? "Treinamento atualizado." : planejar ? "Treinamento planejado." : "Solicitação registrada.");
      onSalvo(salvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const titulo = modo === "reposicao" ? "Agendar treinamento para faltantes" : modo === "editar" ? `Editar ${item?.codigo}` : "Solicitar treinamento";
  const sub =
    modo === "reposicao"
      ? `Reposição de ${item?.codigo} — somente os faltantes; o treinamento original não é alterado`
      : modo === "novo"
        ? ehRH
          ? "Salve como solicitação ou já planejado"
          : "A solicitação é analisada e planejada pelo RH"
        : undefined;

  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Treinamentos" titulo={titulo} sub={sub} />}>
      <form
        className={styles.secao}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(false);
        }}
      >
        {modo === "reposicao" && (
          <div className={styles.secao}>
            <h4 className={styles.secaoTitulo}>Participantes da reposição (faltantes)</h4>
            {faltantes.erro ? (
              <Erro mensagem={faltantes.erro} />
            ) : faltantes.carregando ? (
              <Carregando />
            ) : (faltantes.dados ?? []).length === 0 ? (
              <Erro mensagem="Não há faltantes pendentes de reposição." />
            ) : (
              <ul className={styles.historico}>
                {(faltantes.dados ?? []).map((f) => (
                  <li key={f.colaborador_id}>
                    <strong>{f.nome}</strong> <span className={styles.dica}>{[f.cargo, f.departamento].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className={styles.grid}>
          <label className={styles.campo}>
            Tipo de treinamento *
            <select value={form.tipo} onChange={set("tipo")} required disabled={docTravado}>
              <option value="">Selecione</option>
              {(Object.keys(TIPO_TREINAMENTO) as TipoTreinamento[]).map((o) => (
                <option key={o} value={o}>
                  {TIPO_TREINAMENTO[o]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Modalidade *
            <select value={form.modalidade} onChange={set("modalidade")} required>
              <option value="">Selecione</option>
              {(Object.keys(MODALIDADE) as Modalidade[]).map((m) => (
                <option key={m} value={m}>
                  {MODALIDADE[m]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Formato
            <select value={form.formato} onChange={set("formato")}>
              <option value="">—</option>
              {(Object.keys(FORMATO) as Formato[]).map((f) => (
                <option key={f} value={f}>
                  {FORMATO[f]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Documento da Lista Mestra{exigeDoc ? " *" : ""}
            <input
              list="dev-docs-lm"
              value={form.lista_mestra_codigo}
              onChange={(e) => setForm((f) => ({ ...f, lista_mestra_codigo: e.target.value.trim().toUpperCase() }))}
              placeholder={documentos.carregando ? "Carregando..." : "Código do documento"}
              disabled={docTravado}
            />
            <datalist id="dev-docs-lm">
              {(documentos.dados ?? []).map((d) => (
                <option key={d.codigo} value={d.codigo}>
                  {d.titulo}
                </option>
              ))}
            </datalist>
            {form.lista_mestra_codigo && (
              <span className={styles.dica}>
                {item?.lista_mestra_codigo === form.lista_mestra_codigo
                  ? `Rev. ${item.lista_mestra_revisao} — ${item.lista_mestra_titulo ?? ""}`
                  : doc
                    ? doc.titulo
                    : documentos.dados
                      ? "Código não encontrado entre os documentos vigentes."
                      : ""}
              </span>
            )}
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Título{exigeDoc ? " (vazio = título do documento)" : " *"}
            <input value={form.titulo} onChange={set("titulo")} maxLength={300} required={!exigeDoc} />
          </label>
          <label className={styles.campo}>
            {modo === "reposicao" ? "Nova data *" : "Data prevista"}
            <input type="date" value={form.data_inicio} onChange={set("data_inicio")} required={modo === "reposicao"} />
          </label>
          <label className={styles.campo}>
            Data final
            <input type="date" value={form.data_fim} onChange={set("data_fim")} />
          </label>
          <label className={styles.campo}>
            Carga horária (horas)
            <input inputMode="decimal" value={form.carga_h} onChange={set("carga_h")} placeholder="Ex.: 1,5" />
          </label>
          <label className={styles.campo}>
            Responsável
            <select value={form.responsavel_colaborador_id} onChange={set("responsavel_colaborador_id")}>
              <option value="">{ehRH ? "Selecione" : "Definido pelo RH"}</option>
              {opcoesPessoa.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Instrutor interno
            <select value={form.instrutor_colaborador_id} onChange={set("instrutor_colaborador_id")}>
              <option value="">—</option>
              {opcoesPessoa.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Instrutor / instituição externa
            <input value={form.instrutor_externo} onChange={set("instrutor_externo")} maxLength={200} />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Local ou link
            <input value={form.local_link} onChange={set("local_link")} maxLength={500} />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa
            <textarea value={form.justificativa} onChange={set("justificativa")} maxLength={2000} placeholder="Por que este treinamento é necessário?" />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Observação
            <textarea value={form.observacao} onChange={set("observacao")} maxLength={2000} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={form.exige_eficacia} onChange={set("exige_eficacia")} /> Exige avaliação de eficácia
          </label>
          {form.exige_eficacia && (
            <label className={styles.campo}>
              Prazo da eficácia
              <input type="date" value={form.eficacia_prazo} onChange={set("eficacia_prazo")} />
            </label>
          )}
          {modo === "editar" && item?.status === "concluido" && (
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Justificativa da retificação *
              <textarea value={form.motivo} onChange={set("motivo")} maxLength={1000} required />
            </label>
          )}
        </div>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant={modo === "editar" || !ehRH ? "primary" : "secondary"} disabled={salvando || (modo === "reposicao" && (faltantes.dados ?? []).length === 0)}>
            {salvando ? "Salvando..." : modo === "editar" ? "Salvar" : modo === "reposicao" ? "Agendar como solicitação" : "Registrar solicitação"}
          </Button>
          {modo !== "editar" && ehRH && (
            <Button type="button" variant="primary" disabled={salvando || (modo === "reposicao" && (faltantes.dados ?? []).length === 0)} onClick={() => void salvar(true)}>
              Salvar como planejado
            </Button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
