// Scripts LOCAIS de publicação do encerramento do PDI (supabase/publicacao_pdi_encerramento_*.local.sql): backup → migration → encerramento pela ação
// do servidor → validação final, numa réplica com dados FICTÍCIOS. Pulado se os arquivos locais não existirem.
//   cd tests && npm run test:pdi-encerramento-publicacao
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { rd, novaReplica, semearPdi, criarContador, PDI, REPO, U_RH } from "../pdi-triagem/base.mjs";

const NOMES = ["publicacao_pdi_encerramento_00_backup.local.sql", "publicacao_pdi_encerramento_03_validacao.local.sql"];
if (!NOMES.every((n) => fs.existsSync(REPO + "supabase/" + n))) {
  console.log("Scripts locais do PDI ausentes — teste pulado.");
  process.exit(0);
}
const C = criarContador();
const { check, secao } = C;
const R = await novaReplica();
const { db, sql, um } = R;
const { p1 } = await semearPdi(R);
const MIG7 = rd("desenvolvimento_fase7_triagem_pdi.sql");
await db.query(MIG7.slice(0, MIG7.indexOf("$mig$;", MIG7.indexOf("do $mig$")) + 6));
const falha = async (fn) => { try { await fn(); return null; } catch (e) { await db.exec("rollback").catch(() => {}); return String(e.message); } };

await db.exec(`insert into public.colaboradores (nome, cargo, departamento, gestor, desligado, data_desligamento, admissao) values ('Rita Desligada', 'Auxiliar', 'Produção', 'Gil Gestor', true, '2026-09-30', '2024-01-10')`);
const pRita = (await um(PDI.pdi("Rita Desligada"))).id;
await db.exec(`update public.peopleflow_pdi set status = 'Em andamento' where id = ${pRita};
  insert into public.peopleflow_pdi_itens (id, pdi_id, competencia_nome, tipo_competencia) values ('R1', ${pRita}, 'A', 'Tecnica'), ('R2', ${pRita}, 'B', 'Tecnica'), ('R3', ${pRita}, 'C', 'Tecnica');
  insert into public.peopleflow_pdi_acoes (id, item_id, descricao, status, ordem) select 'RA' || g, 'R' || (1 + g % 3), 'ação ' || g, 'Não iniciada', g from generate_series(1, 8) g`);
const BKP = fs.readFileSync(REPO + "supabase/publicacao_pdi_encerramento_00_backup.local.sql", "utf8");
// o script real aponta para o PDI 13; na réplica o PDI da Rita tem outro id
const VAL = fs.readFileSync(REPO + "supabase/publicacao_pdi_encerramento_03_validacao.local.sql", "utf8").replace(/13::bigint/g, `${pRita}::bigint`).replace(/pdi_id = 13/g, `pdi_id = ${pRita}`).replace(/p\.id <> 13/g, `p.id <> ${pRita}`).replace(/i\.pdi_id <> 13/g, `i.pdi_id <> ${pRita}`).replace(/entidade_id = '13'/g, `entidade_id = '${pRita}'`).replace(/;\s*$/, "");
const validar = async () => Object.fromEntries((await sql(VAL)).map((r) => [Number(r.n), r.ok]));

secao("Backup → migration → encerramento → validação final");
check("backup do PDI roda e confere (hash)", (await falha(() => db.exec(BKP))) === null);
const man = await sql(`select tabela, linhas from backup_pdi_encerramento_20261019._manifesto`);
check("manifesto cobre as 3 tabelas do PDI", ["peopleflow_pdi", "peopleflow_pdi_itens", "peopleflow_pdi_acoes"].every((t) => man.some((m) => m.tabela === t)), JSON.stringify(man));
check("rodar o backup de novo aborta sem sobrescrever", /já existe/.test(String(await falha(() => db.exec(BKP)))));
check("migration aplica depois do backup", (await falha(() => db.exec(rd("pdi_encerramento.sql")))) === null);
globalThis.__ADMIN = criarCliente(db, { papel: "service_role" });
globalThis.__BROWSER = { from: (t) => globalThis.__ADMIN.from(t), auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
const da = await import(pathToFileURL(REPO + "api/_lib/desenvolvimentoAcoes.ts").href);
const chamar = async (acao, corpo) => { const res = { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } }; await da.executarAcao(acao, { headers: { authorization: "Bearer tok:" + U_RH }, body: corpo }, res); return res; };
const antes = await validar();
check("antes de encerrar a validação aponta que o PDI ainda não está encerrado (#1 e #10 falsos)", antes[1] === false && antes[10] === false);
check("encerramento pelo servidor", (await chamar("pdi_encerrar", { pdi_id: pRita, motivo: "Colaboradora desligada." })).codigo === 200);
const v = await validar();
for (let n = 1; n <= 11; n++) check(`validação final #${n} verdadeira`, v[n] === true, `n=${n}`);
await db.exec(`update public.peopleflow_pdi set ciclo = 'alterado' where id = ${p1}`);
check("a validação detecta outro PDI alterado (#7 falha)", (await validar())[7] === false);

console.log(`\nPDI ENCERRAMENTO (publicação): ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
