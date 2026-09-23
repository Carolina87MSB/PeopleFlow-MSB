import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Award, Briefcase, ClipboardCheck, UserRound } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Card, FilterChips, tableStyles } from "../../components/ui";
import { usePortalStore } from "../../store/PortalStoreContext";
import {
  conformidadeDoColaborador,
  historicoDoColaborador,
  listarGaps,
  listarHabilidades,
  listarRequisitosDoCargo,
  titulosListaMestra,
  type LinhaConformidade,
  type Situacao,
} from "./devRepository";
import { useDesenvolvimento } from "./contexto";
import { Abas, Carregando, Erro, EstadoVazio, Paginacao, Selo, type AbaDef } from "./componentes";
import { useConsulta, usePaginado } from "./hooks";
import { formatarCarga, formatarData, formatarPeriodicidade, SITUACAO } from "./rotulos";
import styles from "./Desenvolvimento.module.css";

type AbaHabilidades = "gaps" | "cargo" | "colaborador" | "catalogo";

export default function HabilidadesPage() {
  const { perfil } = useDesenvolvimento();
  const { aba } = useParams<{ aba?: string }>();
  const abas: AbaDef<AbaHabilidades>[] = [
    { id: "gaps", rotulo: "Gaps" },
    { id: "cargo", rotulo: "Por cargo" },
    { id: "colaborador", rotulo: "Por colaborador" },
    ...(perfil === "RH" ? [{ id: "catalogo" as const, rotulo: "Catálogo" }] : []),
  ];
  const atual = abas.find((a) => a.id === aba)?.id;
  if (!atual) return <Navigate to="/desenvolvimento/habilidades/gaps" replace />;

  return (
    <>
      <Header />
      <Abas base="/desenvolvimento/habilidades" abas={abas} atual={atual} />
      {atual === "gaps" && <GapsAba />}
      {atual === "cargo" && <PorCargoAba />}
      {atual === "colaborador" && <PorColaboradorAba />}
      {atual === "catalogo" && <CatalogoAba />}
    </>
  );
}

const FILTROS_GAP: { rotulo: string; situacoes: Situacao[] }[] = [
  { rotulo: "Todos", situacoes: ["pendente", "vencido", "revisao_pendente", "a_vencer"] },
  { rotulo: "Pendentes", situacoes: ["pendente"] },
  { rotulo: "Vencidos", situacoes: ["vencido"] },
  { rotulo: "Revisão de POP", situacoes: ["revisao_pendente"] },
  { rotulo: "A vencer", situacoes: ["a_vencer"] },
];

async function comTitulos(linhas: LinhaConformidade[]) {
  const titulos = await titulosListaMestra(linhas.map((l) => l.lista_mestra_codigo));
  return linhas.map((l) => ({ ...l, titulo: titulos.get(l.lista_mestra_codigo) ?? "" }));
}

function GapsAba() {
  const { perfil, pessoaPorId } = useDesenvolvimento();
  const [filtro, setFiltro] = useState(FILTROS_GAP[0].rotulo);
  const situacoes = FILTROS_GAP.find((f) => f.rotulo === filtro)!.situacoes;
  const { dados, erro, carregando, pagina, setPagina } = usePaginado(
    async (p) => {
      const r = await listarGaps(p, situacoes);
      return { total: r.total, itens: await comTitulos(r.itens) };
    },
    [filtro],
  );

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Gaps de treinamentos obrigatórios</h3>
          <p className={styles.cardSubtitle}>
            {perfil === "RH" ? "Todos os colaboradores ativos" : "Colaboradores da sua equipe"} × requisitos vigentes dos cargos
          </p>
        </div>
        <FilterChips options={FILTROS_GAP.map((f) => f.rotulo)} value={filtro} onChange={setFiltro} />
      </div>
      {erro ? (
        <Erro mensagem={erro} />
      ) : carregando || !dados ? (
        <Carregando />
      ) : dados.itens.length === 0 ? (
        <EstadoVazio
          icone={<ClipboardCheck size={26} strokeWidth={1.6} />}
          titulo="Nenhum gap identificado."
          descricao="Os gaps aparecem aqui quando houver requisitos vigentes cadastrados para os cargos."
        />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Cargo</th>
                  <th>Requisito</th>
                  <th>Última realização</th>
                  <th>Validade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((g) => (
                  <tr key={`${g.colaborador_id}-${g.requisito_id}`}>
                    <td>{pessoaPorId.get(g.colaborador_id)?.nome ?? `Colaborador #${g.colaborador_id}`}</td>
                    <td className={styles.secundario}>{g.cargo_nome}</td>
                    <td>
                      {g.lista_mestra_codigo}
                      {g.titulo && <span className={styles.secundario}> · {g.titulo}</span>}
                    </td>
                    <td className={styles.mono}>{formatarData(g.ultima_realizacao)}</td>
                    <td className={styles.mono}>{formatarData(g.validade_ate)}</td>
                    <td>
                      <Selo tom={SITUACAO[g.situacao].tom}>{SITUACAO[g.situacao].rotulo}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} total={dados.total} onChange={setPagina} />
        </>
      )}
    </Card>
  );
}

function PorCargoAba() {
  const { perfil, pessoas } = useDesenvolvimento();
  const { state } = usePortalStore();
  // Fonte oficial de cargo: Descrição de Cargo (não obsoleta). Gestor vê só
  // os cargos ocupados pela própria equipe.
  const cargos = useMemo(() => {
    const cargosEquipe = new Set(pessoas.map((p) => p.cargo));
    return state.descricoesCargo
      .filter((d) => !d.obsoleto && (perfil === "RH" || cargosEquipe.has(d.cargoNome)))
      .map((d) => d.cargoNome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [state.descricoesCargo, pessoas, perfil]);
  const [cargo, setCargo] = useState("");
  const selecionado = cargos.includes(cargo) ? cargo : "";
  const { dados, erro, carregando } = useConsulta(() => (selecionado ? listarRequisitosDoCargo(selecionado) : Promise.resolve([])), [selecionado]);

  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Requisitos por cargo</h3>
          <p className={styles.cardSubtitle}>Habilidades e treinamentos obrigatórios exigidos pelo cargo</p>
        </div>
        <div className={styles.filtros}>
          <select className={styles.select} value={selecionado} onChange={(e) => setCargo(e.target.value)} aria-label="Cargo">
            <option value="">Selecione um cargo</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!selecionado ? (
        <EstadoVazio
          icone={<Briefcase size={26} strokeWidth={1.6} />}
          titulo={cargos.length ? "Selecione um cargo para ver os requisitos." : "Nenhum cargo com Descrição de Cargo disponível."}
        />
      ) : erro ? (
        <Erro mensagem={erro} />
      ) : carregando || !dados ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <EstadoVazio icone={<Briefcase size={26} strokeWidth={1.6} />} titulo="Nenhum requisito cadastrado para este cargo." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Requisito</th>
                <th>Obrigatório</th>
                <th>Periodicidade</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((r) => (
                <tr key={r.id}>
                  <td className={styles.secundario}>{r.tipo_requisito === "habilidade" ? "Habilidade" : "Treinamento"}</td>
                  <td>
                    {r.tipo_requisito === "habilidade" ? r.habilidade?.nome : r.lista_mestra_codigo}
                    {r.lista_mestra?.titulo && <span className={styles.secundario}> · {r.lista_mestra.titulo}</span>}
                  </td>
                  <td>{r.obrigatorio ? "Sim" : "Não"}</td>
                  <td className={styles.secundario}>
                    {r.tipo_requisito === "treinamento" ? formatarPeriodicidade(r.periodicidade_meses ?? r.lista_mestra?.periodicidade_meses) : "—"}
                  </td>
                  <td>
                    <Selo tom={r.status === "vigente" ? "success" : "neutral"}>{r.status === "vigente" ? "Vigente" : "Sugerido"}</Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PorColaboradorAba() {
  const { pessoas } = useDesenvolvimento();
  const [id, setId] = useState<number | null>(null);
  const selecionado = pessoas.find((p) => p.id === id) ?? null;
  const conformidade = useConsulta(
    async () => (selecionado ? comTitulos(await conformidadeDoColaborador(selecionado.id)) : []),
    [selecionado?.id],
  );
  const historico = useConsulta(() => (selecionado ? historicoDoColaborador(selecionado.id) : Promise.resolve([])), [selecionado?.id]);

  return (
    <div className={styles.pilha}>
      <Card>
        <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
          <div>
            <h3 className={styles.cardTitle}>Ficha de desenvolvimento</h3>
            <p className={styles.cardSubtitle}>{selecionado ? `${selecionado.cargo} · ${selecionado.departamento}` : "Treinamentos obrigatórios e histórico de um colaborador"}</p>
          </div>
          <div className={styles.filtros}>
            <select className={styles.select} value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)} aria-label="Colaborador">
              <option value="">Selecione um colaborador</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {!selecionado ? (
        <Card>
          <EstadoVazio icone={<UserRound size={26} strokeWidth={1.6} />} titulo="Selecione um colaborador para ver a ficha." />
        </Card>
      ) : (
        <div className={styles.duasColunas}>
          <Card>
            <h3 className={styles.cardTitle}>Treinamentos obrigatórios do cargo</h3>
            <div style={{ marginTop: 14 }}>
              {conformidade.erro ? (
                <Erro mensagem={conformidade.erro} />
              ) : conformidade.carregando || !conformidade.dados ? (
                <Carregando />
              ) : conformidade.dados.length === 0 ? (
                <EstadoVazio icone={<ClipboardCheck size={24} strokeWidth={1.6} />} titulo="Nenhum treinamento obrigatório vigente para este cargo." />
              ) : (
                <div className={tableStyles.wrap}>
                  <table className={tableStyles.table}>
                    <thead>
                      <tr>
                        <th>Requisito</th>
                        <th>Validade</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conformidade.dados.map((c) => (
                        <tr key={c.requisito_id}>
                          <td>
                            {c.lista_mestra_codigo}
                            {c.titulo && <span className={styles.secundario}> · {c.titulo}</span>}
                          </td>
                          <td className={styles.mono}>{formatarData(c.validade_ate)}</td>
                          <td>
                            <Selo tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Selo>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className={styles.cardTitle}>Histórico de treinamentos</h3>
            <div style={{ marginTop: 14 }}>
              {historico.erro ? (
                <Erro mensagem={historico.erro} />
              ) : historico.carregando || !historico.dados ? (
                <Carregando />
              ) : historico.dados.length === 0 ? (
                <EstadoVazio icone={<Award size={24} strokeWidth={1.6} />} titulo="Nenhum treinamento registrado." />
              ) : (
                <div className={tableStyles.wrap}>
                  <table className={tableStyles.table}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Treinamento</th>
                        <th>Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.dados.map((h) => (
                        <tr key={h.participante_id}>
                          <td className={styles.mono}>{formatarData(h.data_realizacao)}</td>
                          <td>
                            {h.titulo}
                            {h.lista_mestra_codigo && (
                              <span className={styles.secundario}>
                                {" "}
                                · {h.lista_mestra_codigo}
                                {h.lista_mestra_revisao ? ` rev. ${h.lista_mestra_revisao}` : ""}
                              </span>
                            )}
                          </td>
                          <td className={styles.mono}>{formatarCarga(h.carga_horaria_min)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const ROTULO_NORMA: Record<string, string> = { iso_13485: "ISO 13485", rdc_665: "RDC 665", ambas: "ISO 13485 e RDC 665", nao_aplicavel: "—" };

function CatalogoAba() {
  const { dados, erro, carregando, pagina, setPagina } = usePaginado((p) => listarHabilidades(p), []);
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>Catálogo de habilidades</h3>
          <p className={styles.cardSubtitle}>Habilidades técnicas e regulatórias usadas nos requisitos dos cargos</p>
        </div>
      </div>
      {erro ? (
        <Erro mensagem={erro} />
      ) : carregando || !dados ? (
        <Carregando />
      ) : dados.itens.length === 0 ? (
        <EstadoVazio icone={<Award size={26} strokeWidth={1.6} />} titulo="Nenhuma habilidade cadastrada." />
      ) : (
        <>
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Habilidade</th>
                  <th>Tipo</th>
                  <th>Norma</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {h.nome}
                      {h.descricao && <div className={styles.secundario}>{h.descricao}</div>}
                    </td>
                    <td className={styles.secundario}>{h.tipo === "tecnica" ? "Técnica" : "Regulatória"}</td>
                    <td className={styles.secundario}>{h.norma ? ROTULO_NORMA[h.norma] : "—"}</td>
                    <td>
                      <Selo tom={h.ativo ? "success" : "neutral"}>{h.ativo ? "Ativa" : "Inativa"}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} total={dados.total} onChange={setPagina} />
        </>
      )}
    </Card>
  );
}
