import { Navigate, useParams } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { useDesenvolvimento } from "./contexto";
import { Abas, type AbaDef } from "./componentes";
import { NecessidadesAba } from "./NecessidadesAba";
import { SugestoesPdiAba } from "./SugestoesPdiAba";
import { LntAba } from "./LntAba";

type AbaLnt = "necessidades" | "lnt" | "sugestoes";

/** LNT: a Base de Necessidades de Desenvolvimento (contínua), a LNT do ciclo (consolidação e priorização
 * pela RH; o Gestor só consulta) e as sugestões do PDI (RH). */
export default function LntPage() {
  const { perfil } = useDesenvolvimento();
  const { aba } = useParams<{ aba?: string }>();
  const abas: AbaDef<AbaLnt>[] = [
    { id: "necessidades", rotulo: "Necessidades de Desenvolvimento" },
    ...(perfil === "RH" || perfil === "Gestor"
      ? [{ id: "lnt" as const, rotulo: "LNT", ajuda: "Consolida e prioriza as Necessidades de Desenvolvimento para o planejamento de T&D. Cada necessidade original continua preservada na Base." }]
      : []),
    ...(perfil === "RH" ? [{ id: "sugestoes" as const, rotulo: "Sugestões" }] : []),
  ];
  const atual = abas.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/lnt/necessidades" replace />;
  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/lnt" abas={abas} atual={atual} />
      {atual === "necessidades" && <NecessidadesAba />}
      {atual === "lnt" && <LntAba />}
      {atual === "sugestoes" && <SugestoesPdiAba />}
    </>
  );
}
