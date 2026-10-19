// Migration supabase/desligamentos_historico_e_situacao.sql numa réplica PGlite (nunca toca no Supabase real; dados fictícios):
// regra SQL × regra TS (paridade), estrutura, guardas, idempotência, ausência de dupla contagem, permissões e reversão.
//   cd tests && npx tsx desligamentos/teste_sql.mjs   (ou: npm run test:desligamentos-sql)
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url)).replace(/\\/g, "/");
const rd = (f) => fs.readFileSync(REPO + "supabase/" + f, "utf8");
const { PGlite } = await import("@electric-sql/pglite");
const { situacaoFuncionalEm } = await import("../../src/domain/situacaoFuncional.ts");

let ok = 0;
let falhas = 0;
const check = (nome, cond, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create table public.colaboradores (id bigint generated always as identity primary key, nome text not null, cargo text, departamento text, gestor text,
    desligado boolean not null default false, data_desligamento date, admissao date, empresa_afiliada boolean default false);
  grant select on public.colaboradores to authenticated, service_role;
`);
// a MESMA função de normalização de nomes da Fase 2 (extraída do arquivo real)
const f2 = rd("desenvolvimento_fase2.sql");
const ini = f2.indexOf("create or replace function public.peopleflow_dev_normalizar_nome");
const fim = f2.indexOf("$$;", ini) + 3;
await db.exec(f2.slice(ini, fim));
await db.exec("grant execute on function public.peopleflow_dev_normalizar_nome(text) to service_role;");

const MIG = rd("desligamentos_historico_e_situacao.sql");
const sql = async (t, p = []) => {
  await db.exec("reset role");
  return (await db.query(t, p)).rows;
};
const erro = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    // scripts com `begin;` deixam a transação abortada quando falham (no SQL Editor também: nada é gravado) — encerra para seguir testando
    await db.exec("rollback").catch(() => {});
    return String(e.message);
  }
};

// ── pré-condição: sem a função da Fase 2 a migration aborta sem gravar nada ──
{
  const vazio = new PGlite();
  await vazio.exec("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create table public.colaboradores (id bigint primary key, nome text);");
  const e = await erro(() => vazio.exec(MIG));
  check("pré-condição: sem peopleflow_dev_normalizar_nome a migration aborta", e !== null && /PRÉ-CONDIÇÃO/.test(e), String(e));
  await vazio.exec("rollback"); // a migration abre transação; a falha a deixa abortada (no SQL Editor o mesmo acontece e nada é gravado)
  check("pré-condição: nada ficou pela metade", (await vazio.query("select to_regclass('public.peopleflow_rescisoes_historico') is null as nada")).rows[0].nada === true);
}

await db.exec(MIG);
check("migration aplicada", (await sql("select to_regclass('public.peopleflow_rescisoes_historico') is not null as t"))[0].t);
await db.exec(MIG);
check("reaplicável (idempotente) sem erro", true);

// ── paridade TS × SQL: grade completa de combinações ──
{
  const adms = [null, "2024-01-10", "2026-10-16", "2026-12-01"];
  const flags = [false, true];
  const datas = [null, "2026-03-01", "2026-10-16", "2026-11-30"];
  const refs = ["2026-03-01", "2026-10-15", "2026-10-16", "2026-10-17", "2027-01-01"];
  const escopos = ["quadro", "operacional", "acesso"];
  const hoje = "2026-10-16";
  let n = 0;
  let div = 0;
  for (const adm of adms)
    for (const desligado of flags)
      for (const dd of datas)
        for (const afil of flags)
          for (const ref of refs)
            for (const esc of escopos) {
              const ts = situacaoFuncionalEm({ admissao: adm, desligado, dataDesligamento: dd, empresaAfiliada: afil }, ref, esc, hoje).situacao;
              const pg = (await sql("select public.peopleflow_situacao_funcional_em($1::date,$2,$3::date,$4,$5::date,$6,$7::date) as s", [adm, desligado, dd, afil, ref, esc, hoje]))[0].s;
              n++;
              if (ts !== pg) {
                div++;
                if (div <= 5) console.log("  divergência:", { adm, desligado, dd, afil, ref, esc, ts, pg });
              }
            }
  check(`paridade TS × SQL em ${n} combinações`, div === 0, `${div} divergências`);
  check("escopo inválido é recusado", /escopo inválido/.test((await erro(() => sql("select public.peopleflow_situacao_funcional_em(null,false,null,false,'2026-01-01','x')"))) ?? ""));
  check("peopleflow_ativo_em é a mesma regra", (await sql("select public.peopleflow_ativo_em('2024-01-10',false,null,false,'2026-10-16','quadro','2026-10-16') as a"))[0].a === true);
}

// ── histórico: estrutura, carga fictícia, idempotência ──
await db.exec(`
  insert into public.colaboradores (nome, cargo, departamento, desligado, data_desligamento, admissao) values
    ('Ana Teste Souza', 'Analista', 'Produção', true, '2026-07-13', '2024-02-01'),
    ('Beto Efetivado Lima', 'Analista', 'Engenharia', false, null, '2026-02-03'),
    ('Caio Sem Rescisao', 'Analista', 'Engenharia', false, null, '2024-05-05'),
    ('Dora Sem Cadastro', 'Analista', 'Produção', true, '2026-02-02', '2023-03-03');
`);
const ins = (cod, nome, adm, dem, nat, extra = "") =>
  `insert into public.peopleflow_rescisoes_historico (relatorio_emitido_em, codigo_folha, nome, admissao, demissao, tipo_rescisao, departamento, natureza ${extra ? ", " + extra.split("|")[0] : ""})
   values ('2026-10-19', ${cod}, '${nome}', '${adm}', '${dem}', 'Demitido sem justa causa', 'Produção', '${nat}' ${extra ? ", " + extra.split("|")[1] : ""}) on conflict (empresa_codigo, codigo_folha, demissao) do nothing`;
await db.exec(ins(1, "Ana Teste Souza", "2024-02-01", "2026-07-13", "saida_efetiva", "colaborador_id|1"));
await db.exec(ins(2, "Dora Sem Cadastro", "2023-03-03", "2026-02-02", "saida_efetiva"));
await db.exec(ins(3, "Beto Efetivado Lima", "2025-08-05", "2026-02-02", "conversao_estagio_clt", "colaborador_id, efetivacao_em|2, '2026-02-03'"));
await db.exec(ins(2, "Dora Sem Cadastro", "2023-03-03", "2026-02-02", "saida_efetiva"));
check("carga idempotente: reinserir o mesmo identificador não duplica", (await sql("select count(*)::int as n from public.peopleflow_rescisoes_historico"))[0].n === 3);
check("nome normalizado gerado (sem acento, minúsculo)", (await sql("select nome_normalizado from public.peopleflow_rescisoes_historico where codigo_folha = 2"))[0].nome_normalizado === "dora sem cadastro");
check("identificador único recusa a mesma rescisão com outro texto", (await erro(() => db.exec(ins(2, "Outro Nome", "2023-03-03", "2026-02-02", "saida_efetiva").replace("on conflict (empresa_codigo, codigo_folha, demissao) do nothing", "")))) !== null);
check("CHECK: demissão não pode ser anterior à admissão", (await erro(() => db.exec(ins(9, "X Y", "2026-05-01", "2026-04-01", "saida_efetiva")))) !== null);
check("CHECK: conversão exige vínculo com o cadastro e data de efetivação", (await erro(() => db.exec(ins(10, "Beto Efetivado Lima", "2025-08-05", "2026-03-01", "conversao_estagio_clt")))) !== null);
check("CHECK: saída efetiva não tem data de efetivação", (await erro(() => db.exec(ins(11, "Z W", "2024-01-01", "2026-03-01", "saida_efetiva", "efetivacao_em|'2026-03-02'")))) !== null);
check("natureza fora da lista é recusada", (await erro(() => db.exec(ins(12, "Q R", "2024-01-01", "2026-03-01", "outra")))) !== null);

// ── guardas de imutabilidade ──
check("não permite apagar histórico", /não são excluídos/.test((await erro(() => db.exec("delete from public.peopleflow_rescisoes_historico where codigo_folha = 2"))) ?? ""));
check("não permite alterar a data de demissão", /não podem ser alterados/.test((await erro(() => db.exec("update public.peopleflow_rescisoes_historico set demissao = '2026-02-03' where codigo_folha = 2"))) ?? ""));
check("não permite alterar o nome", (await erro(() => db.exec("update public.peopleflow_rescisoes_historico set nome = 'Outra Pessoa' where codigo_folha = 2"))) !== null);
check("não permite trocar a natureza", (await erro(() => db.exec("update public.peopleflow_rescisoes_historico set natureza = 'conversao_estagio_clt' where codigo_folha = 2"))) !== null);
check("permite ligar ao cadastro uma única vez (null → id)", (await erro(() => db.exec("update public.peopleflow_rescisoes_historico set colaborador_id = 4, departamento = 'Produção', departamento_origem = 'cadastro' where codigo_folha = 2"))) === null);
check("não permite trocar o vínculo já definido", /vínculo com o cadastro/.test((await erro(() => db.exec("update public.peopleflow_rescisoes_historico set colaborador_id = 1 where codigo_folha = 2"))) ?? ""));
await db.exec("update public.peopleflow_rescisoes_historico set observacao = 'ok' where codigo_folha = 3");
check("permite anotar observação", (await sql("select observacao from public.peopleflow_rescisoes_historico where codigo_folha = 3"))[0].observacao === "ok");

// ── view de contáveis: sem dupla contagem ──
{
  await db.exec("insert into public.peopleflow_rescisoes_historico (relatorio_emitido_em, codigo_folha, nome, admissao, demissao, natureza) values ('2026-10-19', 20, 'Eva Futura Cadastrada', '2022-01-01', '2026-04-04', 'saida_efetiva')");
  let r = await sql("select codigo_folha from public.peopleflow_v_rescisoes_historico_contaveis order by codigo_folha");
  check("contáveis: só saída efetiva SEM cadastro (Eva; Dora já ligada ao cadastro; Ana ligada; Beto é conversão)", r.map((x) => x.codigo_folha).join() === "20", JSON.stringify(r));
  await db.exec("insert into public.colaboradores (nome, cargo, departamento, desligado, data_desligamento, admissao) values ('Eva Futura Cadastrada', 'Analista', 'Produção', true, '2026-04-04', '2022-01-01')");
  r = await sql("select codigo_folha from public.peopleflow_v_rescisoes_historico_contaveis order by codigo_folha");
  check("dupla contagem impedida: se a pessoa for cadastrada depois, o histórico deixa de contá-la", r.length === 0, JSON.stringify(r));
}

// ── rubricas: só servidor ──
await db.exec("insert into public.peopleflow_rescisoes_historico_rubricas (rescisao_id, liquido) select id, 100.00 from public.peopleflow_rescisoes_historico where codigo_folha = 2");
check("rubricas gravadas com natureza não validada", (await sql("select natureza_validada from public.peopleflow_rescisoes_historico_rubricas"))[0].natureza_validada === false);
check("authenticated NÃO lê rubricas", (await sql("select has_table_privilege('authenticated','public.peopleflow_rescisoes_historico_rubricas','select') as p"))[0].p === false);
check("authenticated lê o histórico mas não escreve", (await sql("select has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','select') as s, has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','insert') as i, has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','update') as u"))[0].s === true);
{
  const p = (await sql("select has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','insert') as i, has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','update') as u, has_table_privilege('authenticated','public.peopleflow_rescisoes_historico','delete') as d"))[0];
  check("authenticated sem insert/update/delete no histórico", !p.i && !p.u && !p.d);
}
check("colaboradores intacto pela migration (4 linhas + Eva do teste)", (await sql("select count(*)::int as n from public.colaboradores"))[0].n === 5);
check("a conversão não alterou o cadastro: Beto continua ativo", (await sql("select desligado from public.colaboradores where nome = 'Beto Efetivado Lima'"))[0].desligado === false);

// ── validação oficial (somente leitura) roda sem FALHA ──
{
  const val = rd("desligamentos_historico_e_situacao_validacao.sql");
  const blocos = val.split(/;\s*\n/).map((b) => b.trim()).filter((b) => /^(with|select)/i.test(b.replace(/^(--.*\n)+/g, "").trim()));
  let falhasVal = [];
  for (const b of blocos) {
    const r = (await db.query(b)).rows;
    for (const l of r) if (l.resultado === "FALHA") falhasVal.push(l.verificacao);
  }
  check("validação oficial: nenhuma FALHA", falhasVal.length === 0, falhasVal.join(" | "));
}

// ── reversão: recusa com dados; com autorização remove só o que criou ──
{
  const rb = rd("desligamentos_historico_e_situacao_rollback.sql");
  const e = await erro(() => db.exec(rb));
  check("reversão recusa quando há dados", e !== null && /REVERSÃO RECUSADA/.test(e), String(e));
  check("reversão recusada não removeu nada", (await sql("select to_regclass('public.peopleflow_rescisoes_historico') is not null as t"))[0].t);
  await db.exec(rb.replace("v_permitir_perda boolean := false;", "v_permitir_perda boolean := true;"));
  check("reversão autorizada remove tabelas, guardas e funções", (await sql("select to_regclass('public.peopleflow_rescisoes_historico') is null and to_regprocedure('public.peopleflow_ativo_em(date,boolean,date,boolean,date,text,date)') is null as t"))[0].t);
  check("reversão não tocou em colaboradores", (await sql("select count(*)::int as n from public.colaboradores"))[0].n === 5);
  await db.exec(MIG);
  check("depois da reversão a migration reaplica", (await sql("select to_regclass('public.peopleflow_rescisoes_historico') is not null as t"))[0].t);
}

console.log(`\nDESLIGAMENTOS SQL: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
