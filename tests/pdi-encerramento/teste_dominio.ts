// PDI "Encerrado": regras de domínio, relatório de pendências, população dos dashboards e verificações estáticas do código das telas/store.
// Funções puras; dados fictícios.   cd tests && npm run test:pdi-encerramento-dominio
import { readFileSync } from "node:fs";
import { populacaoDashboard } from "../../src/domain/dashboardDesempenho.ts";
import { motivoSugeridoEncerramentoPdi, pdiEstaEncerrado, pdiFinalizado, pdiPodeSerConcluido, pdiPodeSerEncerrado, statusPdiAoSalvar } from "../../src/domain/pdi.ts";
import { pendenciasFrontDeDesligados } from "../../src/domain/pendenciasDesligados.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};
const src = (f: string) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

// ── helpers de status ──
check("só PDI aberto pode ser encerrado", pdiPodeSerEncerrado({ status: "Não iniciado" }) && pdiPodeSerEncerrado({ status: "Em andamento" }) && !pdiPodeSerEncerrado({ status: "Concluído" }) && !pdiPodeSerEncerrado({ status: "Encerrado" }));
check("Encerrado ≠ Concluído, mas ambos são 'finalizados'", pdiEstaEncerrado({ status: "Encerrado" }) && !pdiEstaEncerrado({ status: "Concluído" }) && pdiFinalizado({ status: "Encerrado" }) && pdiFinalizado({ status: "Concluído" }) && !pdiFinalizado({ status: "Em andamento" }));
check("salvar não reabre um PDI encerrado", statusPdiAoSalvar("Encerrado") === "Encerrado");
check("encerrar não conclui artificialmente: ações abertas continuam impedindo a conclusão", !pdiPodeSerConcluido({ itens: [{ acoes: [{ status: "Não iniciada" }] }], semCompetenciaDesenvolvimento: false }));
check("motivo sugerido usa a data de desligamento", motivoSugeridoEncerramentoPdi("09/out/2026") === "Colaborador desligado em 09/out/2026." && motivoSugeridoEncerramentoPdi("—") === "Colaborador desligado.");

// ── pendências: PDI encerrado deixa de ser pendência; os demais continuam ──
const col = (nome: string, extra: Record<string, unknown> = {}) => ({ id: Math.floor(Math.random() * 1e6), nome, desligado: false, dataDesligamento: "", admissaoIso: "2024-01-01", empresaAfiliada: false, ...extra });
const dados = {
  colaboradores: [col("Ativa Ana"), col("Liso Saiu", { desligado: true, dataDesligamento: "13/jul/2026" })],
  ciclos: [], avaliacoesDesempenho: [], avaliacoesPotencial: [], movimentacoes: [], desligamentosFinanceiros: [{ colaboradorNome: "Liso Saiu", valorRescisao: 1, valorGrrf: 1 }], hoje: "2026-10-19",
  pdi: [
    { id: 1, colaboradorNome: "Liso Saiu", ciclo: "2025", status: "Em andamento" },
    { id: 2, colaboradorNome: "Liso Saiu", ciclo: "2024", status: "Encerrado" },
    { id: 3, colaboradorNome: "Liso Saiu", ciclo: "2023", status: "Concluído" },
  ],
} as never;
const pend = pendenciasFrontDeDesligados(dados).filter((p) => p.modulo === "PDI").map((p) => p.referencia);
check("pendências: só o PDI ainda aberto de quem saiu (1); o encerrado (2) e o concluído (3) não são pendência", pend.join() === "1", pend.join());

// ── dashboards: PDI encerrado de desligado permanece no histórico; pendente de desligado fica de fora ──
const itens = [
  { colaboradorNome: "Ativa Ana", status: "Em andamento" },
  { colaboradorNome: "Liso Saiu", status: "Em andamento" },
  { colaboradorNome: "Liso Saiu", status: "Encerrado" },
  { colaboradorNome: "Liso Saiu", status: "Concluído" },
];
const pop = populacaoDashboard(itens, new Set(["Ativa Ana"]), new Set(["Liso Saiu"]), pdiFinalizado);
check("população dos dashboards: ativa + encerrado/concluído de desligado; 'em andamento' de desligado fica fora", pop.length === 3 && !pop.some((i) => i.colaboradorNome === "Liso Saiu" && i.status === "Em andamento"));

// ── código das telas e do store (verificações estáticas) ──
const store = src("src/store/usePortalData.ts");
const iEnc = store.indexOf('if (pdi.status === "Encerrado") return false; // encerrado é imutável, até para o RH');
const iRh = store.indexOf('if (perfil === "RH") return true;', iEnc);
check("store: PDI encerrado não é editável nem para o RH (a checagem vem ANTES do 'RH sempre')", iEnc > 0 && iRh > iEnc);
check("store: salvar/reabrir recusam PDI encerrado; encerrar é só do RH", /PDI encerrado não pode ser alterado/.test(store) && /PDI encerrado não pode ser reaberto/.test(store) && /Só o RH pode encerrar um PDI/.test(store));
const repo = src("src/repositories/pdiRepository.ts");
const toRow = repo.slice(repo.indexOf("function toRowPdi"), repo.indexOf("function toRowItem"));
check("repositório: o navegador NUNCA grava os campos de encerramento (só o servidor)", !/encerrado/.test(toRow));
check("repositório: o encerramento passa pela ação do servidor pdi_encerrar", /gravar<[^>]*>\("pdi_encerrar"/.test(repo));
const modal = src("src/features/desempenho/PdiModal.tsx");
check("tela: botão 'Encerrar por desligamento' só para RH + colaborador desligado + PDI aberto", /podeEncerrar = perfil === "RH" && colaboradorDesligado && pdiPodeSerEncerrado\(rascunho\)/.test(modal) && /Encerrar por desligamento/.test(modal));
check("tela: pede motivo, explica que nada é concluído/cancelado e que não há volta pela tela", /Motivo do encerramento/.test(modal) && /não são concluídas nem canceladas/.test(modal) && /não pode ser desfeita pela tela/.test(modal));
for (const aba of ["RH", "Diretoria", "Gestor"]) {
  const t = src(`src/features/desempenho/Dashboard${aba}Tab.tsx`);
  check(`dashboard ${aba}: contagem separada 'PDIs encerrados' e população com pdiFinalizado`, /label="PDIs encerrados"/.test(t) && /Encerrado: 0/.test(t) && /populacaoDashboard\([^)]*pdiFinalizado\)/.test(t));
}
const acoes = src("api/_lib/pdiEncerramentoAcoes.ts");
check("servidor: só RH, só desligado, só PDI aberto, grava apenas o cabeçalho (nenhum write em itens/ações)", /perfil !== "RH"/.test(acoes) && /linhaAtiva/.test(acoes) && !/from\("peopleflow_pdi_(itens|acoes)"\)\s*\.(update|insert|delete|upsert)/.test(acoes));
check("servidor: registra auditoria pdi_encerrado", /acao: "pdi_encerrado"/.test(acoes));

console.log(`\nPDI ENCERRAMENTO (domínio/telas): ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
