// Preenche os campos exclusivos do PeopleFlow (vinculo, depto_code, nivel,
// gestor, admissao) nas linhas JÁ EXISTENTES da tabela `colaboradores`
// compartilhada com o Portal SST. NUNCA cria linha nova nem toca em
// cpf/nome/cargo/departamento/epis/exames — essas colunas são do SST.
//
// Casa cada registro com uma linha existente pelo `nome` (comparação exata).
// Se o nome não bater com nenhuma linha da tabela, o registro é ignorado e
// reportado no final — o script nunca insere colaborador novo.
//
// Uso:
//   node --env-file=.env.local scripts/seed-supabase.mjs src/data/colaboradores.local.json
//
// Pré-requisitos em .env.local (ver .env.example):
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Formato esperado do arquivo de entrada — ver src/data/colaboradores.example.json
// (fictício, versionado) para o shape completo: array de
//   { nome, vinculo, deptoCode, nivel, gestor, admissao }

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltam variáveis de ambiente. Rode com `node --env-file=.env.local scripts/seed-supabase.mjs <arquivo>`\n" +
      "e preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local (veja .env.example).\n" +
      "Use o MESMO projeto Supabase do Portal SST — as duas variáveis já existem no .env.local dele.",
  );
  process.exit(1);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error(
    "Informe o arquivo com o mapeamento nome -> vínculo/depto_code/nivel/gestor/admissao.\n" +
      "Ex.: node --env-file=.env.local scripts/seed-supabase.mjs src/data/colaboradores.local.json\n" +
      "Veja src/data/colaboradores.example.json para o formato esperado (arquivo fictício, versionado).",
  );
  process.exit(1);
}

let registros;
try {
  registros = JSON.parse(readFileSync(jsonPath, "utf-8"));
} catch (err) {
  console.error(`Não consegui ler ${jsonPath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(registros) || registros.length === 0) {
  console.error(`${jsonPath} não contém uma lista válida.`);
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

console.log(`Atualizando campos do PeopleFlow para ${registros.length} colaborador(es) a partir de ${jsonPath}...`);

let atualizados = 0;
const naoEncontrados = [];

for (const r of registros) {
  if (!r.nome) continue;
  const { data, error } = await supabase
    .from("colaboradores")
    .update({
      vinculo: r.vinculo ?? null,
      depto_code: r.deptoCode ?? null,
      nivel: r.nivel ?? null,
      gestor: r.gestor ?? null,
      admissao: r.admissao ?? null,
    })
    .eq("nome", r.nome)
    .select("nome");

  if (error) {
    console.error(`Falha ao atualizar "${r.nome}": ${error.message}`);
    continue;
  }
  if (!data || data.length === 0) {
    naoEncontrados.push(r.nome);
    continue;
  }
  atualizados++;
}

console.log(`OK — ${atualizados} colaborador(es) atualizado(s).`);
if (naoEncontrados.length > 0) {
  console.warn(
    `${naoEncontrados.length} nome(s) não encontrados na tabela colaboradores (nenhuma linha alterada para eles):`,
  );
  naoEncontrados.forEach((nome) => console.warn(`  - ${nome}`));
}
