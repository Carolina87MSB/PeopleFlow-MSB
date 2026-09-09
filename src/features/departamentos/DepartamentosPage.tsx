import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { agregarDepartamentos } from "../../domain/agregados";
import { usePortalData } from "../../store/usePortalData";
import styles from "./DepartamentosPage.module.css";

/** Maioria simples entre todos os gestores contados pro departamento — só
 * usado como fallback de "Gestor responsável" quando não existe líder
 * imediato (ver gestorResponsavel abaixo), ex.: Comercial, onde só o Daniel
 * aparece (todos reportam direto a ele, ninguém do próprio departamento
 * lidera ninguém ali). */
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

/** Líder Imediato: dentro dos gestores já registrados pra este departamento,
 * quem também é ELE MESMO um colaborador deste departamento — ou seja,
 * lidera de dentro, não de fora. Ex.: em Recursos Humanos, a Carolina
 * trabalha lá e lidera a Leslie — é a líder imediata; o Yuri, gestor da
 * própria Carolina, não trabalha em RH. Entre vários candidatos internos,
 * vence quem lidera mais gente do próprio departamento. `null` quando
 * ninguém na contagem de gestores é membro do próprio departamento (ex.:
 * Comercial). Nenhum dado novo: só cruza `d.gestores` (já existente) com
 * `colaboradores.depto` de cada nome. */
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

/** Gestor Responsável: o próprio gestor do Líder Imediato — ou seja, um
 * nível acima de quem toca o departamento no dia a dia (achado real,
 * 2026-09: a versão anterior usava "quem lidera mais gente no
 * departamento", o que dava errado sempre que havia uma liderança interna
 * de fato — ex.: Qualidade e Regulatório mostrava a Raissa, que já é a
 * própria líder imediata, quando o responsável de verdade é o Daniel, gestor
 * dela). Sem líder imediato (ex.: Comercial) ou sem gestor cadastrado pra
 * ele, cai no critério antigo (maioria entre todos os gestores contados). */
function gestorResponsavel(
  depto: string,
  gestores: Record<string, number>,
  deptoPorNome: Map<string, string>,
  gestorPorNome: Map<string, string>,
): string {
  const imediato = liderImediato(depto, gestores, deptoPorNome);
  const gestorDoImediato = imediato ? gestorPorNome.get(imediato) : undefined;
  return gestorDoImediato || gestorPrincipal(gestores);
}

export function DepartamentosPage() {
  const { colaboradoresVisiveis, podeVerCadastros } = usePortalData();

  const departamentos = useMemo(() => agregarDepartamentos(colaboradoresVisiveis), [colaboradoresVisiveis]);
  const deptoPorNome = useMemo(() => new Map(colaboradoresVisiveis.map((c) => [c.nome, c.depto])), [colaboradoresVisiveis]);
  const gestorPorNome = useMemo(() => new Map(colaboradoresVisiveis.map((c) => [c.nome, c.gestor])), [colaboradoresVisiveis]);

  if (!podeVerCadastros) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />

      <div className={styles.grid}>
        {departamentos.map((d) => {
          const imediato = liderImediato(d.nome, d.gestores, deptoPorNome);
          const responsavel = gestorResponsavel(d.nome, d.gestores, deptoPorNome, gestorPorNome);
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
