// Fase 8C — cliente REAL da IA (SDK oficial da Anthropic) testado SEM rede e SEM chave: o `fetch` é substituído por um stub.
// Prova: o que é enviado (modelo vindo do ambiente, prompt, schema, sem parâmetros removidos), como a resposta é lida e como cada
// falha é traduzida. Nenhuma chamada externa acontece aqui.
//   cd tests && node --import ./pdi-triagem/register.mjs fase8/teste_cliente.mjs
import { pathToFileURL } from "node:url";
import { criarCliente } from "../pdi-triagem/shim.mjs";
import { REPO, criarContador } from "../pdi-triagem/base.mjs";

const C = criarContador();
const { check, secao } = C;
const cli = await import(pathToFileURL(REPO + "api/_lib/pdiIaCliente.ts").href);
const nucleo = await import(pathToFileURL(REPO + "api/_lib/pdiIaNucleo.ts").href);
void criarCliente;

const CHAVE = "sk-ant-chave-de-teste-nao-vazar";
const pedido = { sistema: nucleo.PROMPT_SISTEMA, usuario: "Interprete o item.\n{\"item\":{\"ref\":\"I1\"}}", schema: nucleo.SCHEMA_SAIDA };
const msgOk = (texto, extra = {}) => new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "modelo-que-respondeu", content: texto === null ? [] : [{ type: "text", text: texto }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 111, output_tokens: 77 }, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
const erroHttp = (status, tipo) => new Response(JSON.stringify({ type: "error", error: { type: tipo, message: "mensagem do provedor" } }), { status, headers: { "content-type": "application/json" } });
function stub(resposta) {
  const f = { pedidos: [], fetch: async (url, init) => { f.pedidos.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body ? JSON.parse(init.body) : null }); return typeof resposta === "function" ? resposta(init) : resposta; } };
  return f;
}
const novo = (cfg, st, extra = {}) => cli.criarClienteAnthropic({ chave: CHAVE, modelo: "modelo-do-ambiente", esforco: null, ...cfg }, { fetch: st.fetch, maxRetries: 0, ...extra });
const falha = async (c) => { try { await c.analisar(pedido); return null; } catch (e) { return e; } };

secao("1. Configuração por ambiente (modelo, chave e chave geral NÃO são fixos no código)");
{
  const e = (env) => cli.estadoIa(env);
  check("sem nada → indisponível (desabilitada)", e({}).disponivel === false && e({}).motivo === "desabilitada");
  check("habilitada mas sem chave → indisponível (sem_chave)", e({ PDI_IA_HABILITADA: "true" }).motivo === "sem_chave");
  check("habilitada com chave mas sem modelo → indisponível (sem_modelo): o modelo NÃO tem valor padrão no código", e({ PDI_IA_HABILITADA: "true", ANTHROPIC_API_KEY: CHAVE }).motivo === "sem_modelo");
  check("modelo e chave presentes mas IA desligada → indisponível (a chave geral manda)", e({ ANTHROPIC_API_KEY: CHAVE, PDI_IA_MODELO: "m", PDI_IA_HABILITADA: "false" }).motivo === "desabilitada");
  check("tudo configurado → disponível", e({ PDI_IA_HABILITADA: "true", ANTHROPIC_API_KEY: CHAVE, PDI_IA_MODELO: "qualquer-modelo" }).disponivel === true);
  check("PDI_IA_HABILITADA aceita só 'true' (qualquer outro valor desliga)", ["1", "sim", "yes", "TRUE ", "True"].map((v) => cli.estadoIa({ PDI_IA_HABILITADA: v, ANTHROPIC_API_KEY: CHAVE, PDI_IA_MODELO: "m" }).disponivel).join() === "false,false,false,true,true");
  check("obterClienteIa: null quando indisponível; cliente com o modelo do AMBIENTE quando disponível", cli.obterClienteIa({}) === null && cli.obterClienteIa({ PDI_IA_HABILITADA: "true", ANTHROPIC_API_KEY: CHAVE, PDI_IA_MODELO: "modelo-x" })?.modelo === "modelo-x");
  check("esforço: só valores conhecidos são aceitos", cli.lerConfigIa({ PDI_IA_ESFORCO: "medium" }).esforco === "medium" && cli.lerConfigIa({ PDI_IA_ESFORCO: "turbo" }).esforco === null && cli.lerConfigIa({}).esforco === null);
  check("mensagens de indisponibilidade falam do fluxo manual", Object.values(cli.MENSAGEM_INDISPONIVEL).every((m) => /fluxo manual/.test(m)));
}

secao("2. O que é enviado ao provedor");
{
  const st = stub(msgOk(JSON.stringify({ resultado: "x" })));
  const c = novo({}, st);
  const r = await c.analisar(pedido);
  const q = st.pedidos[0];
  check("uma única requisição POST para /v1/messages", st.pedidos.length === 1 && q.url.endsWith("/v1/messages"));
  check("o modelo enviado é o do ambiente (não fixo no código)", q.body.model === "modelo-do-ambiente" && c.modelo === "modelo-do-ambiente");
  check("a chave vai SÓ no cabeçalho de autenticação, nunca no corpo", q.headers.get("x-api-key") === CHAVE && !JSON.stringify(q.body).includes(CHAVE));
  check("o prompt de sistema e a mensagem do usuário vão como estão; limite de saída definido", q.body.system === nucleo.PROMPT_SISTEMA && q.body.messages.length === 1 && q.body.messages[0].role === "user" && q.body.messages[0].content === pedido.usuario && q.body.max_tokens === 4000);
  check("formato estruturado: output_config.format = json_schema com o schema versionado", q.body.output_config.format.type === "json_schema" && JSON.stringify(q.body.output_config.format.schema) === JSON.stringify(nucleo.SCHEMA_SAIDA));
  check("sem esforço configurado, 'effort' NÃO é enviado; e nada de thinking, temperature, top_p, top_k, prefill ou tool_choice", q.body.output_config.effort === undefined && !("thinking" in q.body) && !("temperature" in q.body) && !("top_p" in q.body) && !("top_k" in q.body) && !("tool_choice" in q.body) && !("tools" in q.body) && q.body.messages.at(-1).role === "user");
  check("a resposta é lida: JSON interpretado, modelo que respondeu e uso de tokens", r.bruto.resultado === "x" && r.modelo === "modelo-que-respondeu" && r.tokensEntrada === 111 && r.tokensSaida === 77);
  const st2 = stub(msgOk("{}"));
  await novo({ esforco: "medium" }, st2).analisar(pedido);
  check("com PDI_IA_ESFORCO configurado, o esforço vai em output_config.effort", st2.pedidos[0].body.output_config.effort === "medium");
}

secao("3. Falhas do provedor traduzidas (sem vazar chave nem mensagem crua)");
{
  const casos = [
    ["recusa de segurança (stop_reason refusal)", stub(msgOk("{}", { stop_reason: "refusal" })), "recusada", true],
    ["resposta cortada (max_tokens)", stub(msgOk("{\"resultado\":", { stop_reason: "max_tokens" })), "truncada", true],
    ["sem bloco de texto", stub(msgOk(null)), "sem_texto", true],
    ["texto que não é JSON", stub(msgOk("isto não é json")), "json_invalido", true],
    ["429 limite de uso", stub(erroHttp(429, "rate_limit_error")), "limite", true],
    ["401 chave recusada", stub(erroHttp(401, "authentication_error")), "autenticacao", false],
    ["403 sem permissão", stub(erroHttp(403, "permission_error")), "autenticacao", false],
    ["500 erro do provedor", stub(erroHttp(500, "api_error")), "http", true],
    ["529 sobrecarga", stub(erroHttp(529, "overloaded_error")), "http", true],
    ["400 requisição inválida", stub(erroHttp(400, "invalid_request_error")), "http", false],
  ];
  for (const [nome, st, codigo, retentavel] of casos) {
    const e = await falha(novo({}, st));
    check(`${nome} → ErroIa '${codigo}' (retentável: ${retentavel})`, e instanceof cli.ErroIa && e.codigo === codigo && e.retentavel === retentavel, `${e?.codigo} ${e?.message}`);
    check(`  …a mensagem do erro não contém a chave nem texto cru do provedor`, !String(e?.message).includes(CHAVE) && !String(e?.message).includes("mensagem do provedor"));
  }
  const rede = await falha(novo({}, { fetch: async () => { throw new TypeError("fetch failed"); }, pedidos: [] }));
  check("falha de rede (DNS/conexão) → 'indisponivel' (retentável)", rede?.codigo === "indisponivel" && rede.retentavel === true, `${rede?.codigo}`);
  const lento = await falha(novo({}, { pedidos: [], fetch: (url, init) => new Promise((ok, ko) => { init.signal?.addEventListener("abort", () => ko(Object.assign(new Error("abortado"), { name: "AbortError" }))); setTimeout(() => ok(msgOk("{}")), 1500); }) }, { timeoutMs: 60 }));
  check("TIMEOUT do cliente → 'timeout' (retentável)", lento?.codigo === "timeout" && lento.retentavel === true, `${lento?.codigo} ${lento?.message}`);
}

console.log(`\nRESUMO: ${C.ok} verificações OK, ${C.falhas} falha(s)`);
process.exit(C.falhas ? 1 : 0);
