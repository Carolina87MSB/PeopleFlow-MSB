// Regressão: "A sessão do módulo expirou" ao encerrar o PDI pela tela de Gestão de Desempenho.
// A ação pdi_encerrar exige a conta do módulo (validade de 12 h, renovada por `iniciarSessao`); a tela do PDI não a renovava. A correção renova a sessão antes
// de gravar. Aqui o repositório REAL do frontend fala com o servidor REAL (réplica PGlite) por um `fetch` simulado; dados fictícios.
//   cd tests && npm run test:pdi-encerramento-sessao
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, PDI, REPO, U_RH, U_G1 } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;
const R = await novaReplica();
const { db, um } = R;
const { p1 } = await semearPdi(R);
const MIG7 = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG7.slice(0, MIG7.indexOf("$mig$;", MIG7.indexOf("do $mig$")) + 6));
await db.exec(rd("pdi_encerramento.sql"));

await db.exec(`insert into public.colaboradores (nome, cargo, departamento, gestor, desligado, data_desligamento, admissao) values
  ('Rita Desligada', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-09-30', '2024-01-10'),
  ('Raul Desligado', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-08-30', '2024-01-10'),
  ('Rosa Desligada', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-08-15', '2024-01-10')`);
const pRita = (await um(PDI.pdi("Rita Desligada"))).id;
const pRaul = (await um(PDI.pdi("Raul Desligado"))).id;
const pRosa = (await um(PDI.pdi("Rosa Desligada"))).id;
await db.exec(`update public.peopleflow_pdi set status = 'Em andamento' where id in (${pRita}, ${pRosa}, ${p1}); update public.peopleflow_pdi set status = 'Concluído' where id = ${pRaul};
  insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia) values ('R1', ${pRita}, 'A', 'Tecnica'), ('S1', ${pRosa}, 'A', 'Tecnica');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) values ('RA1', 'R1', 'ação 1', 'Não iniciada', 1), ('SA1', 'S1', 'ação 1', 'Não iniciada', 1)`);

// ── "navegador": token da sessão atual e fetch simulado (sessão → renova a conta como o servidor; demais ações → servidor real) ──
let usuario = U_RH;
let modoSessao = "ok"; // ok | falha500 | semAcesso403 | naoInstalado
let chamadas = [];
globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "tok:" + usuario } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  const acao = new URL(String(url), "http://x").searchParams.get("acao");
  chamadas.push(acao);
  if (acao === "sessao") {
    if (modoSessao === "falha500") return resp(500, { error: "Falha ao abrir o módulo (500)." });
    if (modoSessao === "semAcesso403") return resp(403, { error: "Conta sem acesso ao PeopleFlow.", codigo: "sem_acesso" });
    if (modoSessao === "naoInstalado") return resp(200, { instalado: false, perfil: "RH" });
    await db.query(`update public.peopleflow_dev_contas set atualizado_em = now() where user_id = $1`, [usuario]); // o servidor renova a conta
    return resp(200, { instalado: true, perfil: usuario === U_RH ? "RH" : "Gestor", colaboradorId: usuario === U_RH ? 1 : 2, pessoas: [] });
  }
  const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
  await da.executarAcao(acao, { headers: { authorization: init.headers.Authorization }, body: JSON.parse(init.body) }, res);
  return resp(res.codigo, res.corpo);
};
const repo = await import(pathToFileURL(REPO + "src/repositories/pdiRepository.ts").href);
const dev = await import(pathToFileURL(REPO + "src/features/desenvolvimento/devRepository.ts").href);

const envelhecer = (uid) => db.query(`update public.peopleflow_dev_contas set atualizado_em = now() - interval '72 hours' where user_id = $1`, [uid]);
const nada = async () => ({
  encerrados: (await um(`select count(*)::int n from public.peopleflow_pdi where status = 'Encerrado'`)).n,
  aud: (await um(`select count(*)::int n from public.peopleflow_dev_auditoria where acao = 'pdi_encerrado'`)).n,
  pdis: (await um(`select md5(string_agg(to_jsonb(p)::text, '|' order by id)) h from public.peopleflow_pdi p`)).h,
});
const tenta = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message); } };

// ═══ A. O defeito original ═══
secao("A. Reprodução do defeito: conta do módulo vencida (72 h) → 401, nada gravado");
await envelhecer(U_RH);
const n0 = await nada();
chamadas = [];
const bug = await tenta(() => dev.gravar("pdi_encerrar", { pdi_id: pRita, motivo: "x" }));
check("gravar direto com a conta vencida → 'A sessão do módulo expirou'", /A sessão do módulo expirou/.test(String(bug)), String(bug));
check("e nada foi gravado", JSON.stringify(await nada()) === JSON.stringify(n0));

// ═══ B. Correção ═══
secao("B. Com a correção: o encerramento renova a sessão e conclui");
await envelhecer(U_RH);
chamadas = [];
const dados = await repo.encerrarPdiPorDesligamento(pRita, "Colaboradora desligada em 30/09/2026.");
check("encerrar com a conta vencida funciona", dados.status === "Encerrado" && /30\/09\/2026/.test(dados.encerradoMotivo) && dados.encerradoPor === "Ana RH", JSON.stringify(dados));
check("ordem das chamadas: sessão primeiro, depois pdi_encerrar", chamadas.join() === "sessao,pdi_encerrar", chamadas.join());
const idade = (await um(`select extract(epoch from (now() - atualizado_em))::int s from public.peopleflow_dev_contas where user_id = '${U_RH}'`)).s;
check("a conta do módulo foi renovada (idade ≈ 0)", idade < 30, String(idade));
check("exatamente 1 PDI encerrado e 1 evento de auditoria (sem duplicidade)", (await nada()).encerrados === 1 && (await nada()).aud === 1);
check("itens e ações do PDI preservados", (await um(`select count(*)::int n from public.peopleflow_pdi_itens where pdi_id = ${pRita}`)).n === 1 && (await um(`select status from public.peopleflow_pdi_acoes where id = 'RA1'`)).status === "Não iniciada");
const dup = await tenta(() => repo.encerrarPdiPorDesligamento(pRita, "de novo"));
check("repetir o encerramento é recusado e não duplica a auditoria", /já está encerrado/.test(String(dup)) && (await nada()).aud === 1, String(dup));

// ═══ C. Falha na renovação interrompe o encerramento ═══
secao("C. Falha ao renovar a sessão: o encerramento NÃO é enviado");
for (const [modo, esperado] of [["falha500", /Falha ao abrir o módulo/], ["semAcesso403", /sem acesso/i], ["naoInstalado", /não está instalado/]]) {
  modoSessao = modo;
  await envelhecer(U_RH);
  const antes = await nada();
  chamadas = [];
  const e = await tenta(() => repo.encerrarPdiPorDesligamento(pRosa, "teste"));
  check(`sessão ${modo}: erro claro (${esperado})`, esperado.test(String(e)), String(e));
  check(`sessão ${modo}: pdi_encerrar nem foi chamado; nada gravado`, chamadas.join() === "sessao" && JSON.stringify(await nada()) === JSON.stringify(antes), chamadas.join());
}
modoSessao = "ok";

// ═══ D. As validações do servidor continuam valendo depois da renovação ═══
secao("D. Validações preservadas: perfil RH, colaborador desligado, PDI aberto");
await envelhecer(U_RH);
const ativo = await tenta(() => repo.encerrarPdiPorDesligamento(p1, "teste"));
check("PDI de colaborador ATIVO é recusado", /não consta como desligado/.test(String(ativo)), String(ativo));
const concl = await tenta(() => repo.encerrarPdiPorDesligamento(pRaul, "teste"));
check("PDI concluído é recusado", /concluído/.test(String(concl)), String(concl));
usuario = U_G1;
await envelhecer(U_G1);
const gestor = await tenta(() => repo.encerrarPdiPorDesligamento(pRosa, "teste"));
check("Gestor é recusado (403 'Somente o RH'), mesmo com a sessão renovada", /Somente o RH/.test(String(gestor)), String(gestor));
usuario = U_RH;
check("nada além do PDI da Rita foi encerrado", (await nada()).encerrados === 1 && (await um(`select status from public.peopleflow_pdi where id = ${pRosa}`)).status === "Em andamento");

// ═══ E. Escopo da alteração ═══
secao("E. A correção está restrita ao fluxo de sessão");
const fonte = readFileSync(REPO + "src/repositories/pdiRepository.ts", "utf8");
const fn = fonte.slice(fonte.indexOf("export async function encerrarPdiPorDesligamento"));
check("iniciarSessao() vem antes de gravar(...pdi_encerrar...) na função", fn.indexOf("iniciarSessao()") > 0 && fn.indexOf("iniciarSessao()") < fn.indexOf('gravar<'));
check("o servidor não foi alterado: exigirConta e a validade de 12 h seguem iguais", /VALIDADE_SESSAO_MS = 12 \* 3600 \* 1000/.test(readFileSync(REPO + "api/_lib/desenvolvimentoAcoes.ts", "utf8")));

console.log(`\nPDI ENCERRAMENTO (sessão): ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
