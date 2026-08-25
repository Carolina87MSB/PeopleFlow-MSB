import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { HelpCircle, Pencil, Search } from "lucide-react";
import { Header } from "../../components/layout/Header";
import { Avatar, Badge, Button, Drawer, EmptyState, FilterChips, tableStyles } from "../../components/ui";
import { contarPorGestor } from "../../domain/agregados";
import { nivelMeta } from "../../domain/colors";
import { norm } from "../../domain/hierarquia";
import { podeVerSalario } from "../../domain/permissoes";
import { detalharCustoMensalFolha, ehAprendiz, formatarPercentual, formatarValorMonetario, salarioVigente } from "../../domain/salario";
import { usePortalData } from "../../store/usePortalData";
import { TimelineCarreira } from "./TimelineCarreira";
import styles from "./ColaboradoresPage.module.css";

export function ColaboradoresPage() {
  const {
    colaboradoresListagem,
    podeVerColaboradores,
    podeEditarAdmissao,
    atualizarAdmissao,
    movimentacoes,
    configEncargosFolha,
    salariosBase,
    perfil,
  } = usePortalData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [depto, setDepto] = useState("Todos");
  const [busca, setBusca] = useState("");
  const [gestorSelecionado, setGestorSelecionado] = useState(searchParams.get("gestor") || "");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editandoAdmissao, setEditandoAdmissao] = useState(false);
  const [admissaoRascunho, setAdmissaoRascunho] = useState("");
  const [salvandoAdmissao, setSalvandoAdmissao] = useState(false);
  const [mostrarDetalheCusto, setMostrarDetalheCusto] = useState(false);

  const deptos = useMemo(
    () => ["Todos", ...new Set(colaboradoresListagem.map((c) => c.depto))],
    [colaboradoresListagem],
  );

  const gestores = useMemo(
    () => [...contarPorGestor(colaboradoresListagem).entries()].sort((a, b) => b[1] - a[1]),
    [colaboradoresListagem],
  );

  const filtrados = useMemo(() => {
    const termo = norm(busca);
    return colaboradoresListagem.filter((c) => {
      if (depto !== "Todos" && c.depto !== depto) return false;
      if (gestorSelecionado && c.gestor !== gestorSelecionado) return false;
      if (termo) {
        const alvo = norm(`${c.nome} ${c.cargo} ${c.depto} ${c.gestor}`);
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [colaboradoresListagem, depto, gestorSelecionado, busca]);

  const colaboradorSelecionado = useMemo(
    () => colaboradoresListagem.find((c) => c.nome === selecionado) || null,
    [colaboradoresListagem, selecionado],
  );

  // Salário/Custo Mensal Folha nunca vêm do cadastro do colaborador — ver
  // domain/salario.ts (fonte principal: campo "Novo salário" das
  // movimentações PRO/SAL já aprovadas; fallback: planilha importada em
  // salariosBase). Visibilidade restrita a RH/Diretoria, mesma regra já
  // usada na Timeline (podeVerSalario).
  const verSalario = podeVerSalario(perfil);
  const salario = useMemo(
    () => (colaboradorSelecionado ? salarioVigente(colaboradorSelecionado.nome, movimentacoes, salariosBase) : null),
    [colaboradorSelecionado, movimentacoes, salariosBase],
  );
  const detalheCusto = useMemo(
    () =>
      colaboradorSelecionado && salario && configEncargosFolha
        ? detalharCustoMensalFolha(salario.valor, ehAprendiz(colaboradorSelecionado), configEncargosFolha)
        : null,
    [salario, colaboradorSelecionado, configEncargosFolha],
  );

  if (!podeVerColaboradores) return <Navigate to="/dashboard" replace />;

  function handleGestorChange(nome: string) {
    setGestorSelecionado(nome);
    const params = new URLSearchParams(searchParams);
    if (nome) params.set("gestor", nome);
    else params.delete("gestor");
    setSearchParams(params, { replace: true });
  }

  function abrirDrawer(nome: string) {
    setSelecionado(nome);
    setEditandoAdmissao(false);
    setMostrarDetalheCusto(false);
  }

  function fecharDrawer() {
    setSelecionado(null);
    setEditandoAdmissao(false);
    setMostrarDetalheCusto(false);
  }

  function iniciarEdicaoAdmissao() {
    if (!colaboradorSelecionado) return;
    setAdmissaoRascunho(colaboradorSelecionado.admissaoIso);
    setEditandoAdmissao(true);
  }

  async function salvarAdmissao() {
    if (!colaboradorSelecionado || !admissaoRascunho) return;
    setSalvandoAdmissao(true);
    const result = await atualizarAdmissao(colaboradorSelecionado.nome, admissaoRascunho);
    setSalvandoAdmissao(false);
    if (result.ok) setEditandoAdmissao(false);
  }

  return (
    <>
      <Header />

      <FilterChips options={deptos} value={depto} onChange={setDepto} />

      <div className={styles.filtersRow}>
        <div className={styles.search}>
          <Search size={15} strokeWidth={1.8} />
          <input
            placeholder="Buscar por nome, cargo, departamento ou gestor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          className={styles.select}
          value={gestorSelecionado}
          onChange={(e) => handleGestorChange(e.target.value)}
        >
          <option value="">Todos os gestores</option>
          {gestores.map(([nome, count]) => (
            <option key={nome} value={nome}>
              {nome} ({count})
            </option>
          ))}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState message="Nenhum colaborador encontrado para este filtro." />
      ) : (
        <div className={tableStyles.wrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Vínculo</th>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Departamento</th>
                <th>Gestor imediato</th>
                <th>Data de admissão</th>
                <th>Tempo de empresa</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.nome} className={tableStyles.clickable} onClick={() => abrirDrawer(c.nome)}>
                  <td>
                    <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">
                      {c.vinculo}
                    </Badge>
                  </td>
                  <td>
                    <div className={styles.pessoa}>
                      <Avatar nome={c.nome} size={30} />
                      <span>{c.nome}</span>
                    </div>
                  </td>
                  <td>{c.cargo}</td>
                  <td>
                    <span className={styles.deptoCell}>
                      <Badge bg="var(--color-brand-pale)" fg="var(--color-navy-soft)" pill={false}>
                        {c.deptoCode}
                      </Badge>
                      {c.depto}
                    </span>
                  </td>
                  <td>{c.gestor}</td>
                  <td>
                    <span className={styles.dataSecundaria}>{c.admissao}</span>
                  </td>
                  <td>
                    <Badge bg="var(--color-brand-pale)" fg="var(--color-navy-soft)">
                      {c.tempoDeEmpresa}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colaboradorSelecionado && (
        <Drawer
          onClose={fecharDrawer}
          header={
            <div className={styles.drawerHeader}>
              <Avatar nome={colaboradorSelecionado.nome} size={44} />
              <div>
                <div className={styles.drawerNome}>{colaboradorSelecionado.nome}</div>
                <div className={styles.drawerCargo}>{colaboradorSelecionado.cargo}</div>
              </div>
            </div>
          }
        >
          <div className={styles.detalhes}>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Vínculo</span>
              <span className={styles.detalheValor}>{colaboradorSelecionado.vinculo}</span>
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Cargo</span>
              <span className={styles.detalheValor}>{colaboradorSelecionado.cargo}</span>
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Departamento</span>
              <span className={styles.detalheValor}>
                {colaboradorSelecionado.deptoCode} · {colaboradorSelecionado.depto}
              </span>
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Nível</span>
              <Badge bg={nivelMeta(colaboradorSelecionado.nivel).bg} fg={nivelMeta(colaboradorSelecionado.nivel).fg}>
                {colaboradorSelecionado.nivel}
              </Badge>
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Gestor imediato</span>
              <span className={styles.detalheValor}>{colaboradorSelecionado.gestor}</span>
            </div>
            <div className={styles.detalheItem}>
              <div className={styles.detalheTopo}>
                <span className={styles.detalheLabel}>Admissão</span>
                {podeEditarAdmissao && !editandoAdmissao ? (
                  <button type="button" className={styles.editarBtn} onClick={iniciarEdicaoAdmissao} title="Editar admissão">
                    <Pencil size={12} />
                  </button>
                ) : null}
              </div>
              {editandoAdmissao ? (
                <div className={styles.edicao}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={admissaoRascunho}
                    onChange={(e) => setAdmissaoRascunho(e.target.value)}
                  />
                  <div className={styles.edicaoAcoes}>
                    <Button variant="ghost" onClick={() => setEditandoAdmissao(false)} disabled={salvandoAdmissao}>
                      Cancelar
                    </Button>
                    <Button variant="primary" onClick={salvarAdmissao} disabled={salvandoAdmissao || !admissaoRascunho}>
                      {salvandoAdmissao ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <span className={styles.detalheValor}>{colaboradorSelecionado.admissao}</span>
              )}
            </div>
            <div className={styles.detalheItem}>
              <span className={styles.detalheLabel}>Tempo de empresa</span>
              <span className={styles.detalheValor}>{colaboradorSelecionado.tempoDeEmpresa}</span>
            </div>
            {verSalario && (
              <>
                <div className={styles.detalheItem}>
                  <span className={styles.detalheLabel}>Salário</span>
                  <span className={styles.detalheValor} title={salario?.origem}>
                    {salario ? formatarValorMonetario(salario.valor) : "—"}
                  </span>
                </div>
                <div className={styles.detalheItem}>
                  <div className={styles.detalheTopo}>
                    <span className={styles.detalheLabel}>Custo Mensal Folha</span>
                    {detalheCusto && (
                      <button
                        type="button"
                        className={styles.editarBtn}
                        onClick={() => setMostrarDetalheCusto((v) => !v)}
                        title="Ver detalhes do cálculo"
                      >
                        <HelpCircle size={14} />
                      </button>
                    )}
                  </div>
                  <span className={styles.detalheValor}>
                    {detalheCusto ? formatarValorMonetario(detalheCusto.custoMensalFolha) : "—"}
                  </span>
                  {mostrarDetalheCusto && detalheCusto && (
                    <div className={styles.detalheCalculo}>
                      <div className={styles.detalheCalculoLinha}>
                        <span>Salário</span>
                        <strong>{formatarValorMonetario(detalheCusto.salario)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>INSS Patronal</span>
                        <strong>{formatarPercentual(detalheCusto.inssPatronal)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span title={detalheCusto.ratObservacao}>RAT (GIILRAT efetivo)</span>
                        <strong>{formatarPercentual(detalheCusto.rat)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>Terceiros</span>
                        <strong>{formatarPercentual(detalheCusto.terceiros)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>FGTS ({detalheCusto.ehAprendiz ? "Aprendiz" : "Celetista"})</span>
                        <strong>{formatarPercentual(detalheCusto.fgts)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>Provisão 13º</span>
                        <strong>{formatarPercentual(detalheCusto.provisaoDecimoTerceiro)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>Provisão Férias</span>
                        <strong>{formatarPercentual(detalheCusto.provisaoFerias)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinha}>
                        <span>Provisão 1/3 Férias</span>
                        <strong>{formatarPercentual(detalheCusto.provisaoTercoFerias)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinhaSub}>
                        <span>Encargos diretos</span>
                        <strong>{formatarPercentual(detalheCusto.encargosDiretosPct)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinhaSub}>
                        <span>Provisões</span>
                        <strong>{formatarPercentual(detalheCusto.provisoesPct)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinhaSub}>
                        <span>Encargos sobre as provisões</span>
                        <strong>{formatarPercentual(detalheCusto.encargosSobreProvisoesPct)}</strong>
                      </div>
                      <div className={styles.detalheCalculoLinhaFinal}>
                        <span>Custo Mensal Folha</span>
                        <strong>{formatarValorMonetario(detalheCusto.custoMensalFolha)}</strong>
                      </div>
                      <p className={styles.detalheCalculoNota}>{detalheCusto.ratObservacao}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <TimelineCarreira colaborador={colaboradorSelecionado} />
        </Drawer>
      )}
    </>
  );
}
