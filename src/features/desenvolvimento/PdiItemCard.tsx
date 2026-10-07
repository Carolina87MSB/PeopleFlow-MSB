import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
}

interface Props extends AcoesDoCard {
  card: ItemCard;
  situacao: SituacaoItem;
  /** Há uma gravação em andamento: bloqueia novos cliques. */
  ocupado: boolean;
  /** O colaborador do PDI foi identificado de forma única (a Necessidade exige esse vínculo). */
  confirmavel: boolean;
}

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

function SugestaoPendente({ s, ocupado, confirmavel, ...acoes }: { s: SugestaoCard; ocupado: boolean; confirmavel: boolean } & AcoesDoCard) {
  const solta = s.necessidadeSolta;
  // Necessidade já criada e sem vínculo: só falta concluir (o servidor adota a que existe), mesmo que o PDI tenha mudado depois.
  const bloqueada = ocupado || (s.desatualizada && !solta);
  const separavel = s.acoes.length >= 2;
  return (
    <div className={styles.blocoNecessidade}>
      <span className={styles.blocoNecessidadeRotulo}>
        {s.aDefinir ? "Necessidade a definir" : "Necessidade sugerida"} · {plural(s.acoes.length, "ação de origem", "ações de origem")}
      </span>
      {s.aDefinir ? (
        <p className={styles.itemPdiObjetivo}>Revise o objetivo e as ações do PDI e descreva a necessidade de desenvolvimento.</p>
      ) : (
        <>
          <p className={styles.blocoNecessidadeTexto}>{s.textoSugerido}</p>
          <span className={styles.dica}>
            {s.automatica ? "Sugerida automaticamente por uma regra simples (sem inteligência artificial); " : ""}revise e edite antes de confirmar. Competência/KPI e objetivo seguem exatamente como estão no PDI.
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
          O PDI deste item mudou depois que esta sugestão foi gerada. Atualize a sugestão para decidir com o texto atual.
          <div>
            <Button variant="secondary" disabled={ocupado} onClick={() => acoes.onRegenerar(s)}>
              Atualizar sugestão
            </Button>
          </div>
        </div>
      )}
      <ListaAcoesRecolhivel acoes={s.acoes} rotulo={plural(s.acoes.length, "ação", "ações")} />
      <div className={styles.botoesItem}>
        {solta ? (
          <Button variant="primary" disabled={ocupado} onClick={() => acoes.onConfirmar(s)}>
            Concluir confirmação
          </Button>
        ) : (
          <>
            {!s.aDefinir && (
              <Button variant="primary" disabled={bloqueada || !confirmavel} title={confirmavel ? "Confirmar que este item do PDI representa uma Necessidade de Desenvolvimento" : "Colaborador não identificado de forma única"} onClick={() => acoes.onConfirmar(s)}>
                Confirmar necessidade
              </Button>
            )}
            <Button variant={s.aDefinir ? "primary" : "secondary"} disabled={bloqueada || !confirmavel} title={s.aDefinir ? "Descreva a necessidade de desenvolvimento deste item" : undefined} onClick={() => acoes.onEditar(s)}>
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

export function PdiItemCard({ card, situacao, ocupado, confirmavel, ...acoes }: Props) {
  const { decididas } = card;
  const jaDecididas = decididas.confirmadas + decididas.mantidas;
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
          {card.sugestoes.map((s) => (
            <SugestaoPendente key={s.id} s={s} ocupado={ocupado} confirmavel={confirmavel} {...acoes} />
          ))}
          {card.acoesSemSugestao.length > 0 && (
            <div className={styles.blocoNecessidade}>
              <span className={styles.blocoNecessidadeRotulo}>Sem sugestão ainda · {plural(card.acoesSemSugestao.length, "ação", "ações")}</span>
              <ListaAcoesRecolhivel acoes={card.acoesSemSugestao} rotulo={plural(card.acoesSemSugestao.length, "ação", "ações")} />
              <div className={styles.botoesItem}>
                <Button variant="secondary" disabled={ocupado} onClick={() => acoes.onGerar(card.itemId)}>
                  Gerar sugestão
                </Button>
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
