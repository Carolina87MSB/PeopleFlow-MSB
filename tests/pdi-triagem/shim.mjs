// Mini-cliente "estilo supabase-js" sobre o PGlite, só com o subconjunto usado pelo código da LNT.
// Cada consulta roda com o papel real do Postgres (service_role / authenticated / anon), então
// grants, RLS e triggers da réplica valem de verdade. Consultas são serializadas (conexão única).
// PostgREST devolve datas e horários como texto ISO; o PGlite devolveria Date — igualamos o formato.
const PARSERS = { 1082: (v) => v, 1114: (v) => v.replace(" ", "T"), 1184: (v) => v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00") };
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

export function criarCliente(db, { papel, uid = null, sessao = null }) {
  let fila = Promise.resolve();
  const serial = (fn) => {
    const r = fila.then(fn, fn);
    fila = r.catch(() => {});
    return r;
  };

  class Q {
    constructor(tabela) { this.tabela = tabela; this.op = "select"; this.cols = "*"; this.filtros = []; this.ord = []; this.lim = null; this.rng = null; this.payload = null; this.retorna = false; this.modo = null; this.contar = false; this.head = false; }
    select(cols = "*", opts = {}) {
      if (this.op === "select") this.cols = cols; else { this.retorna = true; this.cols = cols; }
      if (opts.count) this.contar = true;
      if (opts.head) this.head = true;
      return this;
    }
    insert(p) { this.op = "insert"; this.payload = p; return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    eq(c, v) { this.filtros.push([c, "=", v]); return this; }
    neq(c, v) { this.filtros.push([c, "<>", v]); return this; }
    in(c, v) { this.filtros.push([c, "in", v]); return this; }
    is(c, v) { this.filtros.push([c, "is", v]); return this; }
    gte(c, v) { this.filtros.push([c, ">=", v]); return this; }
    lte(c, v) { this.filtros.push([c, "<=", v]); return this; }
    order(c, o = {}) { this.ord.push([c, o.ascending === false ? "desc" : "asc"]); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    single() { this.modo = "single"; return this; }
    maybeSingle() { this.modo = "maybe"; return this; }
    then(res, rej) { return serial(() => this.executar()).then(res, rej); }

    colunas() {
      if (this.cols.trim() === "*") return "*";
      return this.cols.split(",").map((c) => q(c.trim())).join(", ");
    }

    async executar() {
      const params = [];
      const p = (v) => { params.push(v); return "$" + params.length; };
      const val = (v) => (Array.isArray(v) ? v : v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);
      const where = () => {
        if (this.filtros.length === 0) return "";
        return " where " + this.filtros.map(([c, o, v]) => {
          if (o === "in") return `${q(c)} = any(${p(v)})`;
          if (o === "is") return v === null ? `${q(c)} is null` : `${q(c)} is ${v}`;
          return `${q(c)} ${o} ${p(v)}`;
        }).join(" and ");
      };
      let sql;
      if (this.op === "select") {
        if (this.head) sql = `select count(*)::int as n from public.${q(this.tabela)}${where()}`;
        else {
          sql = `select ${this.colunas()} from public.${q(this.tabela)}${where()}`;
          if (this.ord.length) sql += " order by " + this.ord.map(([c, d]) => `${q(c)} ${d}`).join(", ");
          if (this.rng) sql += ` limit ${this.rng[1] - this.rng[0] + 1} offset ${this.rng[0]}`;
          else if (this.lim != null) sql += ` limit ${this.lim}`;
        }
      } else if (this.op === "insert") {
        const linhas = Array.isArray(this.payload) ? this.payload : [this.payload];
        const chaves = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
        sql = `insert into public.${q(this.tabela)} (${chaves.map(q).join(", ")}) values ${linhas.map((l) => "(" + chaves.map((k) => (k in l ? p(val(l[k])) : "default")).join(", ") + ")").join(", ")}`;
        if (this.retorna) sql += ` returning ${this.colunas()}`;
      } else {
        const chaves = Object.keys(this.payload);
        sql = `update public.${q(this.tabela)} set ${chaves.map((k) => `${q(k)} = ${p(val(this.payload[k]))}`).join(", ")}${where()}`;
        if (this.retorna) sql += ` returning ${this.colunas()}`;
      }
      try {
        await db.exec("reset role");
        if (papel !== "postgres") {
          await db.exec(`set role ${papel}`);
          await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
        }
        const r = await db.query(sql, params, { parsers: PARSERS });
        await db.exec("reset role");
        if (this.op === "select" && this.head) return { data: null, count: r.rows[0].n, error: null };
        let data = r.rows;
        if (this.op !== "select" && !this.retorna) return { data: null, error: null };
        if (this.modo === "single") {
          if (data.length !== 1) return { data: null, error: { code: "PGRST116", message: "esperava 1 linha" } };
          data = data[0];
        } else if (this.modo === "maybe") {
          if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "mais de 1 linha" } };
          data = data[0] ?? null;
        }
        return { data, error: null };
      } catch (e) {
        try { await db.exec("reset role"); } catch { /* ignora */ }
        return { data: null, error: { code: e.code, message: e.message } };
      }
    }
  }

  return {
    from: (t) => new Q(t),
    // chamada de função do banco (somente funções de leitura nos testes): PostgREST passa os argumentos por nome
    rpc: (fn, args = {}) => serial(async () => {
      const nomes = Object.keys(args);
      const sql = `select public.${q(fn)}(${nomes.map((n, i) => `${q(n)} => $${i + 1}`).join(", ")}) as r`;
      try {
        await db.exec("reset role");
        if (papel !== "postgres") { await db.exec(`set role ${papel}`); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]); }
        const r = await db.query(sql, nomes.map((n) => args[n]));
        await db.exec("reset role");
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        try { await db.exec("reset role"); } catch { /* ignora */ }
        return { data: null, error: { code: e.code, message: e.message } };
      }
    }),
    auth: {
      getSession: async () => ({ data: { session: sessao ?? { access_token: "token-de-teste" } } }),
      // usado por exigirConta() do servidor: o token de teste é "tok:<uuid>"
      getUser: async (token) => (String(token).startsWith("tok:") ? { data: { user: { id: String(token).slice(4) } }, error: null } : { data: { user: null }, error: { message: "inválido" } }),
    },
  };
}
