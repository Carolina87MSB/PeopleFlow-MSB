// Conferência financeira dos desligamentos (RH): o líquido da folha é proposto como Rescisão, a GRRF é registrada com o que foi efetivamente recolhido.
// Nada é validado automaticamente; cada componente (rescisão, GRRF) tem o seu status. Quem valida alimenta o cadastro do desligado e o Dashboard — sem digitar duas vezes.

import { useMemo, useState } from "react";
import { Badge, Button, FilterChips, Modal, tableStyles } from "../../components/ui";
import { formatarDataIso } from "../../domain/dates";
import type { FonteGrrf, LinhaConferencia } from "../../domain/custosRescisao";
import { usePortalData } from "../../store/usePortalData";
import styles from "./ConferenciaFinanceira.module.css";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2.500,50" | "2500,5" | "2500.50" → número; vazio → null; inválido → NaN. */
function paraNumero(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : Number.NaN;
}

const MODALIDADES: [string, string][] = [
  ["dispensa_sem_justa_causa", "Dispensa sem justa causa"],
  ["pedido_demissao", "Pedido de demissão"],
  ["termino_contrato_determinado", "Término de contrato por prazo determinado"],
  ["antecipacao_empregador", "Contrato antecipado pelo empregador"],
  ["termino_estagio", "Término de estágio"],
  ["outra", "Outra"],
];
const FONTES: [FonteGrrf, string][] = [
  ["guia_grrf", "Guia da GRRF"],
  ["demonstrativo_rescisao", "Demonstrativo da rescisão"],
  ["outro_documento", "Outro documento"],
];

const SITUACOES = ["Todas", "Pendentes", "Divergentes", "GRRF pendente", "Validadas"];
const ORIGENS = ["Todas", "Cadastro", "Histórico"];

function ChipRescisao({ l }: { l: LinhaConferencia }) {
  if (l.rescisao.status === "validado") return <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">Validada</Badge>;
  if (l.rescisao.status === "divergente") return <Badge bg="var(--color-danger-bg)" fg="var(--color-danger-fg)" dot="var(--color-danger)">Divergente</Badge>;
  return <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">A validar</Badge>;
}

function ChipGrrf({ l }: { l: LinhaConferencia }) {
  if (l.grrf.status === "validado") return <Badge bg="var(--color-success-bg)" fg="var(--color-success-fg)" dot="var(--color-success)">Registrada</Badge>;
  if (l.grrf.status === "nao_aplicavel") return <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">Não aplicável</Badge>;
  return <Badge bg="var(--color-warning-bg)" fg="var(--color-warning-fg)" dot="var(--color-warning)">Pendente</Badge>;
}

type Dialogo = { tipo: "zero" | "decidir" | "grrf"; linha: LinhaConferencia } | { tipo: "manual"; linha: LinhaConferencia; componente: "rescisao" | "grrf" } | null;

export function ConferenciaFinanceira() {
  const { conferenciaFinanceira: conf, validarRescisoes } = usePortalData();
  const [situacao, setSituacao] = useState("Todas");
  const [origem, setOrigem] = useState("Todas");
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const linhas = useMemo(() => {
    const todas = conf?.saidas ?? [];
    return todas.filter((l) => {
      if (origem === "Cadastro" && l.origem !== "cadastro") return false;
      if (origem === "Histórico" && l.origem !== "historico") return false;
      if (situacao === "Pendentes") return l.rescisao.status !== "validado" || l.grrf.status === "pendente";
      if (situacao === "Divergentes") return l.rescisao.status === "divergente";
      if (situacao === "GRRF pendente") return l.grrf.status === "pendente";
      if (situacao === "Validadas") return l.rescisao.status === "validado" && l.grrf.status !== "pendente";
      return true;
    });
  }, [conf, situacao, origem]);

  if (!conf) return <div className={styles.aviso}>Os valores financeiros dos desligamentos não puderam ser carregados. Atualize a página; se persistir, avise o suporte.</div>;

  const c = conf.cobertura;
  const divergentes = conf.saidas.filter((l) => l.rescisao.status === "divergente").length;
  const pct = (a: number) => (c.saidas === 0 ? 0 : Math.round((a / c.saidas) * 100));
  const habilitadas = linhas.filter((l) => l.rescisao.status === "pendente" && l.rescisaoId !== null && l.liquidoFolha !== 0);

  function alternar(id: number) {
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function validarSelecionadas() {
    setOcupado(true);
    setMensagem(null);
    const r = await validarRescisoes([...selecionadas].map((id) => ({ rescisao_id: id })));
    setOcupado(false);
    if (!r.ok) return;
    const cont = (k: string) => r.resultados.filter((x) => x.resultado === k).length;
    setMensagem(`${cont("validada")} validada(s)${cont("divergente") ? ` · ${cont("divergente")} com divergência (decida individualmente)` : ""}${cont("conferir_zero") ? ` · ${cont("conferir_zero")} com líquido R$ 0,00 (confira o demonstrativo)` : ""}${cont("ja_validada") ? ` · ${cont("ja_validada")} já validada(s)` : ""}.`);
    setSelecionadas(new Set());
  }

  async function validarUma(l: LinhaConferencia) {
    if (l.rescisaoId === null) return;
    if (l.liquidoFolha === 0) {
      setDialogo({ tipo: "zero", linha: l });
      return;
    }
    setOcupado(true);
    setMensagem(null);
    const r = await validarRescisoes([{ rescisao_id: l.rescisaoId }]);
    setOcupado(false);
    if (r.ok && r.resultados[0]?.resultado === "validada") setMensagem(`Rescisão de ${l.nome} validada.`);
    else if (r.ok) setMensagem(r.resultados[0]?.detalhe ?? "Não foi possível validar.");
  }

  return (
    <div>
      {!conf.instalado && <div className={styles.aviso}>A conferência financeira ainda não foi ativada neste ambiente (migration pendente). A tela está em modo de leitura.</div>}

      <div className={styles.resumo}>
        <div className={styles.resumoCard}>
          <div className={styles.resumoRotulo}>Rescisão (líquido) validada</div>
          <div className={styles.resumoValor}>{c.rescisaoValidadas} de {c.saidas}</div>
          <div className={styles.barra}><div className={styles.barraPreenchida} style={{ width: `${pct(c.rescisaoValidadas)}%` }} /></div>
        </div>
        <div className={styles.resumoCard}>
          <div className={styles.resumoRotulo}>GRRF registrada ou não aplicável</div>
          <div className={styles.resumoValor}>{c.grrfResolvidas} de {c.saidas}</div>
          <div className={styles.barra}><div className={styles.barraPreenchida} style={{ width: `${pct(c.grrfResolvidas)}%` }} /></div>
        </div>
        <div className={styles.resumoCard}>
          <div className={styles.resumoRotulo}>Divergências a decidir</div>
          <div className={styles.resumoValor}>{divergentes}</div>
        </div>
      </div>

      <div className={styles.filtros}>
        <FilterChips options={SITUACOES} value={situacao} onChange={setSituacao} />
        <FilterChips options={ORIGENS} value={origem} onChange={setOrigem} />
      </div>

      <div className={styles.barraAcoes}>
        <Button variant="primary" disabled={ocupado || selecionadas.size === 0 || !conf.instalado} onClick={validarSelecionadas}>
          Validar selecionadas ({selecionadas.size})
        </Button>
        <Button variant="secondary" disabled={habilitadas.length === 0} onClick={() => setSelecionadas(new Set(habilitadas.map((l) => l.rescisaoId as number)))}>
          Selecionar todas as sem divergência ({habilitadas.length})
        </Button>
        {mensagem && <span className={styles.msg}>{mensagem}</span>}
      </div>

      <div className={tableStyles.wrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th />
              <th>Colaborador</th>
              <th>Desligamento</th>
              <th>Modalidade</th>
              <th>Rescisão (líquido da folha)</th>
              <th>GRRF</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave}>
                <td>
                  {l.rescisao.status === "pendente" && l.rescisaoId !== null && l.liquidoFolha !== 0 && (
                    <input type="checkbox" checked={selecionadas.has(l.rescisaoId)} onChange={() => alternar(l.rescisaoId as number)} aria-label={`Selecionar ${l.nome}`} />
                  )}
                </td>
                <td>
                  <div className={styles.nomeLinha}>
                    {l.nome}
                    <Badge bg="var(--color-neutral-bg)" fg="var(--color-neutral-fg)">{l.origem === "cadastro" ? "Cadastro" : "Histórico"}</Badge>
                  </div>
                  <span className={styles.sub}>{l.departamento}</span>
                </td>
                <td>{formatarDataIso(l.dataEfetivaIso)}</td>
                <td>
                  {MODALIDADES.find(([k]) => k === l.modalidadeConfirmada)?.[1] ?? (l.modalidade || <em>não consta</em>)}
                  {l.modalidadeConfirmada && l.modalidade && <span className={styles.sub}>Confirmada pelo RH</span>}
                </td>
                <td>
                  {l.rescisaoId === null ? (
                    <>
                      {l.rescisao.status === "validado" && l.rescisao.valor !== null ? (
                        <>
                          <span className={styles.valor}>{money(l.rescisao.valor)}</span> <ChipRescisao l={l} />
                          <span className={styles.sub}>Validada por {l.rescisao.validadaPor ?? "—"} · fonte: {l.rescisao.fonte === "demonstrativo_rescisao" ? "demonstrativo" : "outro documento"}</span>
                        </>
                      ) : l.rescisao.lancado !== null ? (
                        <>
                          <span className={styles.valor}>{money(l.rescisao.lancado)}</span> <ChipRescisao l={l} />
                        </>
                      ) : (
                        "—"
                      )}
                      <span className={styles.sub}>Lançamento manual (sem folha importada): só vale depois de validado</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.valor}>{money(l.rescisao.status === "validado" ? l.rescisao.valor ?? 0 : l.liquidoFolha ?? 0)}</span>{" "}
                      <ChipRescisao l={l} />
                      {l.rescisao.lancado !== null && l.rescisao.status !== "validado" && l.rescisao.lancado !== l.liquidoFolha && <span className={styles.sub}>Lançado: {money(l.rescisao.lancado)}</span>}
                      {l.rescisao.status === "validado" && l.rescisao.decisao === "manter_lancado" && <span className={styles.sub}>Mantido o valor lançado (decisão do RH)</span>}
                      {l.liquidoFolha === 0 && l.rescisao.status !== "validado" && <span className={styles.sub}>Líquido R$ 0,00: confira o demonstrativo</span>}
                    </>
                  )}
                </td>
                <td>
                  {l.grrf.status === "validado" ? (
                    <>
                      <span className={styles.valor}>{money(l.grrf.total ?? 0)}</span> <ChipGrrf l={l} />
                      {(l.grrf.deposito !== null || l.grrf.multa !== null) && <span className={styles.sub}>Depósito {money(l.grrf.deposito ?? 0)} · Multa {money(l.grrf.multa ?? 0)}</span>}
                    </>
                  ) : (
                    <>
                      <ChipGrrf l={l} />
                      {l.grrf.lancado !== null && <span className={styles.sub}>Lançada: {money(l.grrf.lancado)}</span>}
                      {l.fgtsRescisorioFolha !== null && <span className={styles.sub}>Folha: FGTS rescisório {money(l.fgtsRescisorioFolha)} (referência)</span>}
                    </>
                  )}
                </td>
                <td>
                  <div className={styles.celulaAcoes}>
                    {l.rescisaoId !== null && l.rescisao.status === "pendente" && (
                      <Button variant="primary" disabled={ocupado || !conf.instalado} onClick={() => validarUma(l)}>Validar rescisão</Button>
                    )}
                    {l.rescisao.status === "divergente" && (
                      <Button variant="danger" disabled={!conf.instalado} onClick={() => setDialogo({ tipo: "decidir", linha: l })}>Decidir divergência</Button>
                    )}
                    {l.rescisaoId !== null && (
                      <Button variant="secondary" disabled={!conf.instalado} onClick={() => setDialogo({ tipo: "grrf", linha: l })}>
                        {l.grrf.status === "pendente" ? "Registrar GRRF" : "Corrigir GRRF"}
                      </Button>
                    )}
                    {l.rescisaoId === null && l.colaboradorId !== null && l.rescisao.status === "pendente" && (
                      <Button variant="primary" disabled={!conf.instalado || l.rescisao.lancado === null} title={l.rescisao.lancado === null ? "Lance o valor na gaveta do desligado antes de validar." : undefined} onClick={() => setDialogo({ tipo: "manual", linha: l, componente: "rescisao" })}>
                        Validar rescisão
                      </Button>
                    )}
                    {l.rescisaoId === null && l.colaboradorId !== null && l.grrf.status === "pendente" && (
                      <Button variant="secondary" disabled={!conf.instalado} onClick={() => setDialogo({ tipo: "manual", linha: l, componente: "grrf" })}>
                        Validar GRRF
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7}>Nenhum desligamento neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className={styles.secaoConversoes}>
        <summary>Conversões de estágio para CLT ({conf.conversoes.length}) — não são desligamentos e não entram nos custos</summary>
        <div className={tableStyles.wrap} style={{ marginTop: 10 }}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Encerramento do estágio</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {conf.conversoes.map((l) => (
                <tr key={l.chave}>
                  <td>{l.nome}</td>
                  <td>{formatarDataIso(l.dataEfetivaIso)}</td>
                  <td>Continua na empresa (efetivado) — sem validação financeira</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {dialogo?.tipo === "zero" && <DialogoZero linha={dialogo.linha} onClose={() => setDialogo(null)} onMensagem={setMensagem} />}
      {dialogo?.tipo === "decidir" && <DialogoDecidir linha={dialogo.linha} onClose={() => setDialogo(null)} onMensagem={setMensagem} />}
      {dialogo?.tipo === "grrf" && <DialogoGrrf linha={dialogo.linha} onClose={() => setDialogo(null)} onMensagem={setMensagem} />}
      {dialogo?.tipo === "manual" && <DialogoValidarManual linha={dialogo.linha} componente={dialogo.componente} onClose={() => setDialogo(null)} onMensagem={setMensagem} />}
    </div>
  );
}

function DialogoZero({ linha: l, onClose, onMensagem }: { linha: LinhaConferencia; onClose: () => void; onMensagem: (m: string) => void }) {
  const { validarRescisoes } = usePortalData();
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    if (l.rescisaoId === null) return;
    setOcupado(true);
    const r = await validarRescisoes([{ rescisao_id: l.rescisaoId, zero_conferido: true }]);
    setOcupado(false);
    if (r.ok && r.resultados[0]?.resultado === "validada") {
      onMensagem(`Rescisão de ${l.nome} validada (líquido R$ 0,00 conferido).`);
      onClose();
    }
  }
  return (
    <Modal title="Líquido R$ 0,00" subtitle={l.nome} onClose={onClose} width={480}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!confirmo || ocupado} onClick={confirmar}>Validar rescisão zerada</Button></>}>
      <p>Na folha, os descontos igualam os proventos e o líquido é <strong>R$ 0,00</strong>. A rescisão passaria a valer R$ 0,00 nos custos.</p>
      <label className={styles.opcao}>
        <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
        <span>Conferi o demonstrativo individual e confirmo que o líquido da rescisão é R$ 0,00.</span>
      </label>
    </Modal>
  );
}

function DialogoDecidir({ linha: l, onClose, onMensagem }: { linha: LinhaConferencia; onClose: () => void; onMensagem: (m: string) => void }) {
  const { decidirDivergencia } = usePortalData();
  const [decisao, setDecisao] = useState<"adotar_folha" | "manter_lancado" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [zero, setZero] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const valor = decisao === "adotar_folha" ? l.liquidoFolha : decisao === "manter_lancado" ? l.rescisao.lancado : null;
  async function confirmar() {
    if (!decisao || l.rescisaoId === null) return;
    setOcupado(true);
    const r = await decidirDivergencia({ rescisaoId: l.rescisaoId, decisao, motivo: motivo.trim(), zeroConferido: zero });
    setOcupado(false);
    if (r.ok) {
      onMensagem(`Divergência de ${l.nome} decidida.`);
      onClose();
    } else setErro(r.error);
  }
  return (
    <Modal title="Decidir divergência" subtitle={`${l.nome} · ${formatarDataIso(l.dataEfetivaIso)}`} onClose={onClose} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!decisao || !motivo.trim() || ocupado || (valor === 0 && !zero)} onClick={confirmar}>Confirmar decisão</Button></>}>
      <p>O valor lançado difere do líquido da folha. Nada muda sem a sua decisão; o valor anterior fica registrado na trilha.</p>
      <label className={`${styles.opcao} ${decisao === "adotar_folha" ? styles.opcaoAtiva : ""}`}>
        <input type="radio" name="decisao" checked={decisao === "adotar_folha"} onChange={() => setDecisao("adotar_folha")} />
        <span><strong>Adotar o líquido da folha: {money(l.liquidoFolha ?? 0)}</strong><span className={styles.sub}>O lançamento passa a esse valor.</span></span>
      </label>
      <label className={`${styles.opcao} ${decisao === "manter_lancado" ? styles.opcaoAtiva : ""}`}>
        <input type="radio" name="decisao" checked={decisao === "manter_lancado"} onChange={() => setDecisao("manter_lancado")} />
        <span><strong>Manter o valor lançado: {money(l.rescisao.lancado ?? 0)}</strong><span className={styles.sub}>O lançamento é preservado e passa a valer como validado.</span></span>
      </label>
      <label className={styles.campoDialogo}>
        Motivo da decisão (ex.: demonstrativo individual conferido)
        <textarea rows={2} value={motivo} maxLength={1000} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {valor === 0 && (
        <label className={styles.opcao}>
          <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} />
          <span>Conferi o demonstrativo e confirmo o valor R$ 0,00.</span>
        </label>
      )}
      {erro && <div className={styles.erro}>{erro}</div>}
    </Modal>
  );
}

function DialogoGrrf({ linha: l, onClose, onMensagem }: { linha: LinhaConferencia; onClose: () => void; onMensagem: (m: string) => void }) {
  const { registrarGrrf, confirmarModalidade } = usePortalData();
  const jaRegistrada = l.grrf.status !== "pendente";
  const [naoAplicavel, setNaoAplicavel] = useState(l.grrf.status === "nao_aplicavel");
  const [deposito, setDeposito] = useState(l.grrf.deposito !== null ? String(l.grrf.deposito).replace(".", ",") : "");
  const [multa, setMulta] = useState(l.grrf.multa !== null ? String(l.grrf.multa).replace(".", ",") : "");
  const [total, setTotal] = useState(l.grrf.status === "validado" && l.grrf.total !== null ? String(l.grrf.total).replace(".", ",") : "");
  const [fonte, setFonte] = useState<FonteGrrf>(l.grrf.fonte ?? "guia_grrf");
  const [observacao, setObservacao] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [substituir, setSubstituir] = useState(false);
  const [pedeSubstituicao, setPedeSubstituicao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const semModalidade = !l.modalidade.trim() && !l.modalidadeConfirmada;

  const nDep = paraNumero(deposito);
  const nMulta = paraNumero(multa);
  const nTotal = paraNumero(total);
  const invalido = [nDep, nMulta, nTotal].some((n) => n !== null && Number.isNaN(n));
  const somaFecha = nDep === null || nMulta === null || nTotal === null || Math.abs(nTotal - (nDep + nMulta)) < 0.005;
  const podeEnviar = !ocupado && !(semModalidade && !modalidade) && (naoAplicavel ? observacao.trim().length > 0 : nTotal !== null && !invalido && somaFecha && (!jaRegistrada || observacao.trim().length > 0));

  async function confirmar() {
    setOcupado(true);
    setErro(null);
    if (semModalidade && modalidade) {
      const m = await confirmarModalidade(l.rescisaoId as number, modalidade);
      if (!m.ok) {
        setOcupado(false);
        setErro(m.error);
        return;
      }
    }
    const r = await registrarGrrf({
      rescisao_id: l.rescisaoId as number,
      ...(naoAplicavel ? { nao_aplicavel: true, motivo: observacao.trim() } : { deposito: nDep, multa: nMulta, total: nTotal, fonte, observacao: observacao.trim() || undefined }),
      confirmar_substituicao: substituir || undefined,
    });
    setOcupado(false);
    if (r.ok) {
      onMensagem(`GRRF de ${l.nome} ${naoAplicavel ? "marcada como não aplicável" : "registrada"}.`);
      onClose();
    } else if (/confirme a substituição/i.test(r.error)) {
      setPedeSubstituicao(true);
      setErro(r.error);
    } else setErro(r.error);
  }

  return (
    <Modal title={jaRegistrada ? "Corrigir GRRF" : "Registrar GRRF"} subtitle={`${l.nome} · ${formatarDataIso(l.dataEfetivaIso)}`} onClose={onClose} width={620}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!podeEnviar || (pedeSubstituicao && !substituir)} onClick={confirmar}>{ocupado ? "Gravando..." : "Registrar"}</Button></>}>
      <div className={styles.referencia}>
        Folha de rescisão (referência — <strong>não é usada como GRRF</strong>): FGTS rescisório {money(l.fgtsRescisorioFolha ?? 0)} · Saldo FGTS {money(l.saldoFgtsFolha ?? 0)}. Informe o que foi
        <strong> efetivamente recolhido</strong>, conforme a guia ou o demonstrativo.
        {l.grrf.lancado !== null && <> GRRF já lançada no cadastro: <strong>{money(l.grrf.lancado)}</strong>.</>}
      </div>
      {semModalidade && (
        <label className={styles.campoDialogo}>
          O relatório não informa a modalidade desta rescisão — confirme:
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
            <option value="">Selecione…</option>
            {MODALIDADES.map(([k, rot]) => <option key={k} value={k}>{rot}</option>)}
          </select>
        </label>
      )}
      <label className={styles.opcao}>
        <input type="checkbox" checked={naoAplicavel} onChange={(e) => setNaoAplicavel(e.target.checked)} />
        <span>Não há GRRF a recolher nesta rescisão (informe o motivo abaixo)</span>
      </label>
      {!naoAplicavel && (
        <>
          <div className={styles.gradeDialogo}>
            <label className={styles.campoDialogo}>Depósito rescisório (R$)<input value={deposito} inputMode="decimal" onChange={(e) => setDeposito(e.target.value)} placeholder="0,00" /></label>
            <label className={styles.campoDialogo}>Multa rescisória (R$)<input value={multa} inputMode="decimal" onChange={(e) => setMulta(e.target.value)} placeholder="0,00" /></label>
            <label className={styles.campoDialogo}>Total recolhido (R$) *<input value={total} inputMode="decimal" onChange={(e) => setTotal(e.target.value)} placeholder="0,00" /></label>
          </div>
          {!somaFecha && <div className={styles.erro}>O total não fecha com depósito + multa ({money((nDep ?? 0) + (nMulta ?? 0))}).</div>}
          <label className={styles.campoDialogo}>
            Fonte do valor *
            <select value={fonte} onChange={(e) => setFonte(e.target.value as FonteGrrf)}>
              {FONTES.map(([k, rot]) => <option key={k} value={k}>{rot}</option>)}
            </select>
          </label>
        </>
      )}
      <label className={styles.campoDialogo}>
        {naoAplicavel ? "Motivo *" : jaRegistrada ? "Motivo da correção *" : "Observação (opcional)"}
        <textarea rows={2} value={observacao} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} />
      </label>
      {pedeSubstituicao && (
        <label className={styles.opcao}>
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
          <span>Confirmo substituir o valor de GRRF já lançado no cadastro (o valor anterior fica registrado na trilha).</span>
        </label>
      )}
      {erro && <div className={styles.erro}>{erro}</div>}
    </Modal>
  );
}

/** Confirmação EXPRESSA de um lançamento manual (desligamento sem folha importada): o valor só passa a valer depois desta confirmação, com a fonte
 * documental (responsável e data ficam no servidor). GRRF "não se aplica" exige justificativa; um 0 lançado, sozinho, não resolve a GRRF. */
export function DialogoValidarManual({ linha: l, componente, onClose, onMensagem }: { linha: LinhaConferencia; componente: "rescisao" | "grrf"; onClose: () => void; onMensagem: (m: string) => void }) {
  const { validarLancamentoManual } = usePortalData();
  const ehRescisao = componente === "rescisao";
  const valor = ehRescisao ? l.rescisao.lancado : l.grrf.lancado;
  const [naoAplicavel, setNaoAplicavel] = useState(false);
  const [fonte, setFonte] = useState<string>(ehRescisao ? "demonstrativo_rescisao" : "guia_grrf");
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [zero, setZero] = useState(false);
  const [substituir, setSubstituir] = useState(false);
  const [pedeSubstituicao, setPedeSubstituicao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const exigeZero = !naoAplicavel && valor === 0;
  const podeEnviar = !ocupado && (naoAplicavel ? justificativa.trim().length > 0 : valor !== null && (!exigeZero || zero)) && (!pedeSubstituicao || substituir);
  const fontes: [string, string][] = ehRescisao ? [["demonstrativo_rescisao", "Demonstrativo da rescisão"], ["outro_documento", "Outro documento"]] : FONTES;

  async function confirmar() {
    if (l.colaboradorId === null) return;
    setOcupado(true);
    setErro(null);
    const r = await validarLancamentoManual({
      colaborador_nome: l.nome,
      componente,
      ...(naoAplicavel ? { nao_aplicavel: true, justificativa: justificativa.trim(), confirmar_substituicao: substituir || undefined } : { fonte, observacao: observacao.trim() || undefined, zero_conferido: zero || undefined }),
    });
    setOcupado(false);
    if (r.ok) {
      onMensagem(`${ehRescisao ? "Rescisão" : naoAplicavel ? "GRRF (não aplicável)" : "GRRF"} de ${l.nome} validada.`);
      onClose();
    } else {
      if (/confirme a substituição/i.test(r.error)) setPedeSubstituicao(true);
      setErro(r.error);
    }
  }

  return (
    <Modal title={ehRescisao ? "Validar rescisão lançada" : "Validar GRRF lançada"} subtitle={`${l.nome} · ${formatarDataIso(l.dataEfetivaIso)}`} onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!podeEnviar} onClick={confirmar}>{ocupado ? "Gravando..." : "Confirmar validação"}</Button></>}>
      <div className={styles.referencia}>
        Valor lançado: <strong>{valor === null ? "—" : money(valor)}</strong>. Lançar um valor não o valida: confirme que ele confere com o documento, informando a fonte. A data e o responsável da validação ficam registrados.
      </div>
      {!ehRescisao && (
        <label className={styles.opcao}>
          <input type="checkbox" checked={naoAplicavel} onChange={(e) => setNaoAplicavel(e.target.checked)} />
          <span>Não há GRRF a recolher nesta rescisão (R$ 0,00 resolvido) — exige justificativa</span>
        </label>
      )}
      {naoAplicavel ? (
        <label className={styles.campoDialogo}>
          Justificativa *
          <textarea rows={2} value={justificativa} maxLength={1000} onChange={(e) => setJustificativa(e.target.value)} />
        </label>
      ) : (
        <>
          <label className={styles.campoDialogo}>
            Fonte documental *
            <select value={fonte} onChange={(e) => setFonte(e.target.value)}>
              {fontes.map(([k, rot]) => <option key={k} value={k}>{rot}</option>)}
            </select>
          </label>
          <label className={styles.campoDialogo}>
            Observação (opcional)
            <textarea rows={2} value={observacao} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          {exigeZero && (
            <label className={styles.opcao}>
              <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} />
              <span>Conferi o documento e confirmo que o valor é R$ 0,00.</span>
            </label>
          )}
        </>
      )}
      {pedeSubstituicao && (
        <label className={styles.opcao}>
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
          <span>Confirmo substituir a GRRF lançada por "não aplicável" (o valor anterior fica na trilha).</span>
        </label>
      )}
      {erro && <div className={styles.erro}>{erro}</div>}
    </Modal>
  );
}
