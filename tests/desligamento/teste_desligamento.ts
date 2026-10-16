// Efetivação cadastral do desligamento a partir da MP aprovada (api/_lib/desligamentos.ts), com banco falso em memória.
//   cd tests && npx tsx desligamento/teste_desligamento.ts
import { desligamentoJaVale, efetivarDesligamentos } from "../../api/_lib/desligamentos.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};

type Linha = Record<string, any>;
/** Banco falso: só o que a rotina usa (select/eq/is/update/eq/select) sobre tabelas em memória. */
function criarBanco(tabelas: Record<string, Linha[]>, falhaEm?: { tabela: string }) {
  const log: { tabela: string; op: string; valores?: Linha }[] = [];
  const from = (tabela: string) => {
    const filtros: ((l: Linha) => boolean)[] = [];
    let op: "select" | "update" = "select";
    let valores: Linha = {};
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
      is: (c: string, v: null) => (filtros.push((l) => (l[c] ?? null) === v), q),
      update: (v: Linha) => ((op = "update"), (valores = v), q),
      then: (ok2: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const alvo = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        if (op === "update") {
          if (falhaEm && falhaEm.tabela === tabela) return Promise.resolve({ data: null, error: { message: "falha simulada" } }).then(ok2, ko);
          for (const l of alvo) Object.assign(l, valores);
          log.push({ tabela, op: "update", valores });
        }
        return Promise.resolve({ data: alvo.map((l) => ({ ...l })), error: null }).then(ok2, ko);
      },
    };
    return q;
  };
  return { db: { from }, log, tabelas };
}

const mp = (id: string, extra: Linha = {}): Linha => ({
  id,
  tipo_cod: "DES",
  status: "Aprovado",
  colaborador: "Fulano Teste",
  colaborador_id: 10,
  sincronizado_em: null,
  desligamento_info: { nome: "Fulano Teste", motivo: "Novo emprego", dataIso: "2026-10-09" },
  ...extra,
});
const colab = (id: number, nome: string, extra: Linha = {}): Linha => ({ id, nome, desligado: false, data_desligamento: null, desligado_by: null, ...extra });
const HOJE = "2026-10-16";

// ── regra da data ──
check("data passada vale", desligamentoJaVale("2026-10-09", HOJE));
check("data de hoje vale", desligamentoJaVale(HOJE, HOJE));
check("data futura NÃO vale", !desligamentoJaVale("2026-10-17", HOJE));
check("sem data (ou inválida) vale hoje", desligamentoJaVale(undefined, HOJE) && desligamentoJaVale("", HOJE) && desligamentoJaVale("16/10/2026", HOJE));

// ── data passada (caso M-2026-031) ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-2026-031")], colaboradores: [colab(10, "Fulano Teste"), colab(11, "Outro Ativo")] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  const c = t.tabelas.colaboradores[0];
  check("passada: efetivado", r.length === 1 && r[0].situacao === "efetivado", JSON.stringify(r));
  check("passada: desligado=true, data da MP, motivo da MP e rastreio da MP", c.desligado === true && c.data_desligamento === "2026-10-09" && c.motivo_desligamento === "Novo emprego" && c.desligado_by === "PeopleFlow · M-2026-031", JSON.stringify(c));
  check("passada: MP marcada como sincronizada", Boolean(t.tabelas.peopleflow_movimentacoes[0].sincronizado_em));
  check("passada: outro colaborador intacto", t.tabelas.colaboradores[1].desligado === false);
  const r2 = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("idempotente: segunda execução não reprocessa (MP já sincronizada)", r2.length === 0 && t.log.filter((l) => l.tabela === "colaboradores").length === 1);
}
// ── data de hoje ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-1", { desligamento_info: { nome: "Fulano Teste", motivo: "x", dataIso: HOJE } })], colaboradores: [colab(10, "Fulano Teste")] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("hoje: efetivado agora com a data de hoje", r[0].situacao === "efetivado" && t.tabelas.colaboradores[0].data_desligamento === HOJE);
}
// ── data futura: permanece ativo; no dia indicado a rotina efetiva ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-2", { desligamento_info: { nome: "Fulano Teste", motivo: "x", dataIso: "2026-10-20" } })], colaboradores: [colab(10, "Fulano Teste")] });
  const antes = await efetivarDesligamentos(t.db, { hojeIso: "2026-10-19" });
  check("futura: continua Ativo e a MP não é marcada", antes[0].situacao === "agendado" && t.tabelas.colaboradores[0].desligado === false && !t.tabelas.peopleflow_movimentacoes[0].sincronizado_em);
  const dia = await efetivarDesligamentos(t.db, { hojeIso: "2026-10-20" });
  check("futura: na data indicada a rotina efetiva sozinha", dia[0].situacao === "efetivado" && t.tabelas.colaboradores[0].desligado === true && t.tabelas.colaboradores[0].data_desligamento === "2026-10-20");
}
// ── MP não aprovada nunca altera ──
for (const status of ["Em Aprovação", "Reprovado", "Rascunho"]) {
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-3", { status })], colaboradores: [colab(10, "Fulano Teste")] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check(`MP "${status}" não altera o cadastro`, r.length === 0 && t.tabelas.colaboradores[0].desligado === false);
}
// ── só Desligamento: Admissão, Promoção, Transferência não são tocadas ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-ADM", { tipo_cod: "ADM" }), mp("M-PRO", { tipo_cod: "PRO" }), mp("M-TRF", { tipo_cod: "TRF" })], colaboradores: [colab(10, "Fulano Teste")] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("Admissão/Promoção/Transferência aprovadas não geram desligamento", r.length === 0 && t.log.length === 0 && t.tabelas.colaboradores[0].desligado === false);
}
// ── SST já desligou: nunca reescreve ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-4")], colaboradores: [colab(10, "Fulano Teste", { desligado: true, data_desligamento: "2026-10-12", desligado_by: "rh@msb.com" })] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  const c = t.tabelas.colaboradores[0];
  check("já Desligado (ex.: pelo SST): preservado, sem reescrever data/autor", r[0].situacao === "ja_desligado" && c.data_desligamento === "2026-10-12" && c.desligado_by === "rh@msb.com" && t.log.length === 0);
}
// ── pendência no SST não impede nem é tocada ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-5")], colaboradores: [colab(10, "Fulano Teste")], peopleflow_desligamento_pendente: [{ colaborador_nome: "Fulano Teste", data_desligamento: "2026-10-09" }] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("com pendência no SST: efetiva e a linha da pendência continua intacta", r[0].situacao === "efetivado" && t.tabelas.peopleflow_desligamento_pendente.length === 1 && !t.log.some((l) => l.tabela === "peopleflow_desligamento_pendente"));
}
// ── casos de borda: nome ambíguo, não localizado, sem dados, falha ──
{
  const sem = (extra: Linha) => mp("M-6", { colaborador_id: null, ...extra });
  let t = criarBanco({ peopleflow_movimentacoes: [sem({})], colaboradores: [colab(10, "Fulano Teste"), colab(12, "Fulano Teste")] });
  let r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("homônimo sem id na MP: não adivinha, nada é alterado", r[0].situacao === "ambiguo" && t.tabelas.colaboradores.every((c) => c.desligado === false));
  t = criarBanco({ peopleflow_movimentacoes: [sem({})], colaboradores: [colab(10, "Ciclano")] });
  r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("nome não localizado: relata e não altera ninguém", r[0].situacao === "nao_localizado" && t.tabelas.colaboradores[0].desligado === false);
  t = criarBanco({ peopleflow_movimentacoes: [mp("M-7", { desligamento_info: { nome: "", motivo: "", dataIso: "2026-10-01" } })], colaboradores: [colab(10, "Fulano Teste")] });
  r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("MP sem nome/motivo: não efetiva", r[0].situacao === "sem_dados" && t.tabelas.colaboradores[0].desligado === false);
  t = criarBanco({ peopleflow_movimentacoes: [mp("M-8")], colaboradores: [colab(10, "Fulano Teste")] }, { tabela: "colaboradores" });
  r = await efetivarDesligamentos(t.db, { hojeIso: HOJE });
  check("falha de gravação: relata 'falha' e a MP NÃO é marcada (nova tentativa na próxima rotina)", r[0].situacao === "falha" && !t.tabelas.peopleflow_movimentacoes[0].sincronizado_em);
}
// ── dryRun ──
{
  const t = criarBanco({ peopleflow_movimentacoes: [mp("M-9")], colaboradores: [colab(10, "Fulano Teste")] });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE, dryRun: true });
  check("dryRun lista o que faria sem gravar nada", r[0].situacao === "efetivado" && t.log.length === 0 && t.tabelas.colaboradores[0].desligado === false);
}
// ── pedido por uma MP específica ──
{
  const t = criarBanco({
    peopleflow_movimentacoes: [mp("M-A"), mp("M-B", { colaborador_id: 11, desligamento_info: { nome: "Beltrano", motivo: "x", dataIso: "2026-10-01" } })],
    colaboradores: [colab(10, "Fulano Teste"), colab(11, "Beltrano")],
  });
  const r = await efetivarDesligamentos(t.db, { hojeIso: HOJE, movimentacaoId: "M-A" });
  check("pedido de uma MP efetiva só ela", r.length === 1 && t.tabelas.colaboradores[0].desligado === true && t.tabelas.colaboradores[1].desligado === false);
}

console.log(`\nDESLIGAMENTO: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
