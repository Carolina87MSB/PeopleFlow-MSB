import { ChevronRight } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Badge, Card, tableStyles } from "../../components/ui";
import { tipoColor } from "../../domain/colors";
import { usePortalStore } from "../../store/PortalStoreContext";
import type { TipoMovimentacao } from "../../types/domain";
import styles from "./TiposPage.module.css";

function TipoTag({ tipo }: { tipo: TipoMovimentacao }) {
  return (
    <div className={styles.tipoTag}>
      <Badge bg={tipoColor(tipo.cod)} fg="#fff" pill={false}>
        {tipo.cod}
      </Badge>
      <span className={styles.tipoNome}>{tipo.nome}</span>
    </div>
  );
}

function EtapasFlow({ etapas, compact }: { etapas: string[]; compact?: boolean }) {
  return (
    <div className={compact ? styles.etapasFlowCompact : styles.etapasFlow}>
      {etapas.map((etapa, i) => (
        <span key={`${etapa}-${i}`} className={styles.etapaItem}>
          <Badge bg="var(--color-brand-pale)" fg="var(--color-navy-soft)">
            {etapa}
          </Badge>
          {i < etapas.length - 1 && <ChevronRight size={compact ? 11 : 13} className={styles.etapaArrow} />}
        </span>
      ))}
    </div>
  );
}

const ACESSO_ITEMS = [
  { titulo: "E-mail corporativo", desc: "Login exclusivo via @msbbrasil.com." },
  { titulo: "Somente gestores", desc: "Acesso liberado apenas a colaboradores com perfil de gestor cadastrado." },
  {
    titulo: "Visão por área",
    desc: "Cada gestor enxerga somente os colaboradores da sua própria equipe (hierarquia direta e indireta).",
  },
  {
    titulo: "Escopo por perfil",
    desc: "RH tem visão completa de colaboradores e movimentações; a diretoria vê apenas o que está encaminhado para sua aprovação.",
  },
];

export function TiposPage() {
  const { state } = usePortalStore();
  const { tipos, perfis } = state;

  return (
    <>
      <Header />

      <div className={styles.page}>
        <Card>
          <h3 className={styles.cardTitle}>Matriz de aprovação</h3>
          <p className={styles.cardDesc}>
            Cada tipo de movimentação exige um fluxo de aprovação específico, com prazo (SLA) próprio.
          </p>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fluxo de aprovação obrigatório</th>
                  <th className={tableStyles.right}>SLA</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((tipo) => (
                  <tr key={tipo.cod}>
                    <td>
                      <TipoTag tipo={tipo} />
                    </td>
                    <td>
                      <EtapasFlow etapas={tipo.etapas} />
                    </td>
                    <td className={tableStyles.right}>{tipo.sla} dias</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className={styles.tipoGrid}>
          {tipos.map((tipo) => (
            <Card key={tipo.cod} className={styles.tipoCard}>
              <div className={styles.activeBadge}>
                <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)">
                  Ativo
                </Badge>
              </div>
              <TipoTag tipo={tipo} />
              <p className={styles.tipoDesc}>{tipo.desc}</p>
              <EtapasFlow etapas={tipo.etapas} compact />
              <div className={styles.tipoFooter}>
                <span>SLA: {tipo.sla} dias</span>
                <span>Impacto: {tipo.impacto}</span>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <h3 className={styles.cardTitle}>Perfis de acesso e permissões</h3>
          <div className={styles.perfilList}>
            {perfis.map((perfil) => (
              <div key={perfil.papel} className={styles.perfilRow}>
                <Badge bg={perfil.cor} fg="#fff">
                  {perfil.papel}
                </Badge>
                <div className={styles.perfilInfo}>
                  <p className={styles.perfilDesc}>{perfil.desc}</p>
                  <p className={styles.perfilPode}>Pode: {perfil.pode}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className={styles.cardTitle}>Acesso &amp; segurança de dados</h3>
          <div className={styles.acessoGrid}>
            {ACESSO_ITEMS.map((item) => (
              <div key={item.titulo} className={styles.acessoItem}>
                <h4 className={styles.acessoTitulo}>{item.titulo}</h4>
                <p className={styles.acessoDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
