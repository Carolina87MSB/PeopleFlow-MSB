import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { agregarDepartamentos } from "../../domain/agregados";
import { usePortalData } from "../../store/usePortalData";
import styles from "./DepartamentosPage.module.css";

function gestorPrincipal(gestores: Record<string, number>): string {
  let melhor = "";
  let max = -1;
  for (const [nome, count] of Object.entries(gestores)) {
    if (count > max) {
      max = count;
      melhor = nome;
    }
  }
  return melhor;
}

/** Líder Imediato: dentro dos gestores já registrados pra este departamento
 * (mesma contagem de gestorPrincipal), o único que também é ELE MESMO um
 * colaborador deste departamento — ou seja, lidera de dentro, não de fora.
 * Ex.: em Recursos Humanos, o Yuri aparece como "Gestor responsável" (é
 * gestor da Carolina) mas nem trabalha em RH; a Carolina, que trabalha lá e
 * lidera a Leslie, é a líder imediata. Entre vários candidatos internos,
 * vence quem lidera mais gente do próprio departamento (mesmo critério de
 * gestorPrincipal). `null` quando ninguém na contagem de gestores é membro
 * do próprio departamento (ex.: Comercial, onde só aparece o Daniel — que
 * está lotado em Diretoria) — nesse caso não existe líder imediato distinto
 * do gestor responsável pra mostrar. Nenhum dado novo: só cruza
 * `d.gestores` (já existente) com `colaboradores.depto` de cada nome. */
function liderImediato(depto: string, gestores: Record<string, number>, deptoPorNome: Map<string, string>): string | null {
  let melhor: string | null = null;
  let max = -1;
  for (const [nome, count] of Object.entries(gestores)) {
    if (deptoPorNome.get(nome) !== depto) continue;
    if (count > max) {
      max = count;
      melhor = nome;
    }
  }
  return melhor;
}

export function DepartamentosPage() {
  const { colaboradoresVisiveis, podeVerCadastros } = usePortalData();

  const departamentos = useMemo(() => agregarDepartamentos(colaboradoresVisiveis), [colaboradoresVisiveis]);
  const deptoPorNome = useMemo(() => new Map(colaboradoresVisiveis.map((c) => [c.nome, c.depto])), [colaboradoresVisiveis]);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={styles.grid}>
        {departamentos.map((d) => {
          const responsavel = gestorPrincipal(d.gestores);
          const imediato = liderImediato(d.nome, d.gestores, deptoPorNome);
          return (
            <div key={d.nome} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.code}>{d.code}</span>
                <span className={styles.count}>{d.count}</span>
              </div>
              <div className={styles.nome}>{d.nome}</div>
              <div className={styles.details}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Gestor responsável</span>
                  <span className={styles.detailValue}>{responsavel}</span>
                </div>
                {imediato && imediato !== responsavel && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Líder imediato</span>
                    <span className={styles.detailValue}>{imediato}</span>
                  </div>
                )}
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Cargos distintos</span>
                  <span className={styles.detailValue}>{d.cargos.size}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
