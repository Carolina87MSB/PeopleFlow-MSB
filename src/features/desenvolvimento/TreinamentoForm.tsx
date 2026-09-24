import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { gravar, opcoesListaMestra, type OrigemTreinamento, type Treinamento } from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { CabecalhoDrawer, Erro } from "./componentes";
import { useConsulta } from "./hooks";
import { ORIGEM_TREINAMENTO } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

const COM_DOCUMENTO: OrigemTreinamento[] = ["pop_it", "revisao_documental"];

function paraForm(t: Treinamento | null) {
  return {
    titulo: t?.titulo ?? "",
    origem_tipo: t?.origem_tipo ?? "desenvolvimento",
    lista_mestra_codigo: t?.lista_mestra_codigo ?? "",
    tipo: t?.tipo ?? "interno",
    modalidade: t?.modalidade ?? "",
    data_inicio: t?.data_inicio ?? "",
    data_fim: t?.data_fim ?? "",
    carga_h: t?.carga_horaria_min ? String(t.carga_horaria_min / 60) : "",
    responsavel_colaborador_id: t?.responsavel_colaborador_id ? String(t.responsavel_colaborador_id) : "",
    instrutor_colaborador_id: t?.instrutor_colaborador_id ? String(t.instrutor_colaborador_id) : "",
    instrutor_externo: t?.instrutor_externo ?? "",
    local_link: t?.local_link ?? "",
    justificativa: t?.justificativa ?? "",
    observacao: t?.observacao ?? "",
    exige_eficacia: t?.exige_eficacia ?? false,
    eficacia_prazo: t?.eficacia_prazo ?? "",
    motivo: "",
  };
}

/** Solicitar (novo) ou editar um treinamento. Toda regra é conferida de novo no servidor. */
export function TreinamentoDrawer({ item, onFechar, onSalvo }: { item: Treinamento | null; onFechar: () => void; onSalvo: (t: Treinamento) => void }) {
  const { perfil, pessoas } = useDesenvolvimento();
  const { flash } = useToast();
  const ehRH = perfil === "RH";
  const [form, setForm] = useState(() => paraForm(item));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const documentos = useConsulta(() => opcoesListaMestra(), []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const exigeDoc = COM_DOCUMENTO.includes(form.origem_tipo as OrigemTreinamento);
  const docTravado = item?.status === "concluido";
  const doc = (documentos.dados ?? []).find((d) => d.codigo === form.lista_mestra_codigo);

  async function salvar(planejar: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const carga = form.carga_h.trim() ? Math.round(Number(form.carga_h.replace(",", ".")) * 60) : null;
      if (carga !== null && !(carga > 0)) throw new Error("Carga horária inválida.");
      const salvo = await gravar<Treinamento>("treinamento_salvar", {
        ...form,
        id: item?.id ?? null,
        carga_horaria_min: carga,
        responsavel_colaborador_id: form.responsavel_colaborador_id || null,
        instrutor_colaborador_id: form.instrutor_colaborador_id || null,
        lista_mestra_codigo: form.lista_mestra_codigo || null,
        modalidade: form.modalidade || null,
        planejar,
      });
      flash(item ? "Treinamento atualizado." : planejar ? "Treinamento planejado." : "Solicitação registrada.");
      onSalvo(salvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer
      onClose={onFechar}
      header={
        <CabecalhoDrawer
          eyebrow="Treinamentos"
          titulo={item ? `Editar ${item.codigo}` : "Solicitar treinamento"}
          sub={item ? undefined : ehRH ? "Salve como solicitação ou já planejado" : "A solicitação é analisada e planejada pelo RH"}
        />
      }
    >
      <form
        className={styles.secao}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(false);
        }}
      >
        <div className={styles.grid}>
          <label className={styles.campo}>
            Origem *
            <select value={form.origem_tipo} onChange={set("origem_tipo")} disabled={docTravado}>
              {(Object.keys(ORIGEM_TREINAMENTO) as OrigemTreinamento[]).map((o) => (
                <option key={o} value={o}>
                  {ORIGEM_TREINAMENTO[o]}
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
              placeholder={documentos.carregando ? "Carregando..." : "Código (ex.: P-PR-001)"}
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
                  ? `Treinado na rev. ${item.lista_mestra_revisao} — ${item.lista_mestra_titulo ?? ""}`
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
            Tipo
            <select value={form.tipo} onChange={set("tipo")}>
              <option value="interno">Interno</option>
              <option value="externo">Externo</option>
            </select>
          </label>
          <label className={styles.campo}>
            Formato
            <select value={form.modalidade} onChange={set("modalidade")}>
              <option value="">—</option>
              <option value="presencial">Presencial</option>
              <option value="ead">EAD / online</option>
              <option value="hibrido">Híbrido</option>
            </select>
          </label>
          <label className={styles.campo}>
            Data prevista
            <input type="date" value={form.data_inicio} onChange={set("data_inicio")} />
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
              {pessoas.map((p) => (
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
              {pessoas.map((p) => (
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
          {item?.status === "concluido" && (
            <label className={[styles.campo, styles.cheio].join(" ")}>
              Justificativa da retificação *
              <textarea value={form.motivo} onChange={set("motivo")} maxLength={1000} required />
            </label>
          )}
        </div>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant={item || !ehRH ? "primary" : "secondary"} disabled={salvando}>
            {salvando ? "Salvando..." : item ? "Salvar" : "Registrar solicitação"}
          </Button>
          {!item && ehRH && (
            <Button type="button" variant="primary" disabled={salvando} onClick={() => void salvar(true)}>
              Salvar como planejado
            </Button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
