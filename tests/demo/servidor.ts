// Servidor LOCAL da demonstração: API real (api/desenvolvimento.ts) + um tradutor mínimo das consultas do navegador (estilo PostgREST) que roda
// com o papel e as regras de acesso (RLS) de cada pessoa. Banco em memória, pessoas fictícias. Nunca fala com o Supabase de produção.
import http from "node:http";
import { criarDemo, PESSOAS, porToken, type Demo } from "./banco.ts";
import { executarCenarios, type Resultado } from "./cenarios.ts";

const PORTA = Number(process.env.DEMO_API_PORT ?? 5190);
let demo: Demo;
let modo: "zero" | "completo" = "zero";
let resultado: Resultado | null = null;
let fila: Promise<unknown> = Promise.resolve();
/** Uma operação por vez: o banco em memória tem uma única conexão e o papel (RLS) é trocado por consulta. */
const exclusivo = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = fila.then(fn, fn);
  fila = p.catch(() => undefined);
  return p;
};

async function reiniciar(novo: "zero" | "completo") {
  demo = await criarDemo();
  modo = novo;
  resultado = null;
  if (novo === "completo") resultado = await executarCenarios(demo);
}

// ── Tradutor de consultas do navegador ──────────────────────────────────────────────────────────────────────────────
const ID = /^[a-z_][a-z0-9_]*$/;
const ident = (s: string) => {
  if (!ID.test(s)) throw new Error("identificador inválido: " + s);
  return `"${s}"`;
};
const partes = (s: string): string[] => {
  const out: string[] = [];
  let nivel = 0, atual = "";
  for (const ch of s) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { out.push(atual.trim()); atual = ""; } else atual += ch;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
};
const FK_CONTAGEM: Record<string, string> = { "peopleflow_dev_treinamentos>peopleflow_dev_participantes": "treinamento_id" };
const FK_OBJETO: Record<string, string> = { "peopleflow_dev_treinamento_necessidades>peopleflow_dev_necessidades": "necessidade_id" };

interface Corpo {
  persona: string;
  tabela: string;
  cols: string;
  count: boolean;
  head: boolean;
  filtros: { t: string; c: string; v?: unknown; op?: string }[];
  ordem: { c: string; asc: boolean; nullsFirst?: boolean }[];
  limite: number | null;
  faixa: [number, number] | null;
  modo: "lista" | "single" | "maybe";
}

function condicao(f: Corpo["filtros"][number], params: unknown[], alias: string): string {
  const col = `${alias}.${ident(f.c)}`;
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  switch (f.t) {
    case "eq": return `${col} = ${p(f.v)}`;
    case "neq": return `${col} <> ${p(f.v)}`;
    case "in": return (f.v as unknown[]).length ? `${col} in (${(f.v as unknown[]).map(p).join(",")})` : "false";
    case "is": return `${col} is null`;
    case "not": return `${col} is not null`;
    case "ilike": return `${col} ilike ${p(f.v)}`;
    case "or": {
      const exprs = partes(String(f.v)).map((e) => {
        const [c, op, ...resto] = e.split(".");
        const v = resto.join(".");
        const k = `${alias}.${ident(c)}`;
        if (op === "ilike") return `${k} ilike ${p(v)}`;
        if (op === "eq") return `${k}::text = ${p(v)}`;
        throw new Error("operador não suportado: " + op);
      });
      return `(${exprs.join(" or ")})`;
    }
    default: throw new Error("filtro não suportado: " + f.t);
  }
}

async function consultar(c: Corpo) {
  const pessoa = porToken(c.persona);
  if (!pessoa) throw new Error("pessoa desconhecida");
  const tabela = c.tabela;
  ident(tabela);
  const params: unknown[] = [];
  const embutidos: Record<string, string[]> = {};
  const principais = c.filtros.filter((f) => {
    if (f.c.includes(".")) {
      const [alias, col] = f.c.split(".");
      (embutidos[alias] ??= []).push(`e.${ident(col)} is null`);
      return false;
    }
    return true;
  });
  const cols = partes(c.cols).map((p) => {
    const m = p.match(/^([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)\((.*)\)$/s);
    if (!m) return p === "*" ? "t.*" : `t.${ident(p)}`;
    const [, alias, tab, interno] = m;
    if (interno === "count") {
      const fk = FK_CONTAGEM[`${tabela}>${tab}`];
      if (!fk) throw new Error("incorporação não suportada");
      return `json_build_array(json_build_object('count', (select count(*) from public.${ident(tab)} e where e.${ident(fk)} = t.id ${(embutidos[alias] ?? []).map((x) => "and " + x).join(" ")}))) as ${ident(alias)}`;
    }
    const fk = FK_OBJETO[`${tabela}>${tab}`];
    if (!fk) throw new Error("incorporação não suportada");
    const campos = partes(interno).map((x) => `e.${ident(x)}`).join(", ");
    return `(select to_jsonb(x) from (select ${campos} from public.${ident(tab)} e where e.id = t.${ident(fk)}) x) as ${ident(alias)}`;
  });
  const onde = principais.map((f) => condicao(f, params, "t")).join(" and ");
  const where = onde ? ` where ${onde}` : "";
  const ordem = c.ordem.length ? ` order by ${c.ordem.map((o) => `t.${ident(o.c)} ${o.asc ? "asc" : "desc"} nulls ${o.nullsFirst ? "first" : "last"}`).join(", ")}` : "";
  let pagina = "";
  if (c.faixa) pagina = ` limit ${Number(c.faixa[1]) - Number(c.faixa[0]) + 1} offset ${Number(c.faixa[0])}`;
  else if (c.limite) pagina = ` limit ${Number(c.limite)}`;
  await demo.db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${pessoa.uuid}',false);`);
  try {
    let total: number | null = null;
    if (c.count) total = Number((await demo.db.query(`select count(*)::int n from public.${ident(tabela)} t${where}`, params)).rows[0].n);
    if (c.head) return { data: null, count: total, error: null };
    const linhas = (await demo.db.query(`select ${cols.join(", ")} from public.${ident(tabela)} t${where}${ordem}${pagina}`, params)).rows as Record<string, unknown>[];
    if (c.modo === "single") return linhas.length === 1 ? { data: linhas[0], count: total, error: null } : { data: null, count: total, error: { code: "PGRST116", message: "no single row" } };
    if (c.modo === "maybe") return { data: linhas[0] ?? null, count: total, error: null };
    return { data: linhas, count: total, error: null };
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { data: null, count: null, error: { code: err.code, message: err.message } };
  } finally {
    await demo.db.exec("reset role;");
  }
}

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lerCorpo = (req: http.IncomingMessage) => new Promise<any>((ok) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { ok({}); } }); });
const enviar = (res: http.ServerResponse, status: number, corpo: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
};

await reiniciar((process.env.DEMO_MODO as "zero" | "completo") ?? "completo");

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/demo/estado") return enviar(res, 200, { modo, pessoas: PESSOAS.map((p) => ({ token: p.token, nome: p.nome, cargo: p.cargo, depto: p.depto, papel: p.papel, semConta: Boolean(p.semConta) })) });
      if (req.method === "GET" && url.pathname === "/demo/resultados") return enviar(res, 200, resultado);
      const corpo = await lerCorpo(req);
      if (req.method === "POST" && url.pathname === "/demo/reiniciar") {
        await exclusivo(() => reiniciar(corpo.modo === "zero" ? "zero" : "completo"));
        return enviar(res, 200, { ok: true, modo });
      }
      if (req.method === "POST" && url.pathname === "/demo/q") return enviar(res, 200, await exclusivo(() => consultar(corpo)));
      if (req.method === "POST" && url.pathname === "/demo/upload") {
        demo.fake.storage.from("desenvolvimento-evidencias")._simularUpload(String(corpo.path), Number(corpo.size) || 1, String(corpo.mime) || "application/pdf");
        return enviar(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/desenvolvimento") {
        const acao = url.searchParams.get("acao") ?? "";
        const auth = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        const r = await exclusivo(() => demo.chamar(auth, acao, corpo));
        return enviar(res, r.c || 500, r.b);
      }
      enviar(res, 404, { error: "não encontrado" });
    } catch (e) {
      enviar(res, 500, { error: (e as Error).message });
    }
  })
  .listen(PORTA, () => console.log(`Demonstração local: API em http://localhost:${PORTA} (modo ${modo}) — banco em memória, pessoas fictícias.`));
