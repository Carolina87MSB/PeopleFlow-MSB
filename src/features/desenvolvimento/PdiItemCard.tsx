import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "../../components/ui";
import { Selo } from "./componentes";
import { dataCurta, plural } from "./lntRotulos";
import { ROTULO_INDICIO } from "./pdiClassificacao";
import type { AcaoCard, ItemCard, SugestaoCard } from "./pdiTriagemItens";
import styles from "./Desenvolvimento.module.css";

export type SituacaoItem = "aguardando" | "confirmadas" | "mantidas";

export interface AcoesDoCard {
  onConfirmar: (s: SugestaoCard) => void;
  onEditar: (s: SugestaoCard) => void;
  onSeparar: (s: SugestaoCard) => void;
  onManter: (s: SugestaoCard) => void;
  onRegenerar: (s: SugestaoCard) => void;
  onGerar: (itemId: string) => void;
  onAnalisarIa: (itemId: string) => void;
}

interface Props extends AcoesDoCard {
  card: ItemCard;
  situacao: SituacaoItem;
  /** Há uma gravação em andamento: bloqueia novos cliques. */
  ocupado: boolean;
  /** O colaborador do PDI foi identificado de forma única (a Necessidade exige esse vínculo). */
  confirmavel: boolean;
  /** A análise com IA está disponível (chave, modelo e chave geral configurados no servidor). */
  iaDisponivel: boolean;
  /** Este item está sendo analisado pela IA agora. */
  analisando: boolean;
}

const ROTULO_CONFIANCA = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" } as const;

function ListaAcoes({ acoes }: { acoes: AcaoCard[] }) {
  return (
    <ul className={styles.itemPdiAcoes}>
      {acoes.map((a) => (
        <li key={a.id}>
          <span>{a.texto}</span>
          <span className={styles.selos}>
            {a.indicios.length === 0 ? <Selo tom="neutral">Outra ação</Selo> : a.indicios.map((i) => <Selo key={i} tom="info">{ROTULO_INDICIO[i]}</Selo>)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListaAcoesRecolhivel({ acoes, rotulo }: { acoes: AcaoCard[]; rotulo: string }) {
  const [aberta, setAberta] = useState(false);
  if (acoes.length === 0) return null;
  return (
    <>
      <button type="button" className={styles.itemPdiAcoesBotao} aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {aberta ? "Ocultar" : "Ver"} {rotulo}
      </button>
      {aberta && <ListaAcoes acoes={acoes} />}
    </>
  );
}

interface PropsSugestao extends AcoesDoCard {
  s: SugestaoCard;
  itemId: string;
  ocupado: boolean;
  confirmavel: boolean;
  iaDisponivel: boolean;
  analisando: boolean;
  /** A análise da IA a que esta sugestão pertence tem outras sugestões com necessidade (esta, neutra, cobre as ações sem necessidade). */
  analiseTemNecessidades: boolean;
}

function SugestaoPendente({ s, itemId, ocupado, confirmavel, iaDisponivel, analisando, analiseTemNecessidades, ...acoes }: PropsSugestao) {
  const solta = s.necessidadeSolta;
  // Necessidade já criada e sem vínculo: só falta concluir (o servidor adota a que existe), mesmo que o PDI tenha mudado depois.
  const bloqueada = ocupado || analisando || (s.desatualizada && !solta);
  const separavel = s.acoes.length >= 2;
  const neutraIa = s.neutraIa;
  const resultado = s.ia?.resultado ?? null;
  const semNecessidadeNaAnalise = neutraIa && !analiseTemNecessidades;
  const analisarIa = (
    <Button variant={s.aDefinir && !neutraIa ? "primary" : "secondary"} disabled={ocupado || analisando} onClick={() => acoes.onAnalisarIa(itemId)} title="A IA só sugere; a decisão continua sendo sua">
      {analisando ? "Analisando…" : "Analisar com IA"}
    </Button>
  );

  const rotulo = neutraIa ? (semNecessidadeNaAnalise ? (resultado === "somente_acao_pdi" ? "Somente ação do PDI" : "Evidência insuficiente") : "Ações sem necessidade distinta") : s.aDefinir ? "Necessidade a definir" : "Necessidade sugerida";

  return (
    <div className={styles.blocoNecessidade}>
      <span className={styles.blocoNecessidadeRotulo}>
        {rotulo} · {plural(s.acoes.length, "ação de origem", "ações de origem")}
      </span>
      {neutraIa ? (
        <>
          <p className={styles.itemPdiObjetivo}>
            {!semNecessidadeNaAnalise
              ? "Estas ações não sustentam uma necessidade distinta. Você pode mantê-las somente no PDI ou definir uma necessidade manualmente."
              : resultado === "somente_acao_pdi"
                ? "A análise não identificou uma necessidade distinta a registrar neste item. As ações valem como ação de PDI."
                : "Não há evidência suficiente para definir a necessidade de desenvolvimento."}
          </p>
          {semNecessidadeNaAnalise && s.ia?.observacao && <span className={styles.dica}>{s.ia.observacao}</span>}
        </>
      ) : s.aDefinir ? (
        <p className={styles.itemPdiObjetivo}>Revise o objetivo e as ações do PDI e descreva a necessidade de desenvolvimento.</p>
      ) : (
        <>
          <p className={styles.blocoNecessidadeTexto}>{s.textoSugerido}</p>
          {s.ia && s.confianca && (
            <>
              <span className={styles.selos}>
                <Selo tom={s.confianca === "alta" ? "success" : "neutral"}>{ROTULO_CONFIANCA[s.confianca]}</Selo>
                {s.confianca === "baixa" && <span className={styles.secundario}>Vale revisar com atenção antes de decidir.</span>}
              </span>
              {s.justificativa && <span className={styles.dica}>Por quê: {s.justificativa}</span>}
            </>
          )}
          <span className={styles.dica}>
            {s.ia ? "Sugerida pela IA; " : s.automatica ? "Sugerida automaticamente por uma regra simples (sem inteligência artificial); " : ""}revise e edite antes de confirmar. Competência/KPI e objetivo seguem exatamente como estão no PDI.
          </span>
        </>
      )}
      {solta && (
        <div className={styles.avisoDesatualizada} role="alert">
          A necessidade nº {solta.id} já foi criada na Base para este item, mas a confirmação não foi concluída. Conclua a confirmação para vinculá-la; até lá não é possível manter somente no PDI, separar ou atualizar.
        </div>
      )}
      {!solta && s.desatualizada && (
        <div className={styles.avisoDesatualizada} role="alert">
          O PDI deste item mudou depois que esta {s.ia ? "análise" : "sugestão"} foi gerada. {s.ia && iaDisponivel ? "Refaça a análise" : "Atualize a sugestão"} para decidir com o texto atual.
          <div>
            {s.ia && iaDisponivel ? (
              analisarIa
            ) : (
              <Button variant="secondary" disabled={ocupado || analisando} onClick={() => acoes.onRegenerar(s)}>
                Atualizar sugestão
              </Button>
            )}
          </div>
        </div>
      )}
      <ListaAcoesRecolhivel acoes={s.acoes} rotulo={plural(s.acoes.length, "ação", "ações")} />
      <div className={styles.botoesItem}>
        {solta ? (
          <Button variant="primary" disabled={ocupado} onClick={() => acoes.onConfirmar(s)}>
            Concluir confirmação
          </Button>
        ) : neutraIa ? (
          <>
            <Button variant={semNecessidadeNaAnalise && resultado === "somente_acao_pdi" ? "secondary" : "primary"} disabled={bloqueada || !confirmavel} title={confirmavel ? "Descreva a necessidade de desenvolvimento deste item" : "Colaborador não identificado de forma única"} onClick={() => acoes.onEditar(s)}>
              Definir necessidade manualmente
            </Button>
            {separavel && (
              <Button variant="secondary" disabled={bloqueada} title="Separe as ações em grupos" onClick={() => acoes.onSeparar(s)}>
                Separar ações
              </Button>
            )}
            <Button variant={semNecessidadeNaAnalise && resultado === "somente_acao_pdi" ? "primary" : "ghost"} disabled={bloqueada} title="O item continua no PDI, mas não entra na Base de Necessidades de Desenvolvimento" onClick={() => acoes.onManter(s)}>
              Manter somente no PDI
            </Button>
          </>
        ) : (
          <>
            {!s.aDefinir && (
              <Button variant="primary" disabled={bloqueada || !confirmavel} title={confirmavel ? "Confirmar que este item do PDI representa uma Necessidade de Desenvolvimento" : "Colaborador não identificado de forma única"} onClick={() => acoes.onConfirmar(s)}>
                Confirmar necessidade
              </Button>
            )}
            {s.automatica && iaDisponivel && analisarIa}
            <Button variant={s.aDefinir && !(s.automatica && iaDisponivel) ? "primary" : "secondary"} disabled={bloqueada || !confirmavel} title={s.aDefinir ? "Descreva a necessidade de desenvolvimento deste item" : undefined} onClick={() => acoes.onEditar(s)}>
              Editar e confirmar
            </Button>
            {separavel && (
              <Button variant="secondary" disabled={bloqueada} title="O item sustenta mais de uma necessidade: separe as ações em grupos" onClick={() => acoes.onSeparar(s)}>
                Separar ações
              </Button>
            )}
            <Button variant="ghost" disabled={bloqueada} title="O item continua no PDI, mas não entra na Base de Necessidades de Desenvolvimento" onClick={() => acoes.onManter(s)}>
              Manter somente no PDI
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PdiItemCard({ card, situacao, ocupado, confirmavel, iaDisponivel, analisando, ...acoes }: Props) {
  const { decididas } = card;
  const jaDecididas = decididas.confirmadas + decididas.mantidas;
  const naoIa = card.sugestoes.filter((s) => !s.ia);
  const grupos = new Map<number, SugestaoCard[]>();
  for (const s of card.sugestoes) if (s.ia) grupos.set(s.ia.interpretacaoId, [...(grupos.get(s.ia.interpretacaoId) ?? []), s]);
  const comuns = { itemId: card.itemId, ocupado, confirmavel, iaDisponivel, analisando };
  return (
    <li className={styles.itemPdi} data-testid="item-pdi">
      <div className={styles.itemPdiTopo}>
        <strong>{card.colaboradorNome}</strong>
        {card.departamento && <span>{card.departamento}</span>}
        {card.ciclo && <span>Ciclo {card.ciclo}</span>}
        {!confirmavel && situacao === "aguardando" && <span>Colaborador não identificado de forma única</span>}
      </div>
      <div className={styles.itemPdiCompetencia}>
        {card.competencia}
        <Selo tom="neutral">{card.tipo === "Tecnica" ? "KPI" : "Competência"}</Selo>
      </div>
      {card.objetivo && <p className={styles.itemPdiObjetivo}>{card.objetivo}</p>}

      {situacao === "aguardando" && (
        <>
          {naoIa.map((s) => (
            <SugestaoPendente key={s.id} s={s} analiseTemNecessidades={false} {...comuns} {...acoes} />
          ))}
          {[...grupos.entries()].map(([id, lista]) => {
            const temNecessidades = lista.some((s) => !s.neutraIa);
            const observacao = lista[0].ia?.observacao;
            return (
              <div key={id} className={styles.analiseIa} data-testid="analise-ia">
                <span className={styles.analiseIaTitulo}>
                  <Sparkles size={14} aria-hidden="true" /> Análise da IA
                </span>
                {temNecessidades && observacao && <span className={styles.dica}>{observacao}</span>}
                {lista.map((s) => (
                  <SugestaoPendente key={s.id} s={s} analiseTemNecessidades={temNecessidades} {...comuns} {...acoes} />
                ))}
              </div>
            );
          })}
          {card.acoesSemSugestao.length > 0 && (
            <div className={styles.blocoNecessidade}>
              <span className={styles.blocoNecessidadeRotulo}>Sem sugestão ainda · {plural(card.acoesSemSugestao.length, "ação", "ações")}</span>
              <ListaAcoesRecolhivel acoes={card.acoesSemSugestao} rotulo={plural(card.acoesSemSugestao.length, "ação", "ações")} />
              <div className={styles.botoesItem}>
                {iaDisponivel ? (
                  <Button variant="primary" disabled={ocupado || analisando} onClick={() => acoes.onAnalisarIa(card.itemId)} title="A IA só sugere; a decisão continua sendo sua">
                    {analisando ? "Analisando…" : "Analisar com IA"}
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={ocupado} onClick={() => acoes.onGerar(card.itemId)}>
                    Gerar sugestão
                  </Button>
                )}
              </div>
            </div>
          )}
          {jaDecididas > 0 && (
            <span className={styles.secundario}>
              Já decidido neste item:{" "}
              {[decididas.confirmadas > 0 && `${plural(decididas.confirmadas, "ação confirmada", "ações confirmadas")}`, decididas.mantidas > 0 && `${plural(decididas.mantidas, "ação mantida somente no PDI", "ações mantidas somente no PDI")}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </>
      )}

      {situacao !== "aguardando" &&
        card.sugestoes.map((s) => (
          <div key={s.id} className={styles.blocoNecessidade}>
            <span className={styles.selos}>
              {situacao === "confirmadas" ? <Selo tom="success">Necessidade confirmada</Selo> : <Selo tom="neutral">Mantida somente no PDI</Selo>}
              {s.ia && !s.neutraIa && <Selo tom="info">Sugerida pela IA{s.confianca ? ` · ${ROTULO_CONFIANCA[s.confianca].toLowerCase()}` : ""}</Selo>}
              {s.editada && <Selo tom="info">Texto editado pelo RH</Selo>}
              {s.decididoEm && <span className={styles.secundario}>em {dataCurta(s.decididoEm)}</span>}
              {situacao === "confirmadas" && s.necessidadeId && <span className={styles.secundario}>Necessidade nº {s.necessidadeId}</span>}
            </span>
            {situacao === "confirmadas" && <p className={styles.blocoNecessidadeTexto}>{s.textoFinal ?? s.textoSugerido}</p>}
            {s.observacao && <span className={styles.secundario}>Observação: {s.observacao}</span>}
            {s.origemAlteradaAposDecisao && <span className={styles.avisoHistorico}>O PDI deste item foi alterado depois desta decisão. A decisão foi mantida como estava.</span>}
            <ListaAcoesRecolhivel acoes={s.acoes} rotulo={plural(s.acoes.length, "ação", "ações")} />
          </div>
        ))}
    </li>
  );
}
