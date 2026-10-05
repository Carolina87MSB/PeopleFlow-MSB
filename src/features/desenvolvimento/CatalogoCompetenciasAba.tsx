import { useMemo, useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { Button, Card, Drawer, FilterChips, tableStyles } from "../../components/ui";
import { useToast } from "../../components/shared/ToastContext";
import {
  getCatalogoCompetenciasComportamentaisComUso,
  type CompetenciaComportamentalConsulta,
} from "../../repositories/competenciasCargoRepository";
import { CabecalhoDrawer, Carregando, Erro, EstadoVazio, Selo } from "./componentes";
import { useConsulta } from "./hooks";
import { normalizar } from "./buscaHabilidades";
import styles from "./Desenvolvimento.module.css";

const FILTRO_SITUACAO = [
  { rotulo: "Ativas", valor: true },
  { rotulo: "Inativas", valor: false },
  { rotulo: "Todas", valor: null },
];

const rotuloCargos = (n: number) => (n === 0 ? "—" : `${n} cargo${n === 1 ? "" : "s"}`);

/** Catálogo oficial de Competências Comportamentais da MSB (o mesmo usado nas
 * Descrições de Cargo) — SOMENTE CONSULTA: sem criar, editar, excluir ou
 * inativar. Não é o catálogo da AVD/PDI (outra tabela, outro conjunto). */
export function CatalogoCompetenciasAba() {
  const { flash } = useToast();
  const consulta = useConsulta(() => getCatalogoCompetenciasComportamentaisComUso(), []);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState(FILTRO_SITUACAO[0].rotulo);
  const [aberta, setAberta] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const todas = consulta.dados;
  const ativo = FILTRO_SITUACAO.find((f) => f.rotulo === situacao)!.valor;
  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return (todas ?? []).filter(
      (c) => (ativo === null || c.ativo === ativo) && (!termo || normalizar(`${c.nome} ${c.descricao}`).includes(termo)),
    );
  }, [todas, busca, ativo]);
  const selecionada = todas?.find((c) => c.id === aberta) ?? null;
  const filtrando = Boolean(busca.trim()) || ativo !== true;

  async function gerarManual() {
    if (!todas) return;
    setGerando(true);
    try {
      const { gerarManualCompetenciasPdf } = await import("./manualCompetenciasPdf");
      let logo: Uint8Array | undefined;
      try {
        const r = await fetch("/assets/msb-logo.png");
        if (r.ok) logo = new Uint8Array(await r.arrayBuffer());
      } catch {
        logo = undefined; // o manual sai sem logo
      }
      const itens = todas.filter((c) => c.ativo).map((c) => ({ ordem: c.ordem, nome: c.nome, descricao: c.descricao }));
      const bytes = await gerarManualCompetenciasPdf(itens, new Date(), logo);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Manual de Competências Comportamentais - MSB.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash("Manual de Competências gerado.");
    } catch {
      flash("Não foi possível gerar o Manual de Competências. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className={styles.pilha}>
      <Card>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>Catálogo de Competências Comportamentais</h3>
            <p className={styles.cardSubtitle}>
              Referencial oficial de competências comportamentais da MSB utilizado nas Descrições de Cargo e no desenvolvimento de pessoas.
            </p>
          </div>
          <Button variant="secondary" icon={<FileText size={16} />} disabled={!todas || gerando} onClick={() => void gerarManual()}>
            {gerando ? "Gerando..." : "Manual de Competências"}
          </Button>
        </div>
        <div className={styles.toolbar}>
          <form className={styles.filtros} onSubmit={(e) => e.preventDefault()}>
            <input
              className={styles.input}
              type="search"
              placeholder="Buscar por nome ou descrição"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar competência"
            />
          </form>
          <FilterChips options={FILTRO_SITUACAO.map((f) => f.rotulo)} value={situacao} onChange={setSituacao} />
        </div>

        {consulta.erro ? (
          <Erro mensagem={consulta.erro} />
        ) : consulta.carregando || !todas ? (
          <Carregando />
        ) : filtradas.length === 0 ? (
          <EstadoVazio
            icone={<BookOpen size={26} strokeWidth={1.6} />}
            titulo={filtrando ? "Nenhuma competência encontrada." : "Nenhuma competência cadastrada."}
          />
        ) : (
          <div className={tableStyles.wrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Competência</th>
                  <th>Descrição oficial</th>
                  <th>Uso por cargo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <tr
                    key={c.id}
                    className={[styles.linhaClicavel, c.ativo ? "" : styles.linhaInativa].join(" ")}
                    tabIndex={0}
                    onClick={() => setAberta(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setAberta(c.id);
                    }}
                  >
                    <td className={styles.colunaNumero}>{c.ordem}</td>
                    <td>{c.nome}</td>
                    <td className={styles.colunaDescricao}>
                      <div className={styles.secundario}>{c.descricao || "—"}</div>
                    </td>
                    <td className={styles.secundario} title={c.cargos.map((x) => x.nome).join(", ") || undefined}>
                      {rotuloCargos(c.cargos.length)}
                    </td>
                    <td>
                      <Selo tom={c.ativo ? "success" : "neutral"}>{c.ativo ? "Ativa" : "Inativa"}</Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selecionada && <DetalheCompetencia competencia={selecionada} onFechar={() => setAberta(null)} />}
    </div>
  );
}

function DetalheCompetencia({ competencia: c, onFechar }: { competencia: CompetenciaComportamentalConsulta; onFechar: () => void }) {
  return (
    <Drawer onClose={onFechar} header={<CabecalhoDrawer eyebrow="Competência comportamental" titulo={c.nome} />}>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Descrição oficial</h4>
        <p className={styles.descricaoOficial}>{c.descricao || "—"}</p>
      </div>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Situação</h4>
        <div>
          <Selo tom={c.ativo ? "success" : "neutral"}>{c.ativo ? "Ativa" : "Inativa"}</Selo>
        </div>
      </div>
      <div className={styles.secao}>
        <h4 className={styles.secaoTitulo}>Cargos vinculados ({c.cargos.length})</h4>
        {c.cargos.length === 0 ? (
          <span className={styles.dica}>Nenhum cargo utiliza esta competência no momento.</span>
        ) : (
          <ul className={styles.listaCargos}>
            {c.cargos.map((cargo) => (
              <li key={cargo.nome}>
                {cargo.nome}
                {cargo.obsoleto && <span className={styles.secundario}>· cargo obsoleto</span>}
              </li>
            ))}
          </ul>
        )}
        <span className={styles.dica}>Catálogo institucional, somente para consulta.</span>
      </div>
    </Drawer>
  );
}
