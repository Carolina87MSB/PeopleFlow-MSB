import { Navigate, useParams } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { useDesenvolvimento } from "./contexto";
import { Abas, type AbaDef } from "./componentes";
import { NecessidadesAba } from "./NecessidadesAba";
import { SugestoesPdiAba } from "./SugestoesPdiAba";

type AbaLnt = "necessidades" | "sugestoes";

/** Nesta fase, "LNT" funciona como a Base de Necessidades de Desenvolvimento
 * (insumo da LNT 2027), não como a LNT anual consolidada. */
export default function LntPage() {
  const { perfil } = useDesenvolvimento();
  const { aba } = useParams<{ aba?: string }>();
  const abas: AbaDef<AbaLnt>[] = [{ id: "necessidades", rotulo: "Necessidades de Desenvolvimento" }, ...(perfil === "RH" ? [{ id: "sugestoes" as const, rotulo: "Sugestões" }] : [])];
  const atual = abas.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/lnt/necessidades" replace />;
  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/lnt" abas={abas} atual={atual} />
      {atual === "necessidades" ? <NecessidadesAba /> : <SugestoesPdiAba />}
    </>
  );
}
