import { useState } from "react";
import { Button, Drawer } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import { ehTextoADefinir, justificativaPadraoPdi } from "../../domain/pdiTriagem";
import type { CategoriaNecessidade } from "./devRepository";
import { CabecalhoDrawer, Erro } from "./componentes";
import { CATEGORIA_NECESSIDADE } from "./rotulos";
import { triagemPdi } from "./pdiTriagemRepository";
import type { ItemCard, SugestaoCard } from "./pdiTriagemItens";
import styles from "./Desenvolvimento.module.css";

interface Base {
  card: ItemCard;
  sugestao: SugestaoCard;
  onFechar: () => void;
  /** Gravou com sucesso: a tela recarrega as leituras. */
  onConcluido: () => void;
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

function AcoesDeOrigem({ sugestao }: { sugestao: SugestaoCard }) {
  return (
    <ul className={styles.itemPdiAcoes}>
      {sugestao.acoes.map((a) => (
        <li key={a.id}>{a.texto}</li>
      ))}
    </ul>
  );
}

function CabecalhoItem({ card, titulo }: { card: ItemCard; titulo: string }) {
  return <CabecalhoDrawer eyebrow="Triagem do PDI" titulo={titulo} sub={`${card.colaboradorNome} · ${card.competencia}`} />;
}

/** "Confirmar necessidade" (texto como sugerido) e "Editar e confirmar" (texto livre, até 500 caracteres). */
export function ConfirmarDrawer({ card, sugestao, editar: editarPedido, onFechar, onConcluido, onManter }: Base & { editar: boolean; onManter: () => void }) {
  const { flash } = useToast();
  const solta = sugestao.necessidadeSolta;
  // "A definir": não há texto sugerido válido, o RH descreve a necessidade. Necessidade já criada: só conclui o vínculo.
  const aDefinir = sugestao.aDefinir && !solta;
  const editar = (editarPedido || aDefinir) && !solta;
  const [form, setForm] = useState({
    texto: solta ? solta.descricao : aDefinir ? "" : sugestao.textoSugerido,
    // Só o tipo do item pode pré-selecionar (comportamental); o resto o RH escolhe.
    categoria: solta?.categoria ?? sugestao.categoriaSugerida ?? "",
    prioridade: solta?.prioridade ?? "media",
    justificativa: justificativaPadraoPdi(card.ciclo, card.tipo, card.competencia, card.objetivo),
    sugestao_capacitacao: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const textoValido = form.texto.trim().length > 0 && !ehTextoADefinir(form.texto);

  return (
    <Drawer onClose={onFechar} header={<CabecalhoItem card={card} titulo={solta ? "Concluir confirmação" : editar ? "Editar e confirmar necessidade" : "Confirmar necessidade"} />}>
      <form
        className={styles.secao}
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          try {
            const r = await triagemPdi.confirmar(sugestao.id, { ...form, texto: form.texto.trim() });
            flash(
              r.auditoria === "pendente"
                ? "Decisão gravada, mas o registro de auditoria não pôde ser salvo. Avise o suporte; não é preciso repetir a decisão."
                : r.recuperada
                  ? "Confirmação concluída com a necessidade que já estava criada na Base (nenhuma nova foi criada)."
                  : r.repetida
                    ? "Esta sugestão já tinha sido confirmada."
                    : "Necessidade incluída na Base de Necessidades de Desenvolvimento (origem PDI).",
            );
            onConcluido();
          } catch (err) {
            setErro(mensagem(err));
          } finally {
            setSalvando(false);
          }
        }}
      >
        <h4 className={styles.secaoTitulo}>Necessidade de Desenvolvimento</h4>
        {solta && <div className={styles.nota}>A necessidade nº {solta.id} já foi criada na Base, mas a confirmação não foi concluída. Ao concluir, ela é vinculada a esta sugestão e nenhuma nova necessidade é criada.</div>}
        {aDefinir && (
          <>
            <div className={styles.nota}>Revise o objetivo e as ações do PDI e descreva a necessidade de desenvolvimento.</div>
            {card.objetivo && (
              <div>
                <span className={styles.blocoNecessidadeRotulo}>Objetivo do item no PDI</span>
                <p className={styles.itemPdiObjetivo}>{card.objetivo}</p>
              </div>
            )}
          </>
        )}
        <label className={[styles.campo, styles.cheio].join(" ")}>
          Texto da necessidade {editar ? "*" : ""}
          <textarea value={form.texto} onChange={set("texto")} maxLength={500} readOnly={!editar} required rows={3} placeholder={aDefinir ? "Descreva a necessidade de desenvolvimento deste item" : undefined} autoFocus={aDefinir} />
        </label>
        <div>
          <span className={styles.blocoNecessidadeRotulo}>{sugestao.acoes.length === 1 ? "Ação de origem no PDI" : `${sugestao.acoes.length} ações de origem no PDI`}</span>
          <AcoesDeOrigem sugestao={sugestao} />
        </div>
        <div className={styles.grid}>
          <label className={styles.campo}>
            Categoria *
            <select value={form.categoria} onChange={set("categoria")} required disabled={Boolean(solta)}>
              <option value="">Selecione</option>
              {(Object.keys(CATEGORIA_NECESSIDADE) as CategoriaNecessidade[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_NECESSIDADE[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            Prioridade inicial
            <select value={form.prioridade} onChange={set("prioridade")} disabled={Boolean(solta)}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Justificativa
            <textarea value={form.justificativa} onChange={set("justificativa")} maxLength={2000} />
          </label>
          <label className={[styles.campo, styles.cheio].join(" ")}>
            Sugestão de ação de desenvolvimento (opcional)
            <input value={form.sugestao_capacitacao} onChange={set("sugestao_capacitacao")} maxLength={500} />
          </label>
        </div>
        <span className={styles.dica}>
          Confirmar significa que este item do PDI representa uma Necessidade de Desenvolvimento. A forma de atendimento (treinamento, mentoria, prática no trabalho…) será definida depois. A necessidade guarda a referência às ações do PDI de origem e o PDI não é alterado.
        </span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button type="submit" variant="primary" className={styles.botaoLongo} disabled={salvando || !textoValido}>
            {salvando ? "Salvando..." : solta ? "Concluir confirmação" : "Confirmar Necessidade de Desenvolvimento"}
          </Button>
        </div>
      </form>
      {!solta && (
        <div className={styles.secao}>
          <h4 className={styles.secaoTitulo}>Este item não representa uma necessidade?</h4>
          <div className={styles.acoes} style={{ justifyContent: "flex-start" }}>
            <Button variant="secondary" onClick={onManter} disabled={salvando}>
              Manter somente no PDI
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function ManterDrawer({ card, sugestao, onFechar, onConcluido }: Base) {
  const { flash } = useToast();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer onClose={onFechar} header={<CabecalhoItem card={card} titulo="Manter somente no PDI?" />}>
      <div className={styles.secao}>
        <div className={styles.nota}>
          {sugestao.acoes.length === 1 ? "Esta ação continuará" : `Estas ${sugestao.acoes.length} ações continuarão`} normalmente no PDI, mas {sugestao.acoes.length === 1 ? "não será incluída" : "não serão incluídas"} na Base de Necessidades de Desenvolvimento.
        </div>
        <AcoesDeOrigem sugestao={sugestao} />
        <label className={styles.campo}>
          Observação (opcional)
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
        </label>
        <span className={styles.dica}>Não exclui, cancela nem altera nada no PDI. Nenhuma Necessidade de Desenvolvimento ou treinamento é criado.</span>
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={salvando}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              try {
                const r = await triagemPdi.manter(sugestao.id, observacao.trim());
                flash(r.auditoria === "pendente" ? "Decisão gravada, mas o registro de auditoria não pôde ser salvo. Avise o suporte; não é preciso repetir a decisão." : "Mantido somente no PDI.");
                onConcluido();
              } catch (err) {
                setErro(mensagem(err));
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando..." : "Manter somente no PDI"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/** "Separar ações": distribui TODAS as ações da sugestão em 2 ou mais grupos; cada grupo vira uma nova sugestão a decidir. */
export function SepararDrawer({ card, sugestao, onFechar, onConcluido }: Base) {
  const { flash } = useToast();
  const total = sugestao.acoes.length;
  const [qtd, setQtd] = useState(2);
  // grupo (1..qtd) de cada ação; começa alternando para já ter ao menos duas ações separadas
  const [grupoDe, setGrupoDe] = useState<Record<string, number>>(() => Object.fromEntries(sugestao.acoes.map((a, i) => [a.id, (i % 2) + 1])));
  const [textos, setTextos] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const grupos = Array.from({ length: qtd }, (_, i) => i + 1);
  const efetivo = (id: string) => Math.min(grupoDe[id] ?? 1, qtd);
  const vazios = grupos.filter((g) => !sugestao.acoes.some((a) => efetivo(a.id) === g));

  return (
    <Drawer onClose={onFechar} header={<CabecalhoItem card={card} titulo="Separar ações" />}>
      <div className={styles.secao}>
        <div className={styles.nota}>
          Use quando este item do PDI sustenta mais de uma necessidade. Distribua as {total} ações em grupos: cada grupo vira uma nova sugestão para você decidir (confirmar, editar ou manter somente no PDI). O PDI não é alterado.
        </div>
        <label className={styles.campo}>
          Quantidade de necessidades
          <select value={qtd} onChange={(e) => setQtd(Number(e.target.value))}>
            {Array.from({ length: Math.max(1, total - 1) }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.separarGrupos}>
          {sugestao.acoes.map((a) => (
            <div key={a.id} className={styles.separarAcao}>
              <span>{a.texto}</span>
              <select aria-label={`Necessidade da ação: ${a.texto}`} value={efetivo(a.id)} onChange={(e) => setGrupoDe((g) => ({ ...g, [a.id]: Number(e.target.value) }))}>
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    Necessidade {g}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {grupos.map((g) => (
          <label key={g} className={styles.campo}>
            Texto da necessidade {g} (opcional)
            <input value={textos[g] ?? ""} onChange={(e) => setTextos((t) => ({ ...t, [g]: e.target.value }))} maxLength={500} placeholder="Em branco: usa o objetivo do item (se específico) ou fica “a definir”" />
          </label>
        ))}
        {vazios.length > 0 && <Erro mensagem={`Cada necessidade precisa de pelo menos uma ação. Sem ações: ${vazios.map((g) => `Necessidade ${g}`).join(", ")}.`} />}
        {erro && <Erro mensagem={erro} />}
        <div className={styles.acoes}>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={salvando || vazios.length > 0}
            onClick={async () => {
              setErro(null);
              setSalvando(true);
              try {
                const r = await triagemPdi.separar(
                  sugestao.id,
                  grupos.map((g) => ({ acao_ids: sugestao.acoes.filter((a) => efetivo(a.id) === g).map((a) => a.id), ...((textos[g] ?? "").trim() ? { texto: (textos[g] ?? "").trim() } : {}) })),
                );
                flash(r.auditoria === "pendente" ? "Ações separadas, mas o registro de auditoria não pôde ser salvo. Avise o suporte." : `Ações separadas em ${qtd} sugestões.`);
                onConcluido();
              } catch (err) {
                setErro(mensagem(err));
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando..." : "Separar ações"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
