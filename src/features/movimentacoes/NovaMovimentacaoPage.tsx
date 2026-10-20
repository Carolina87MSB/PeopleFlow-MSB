// Nova Movimentação + Guia de Movimentações. Substitui a antiga página "Tipos de movimentação" (matriz de aprovação, cards repetidos, perfis e segurança):
// o formulário é o MESMO componente do botão do Dashboard (NovaMovimentacaoModal) — nenhum formulário duplicado — e a consulta dos tipos usa o
// catálogo efetivamente cadastrado (tipos, fluxos e SLAs de `state.tipos`). As regras de aprovação não mudam. Perfis/permissões e segurança de
// acesso foram para a tela Acessos.

import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { NovaMovimentacaoModal } from "../../components/shared/NovaMovimentacaoModal";
import { Badge, Button, Card, tableStyles } from "../../components/ui";
import { tipoColor } from "../../domain/colors";
import { usePortalStore } from "../../store/PortalStoreContext";
import { usePortalData } from "../../store/usePortalData";
import styles from "./NovaMovimentacaoPage.module.css";

export function NovaMovimentacaoPage() {
  const { state } = usePortalStore();
  const { podeCriar } = usePortalData();
  const [modalAberto, setModalAberto] = useState(false);
  const { tipos } = state;

  return (
    <>
      <Header />

      <div className={styles.page}>
        <Card>
          <div className={styles.acao}>
            <div>
              <h3 className={styles.cardTitle}>Nova Movimentação</h3>
              <p className={styles.cardDesc}>Solicite uma admissão, promoção, alteração salarial, transferência ou desligamento. A solicitação segue o fluxo de aprovação do tipo escolhido (veja o guia abaixo).</p>
            </div>
            {podeCriar ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModalAberto(true)}>
                Abrir movimentação
              </Button>
            ) : (
              <span className={styles.semPermissao}>Seu perfil não abre movimentações.</span>
            )}
          </div>
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Guia de movimentações</h3>
          <p className={styles.cardDesc}>Consulta rápida dos tipos cadastrados no sistema: quando usar, quem aprova e o prazo (SLA) de cada um.</p>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Quando utilizar</th>
                  <th>Fluxo de aprovação</th>
                  <th className={tableStyles.right}>SLA</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((tipo) => (
                  <tr key={tipo.cod}>
                    <td>
                      <div className={styles.tipoTag}>
                        <Badge bg={tipoColor(tipo.cod)} fg="#fff" pill={false}>
                          {tipo.cod}
                        </Badge>
                        <span className={styles.tipoNome}>{tipo.nome}</span>
                      </div>
                    </td>
                    <td className={styles.quando}>{tipo.desc}</td>
                    <td>
                      <div className={styles.etapasFlow}>
                        {tipo.etapas.map((etapa, i) => (
                          <span key={`${etapa}-${i}`} className={styles.etapaItem}>
                            <Badge bg="var(--color-brand-pale)" fg="var(--color-navy-soft)">
                              {etapa}
                            </Badge>
                            {i < tipo.etapas.length - 1 && <ChevronRight size={13} className={styles.etapaArrow} />}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`${tableStyles.right} ${styles.sla}`}>{tipo.sla} dias</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.nota}>
            Fluxo base do cadastro. O sistema aplica duas exceções: desligamento por <strong>pedido de demissão do colaborador</strong> dispensa a etapa Diretoria (vai do gestor direto para o RH), e
            solicitações do <strong>CEO</strong> seguem somente para o RH.
          </p>
        </Card>
      </div>

      {modalAberto && <NovaMovimentacaoModal onClose={() => setModalAberto(false)} />}
    </>
  );
}
