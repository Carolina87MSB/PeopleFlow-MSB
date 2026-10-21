// Substituto mínimo do cliente supabase-js (service role) sobre PGlite, só para
// testar a lógica de api/_lib/desenvolvimentoAcoes.ts sem tocar no banco real.
// Suporta exatamente as cadeias usadas por aquele arquivo.
import type { PGlite } from "@electric-sql/pglite";

type Filtro = { col: string; op: "=" | "in" | "not null" | "is null" | "<>" | "or"; val?: unknown };

class Consulta {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private conflito = "";
  private cols = "*";
  private valores: Record<string, unknown>[] | Record<string, unknown> | null = null;
  private filtros: Filtro[] = [];
  private lim: number | null = null;
  private modo: "lista" | "single" | "maybe" = "lista";
  private db: PGlite;
  private tabela: string;
  constructor(db: PGlite, tabela: string) {
    this.db = db;
    this.tabela = tabela;
  }
  select(cols = "*") {
    this.cols = cols;
    return this;
  }
  insert(v: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.valores = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: Record<string, unknown>) {
    this.op = "update";
    this.valores = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(v: Record<string, unknown>, opts: { onConflict: string }) {
    this.op = "upsert";
    this.valores = [v];
    this.conflito = opts.onConflict;
    return this;
  }
  /** Só o formato "col.eq.valor,col2.eq.valor2" (usado pela sessão do módulo). */
  or(expr: string) {
    this.filtros.push({ col: "", op: "or", val: expr.split(",").map((g) => { const [c, , ...v] = g.split("."); return [c, v.join(".")]; }) });
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push({ col, op: "=", val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filtros.push({ col, op: "in", val });
    return this;
  }
  not(col: string) {
    this.filtros.push({ col, op: "not null" });
    return this;
  }
  is(col: string, _v: null) {
    this.filtros.push({ col, op: "is null" });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filtros.push({ col, op: "<>", val });
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  single() {
    this.modo = "single";
    return this.executar();
  }
  maybeSingle() {
    this.modo = "maybe";
    return this.executar();
  }
  then<R>(ok: (v: { data: unknown; error: unknown }) => R, erro?: (e: unknown) => R) {
    return this.executar().then(ok, erro);
  }
  private async executar(): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    const p: unknown[] = [];
    const ph = (v: unknown) => {
      p.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
      return `$${p.length}`;
    };
    const where = this.filtros.length
      ? " where " +
        this.filtros
          .map((f) =>
            f.op === "or" ? "(" + (f.val as string[][]).map(([c, v]) => `"${c}" = ${ph(v)}`).join(" or ") + ")"
            : f.op === "=" ? `"${f.col}" = ${ph(f.val)}`
            : f.op === "<>" ? `"${f.col}" <> ${ph(f.val)}`
            : f.op === "in" ? `"${f.col}" = any(${ph(f.val)})`
            : f.op === "is null" ? `"${f.col}" is null`
            : `"${f.col}" is not null`)
          .join(" and ")
      : "";
    const cols = this.cols
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c === "*" ? "*" : `"${c}"`))
      .join(", ");
    const t = `public."${this.tabela}"`;
    let sql = "";
    if (this.op === "select") sql = `select ${cols} from ${t}${where}${this.lim ? ` limit ${this.lim}` : ""}`;
    if (this.op === "upsert") {
      const l = (this.valores as Record<string, unknown>[])[0];
      const chaves = Object.keys(l);
      sql = `insert into ${t} (${chaves.map((k) => `"${k}"`).join(",")}) values (${chaves.map((k) => ph(l[k])).join(",")}) on conflict ("${this.conflito}") do update set ${chaves.filter((k) => k !== this.conflito).map((k) => `"${k}" = excluded."${k}"`).join(", ")} returning ${cols}`;
    }
    if (this.op === "insert") {
      const linhas = this.valores as Record<string, unknown>[];
      const chaves = Object.keys(linhas[0]);
      sql = `insert into ${t} (${chaves.map((k) => `"${k}"`).join(",")}) values ${linhas.map((l) => `(${chaves.map((k) => ph(l[k])).join(",")})`).join(",")} returning ${cols}`;
    }
    if (this.op === "update") {
      const v = this.valores as Record<string, unknown>;
      sql = `update ${t} set ${Object.keys(v)
        .map((k) => `"${k}" = ${ph(v[k])}`)
        .join(", ")}${where} returning ${cols}`;
    }
    if (this.op === "delete") sql = `delete from ${t}${where}`;
    try {
      const r = await this.db.query(sql, p);
      const rows = r.rows as Record<string, unknown>[];
      if (this.modo === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "no single row" } };
      if (this.modo === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (e) {
      const err = e as { code?: string; message: string };
      return { data: null, error: { code: err.code, message: err.message } };
    }
  }
}

/** usuarios: token → id (e-mail "<token>@teste") ou { id, email }. Storage simulado em memória. */
export function criarFake(db: PGlite, usuarios: Record<string, string | { id: string; email: string }>) {
  const objetos = new Map<string, { size: number; mimetype: string }>();
  const conteudos = new Map<string, Uint8Array>();
  return {
    from: (tabela: string) => new Consulta(db, tabela),
    /** Chamada de função do banco com argumentos nomeados (PostgREST /rpc). */
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const chaves = Object.keys(args);
      try {
        const r = await db.query(`select public."${fn}"(${chaves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, chaves.map((k) => args[k]));
        return { data: (r.rows[0] as { r: unknown } | undefined)?.r ?? null, error: null };
      } catch (e) {
        const err = e as { code?: string; message: string };
        return { data: null, error: { code: err.code, message: err.message } };
      }
    },
    auth: {
      getUser: async (token: string) => {
        const u = usuarios[token];
        if (!u) return { data: { user: null }, error: { message: "invalid" } };
        return { data: { user: typeof u === "string" ? { id: u, email: `${token}@teste` } : u }, error: null };
      },
    },
    storage: {
      objetos,
      conteudos,
      from: (bucket: string) => ({
        createSignedUploadUrl: async (caminho: string) => ({ data: { signedUrl: `https://fake/${bucket}/${caminho}`, token: "tok", path: caminho }, error: null }),
        list: async (pasta: string, opts: { search?: string }) => ({
          data: [...objetos.keys()].filter((k) => k.startsWith(`${bucket}/${pasta}/`) && (!opts?.search || k.endsWith(opts.search))).map((k) => ({ name: k.slice(k.lastIndexOf("/") + 1), metadata: objetos.get(k) })),
          error: null,
        }),
        createSignedUrl: async (caminho: string, _exp: number, opts?: { download?: string }) => ({ data: { signedUrl: `https://fake/assinada/${bucket}/${caminho}${opts?.download ? "?download" : ""}` }, error: null }),
        // upload feito pelo SERVIDOR (ex.: Lista de Presença gerada); guarda os bytes para o teste inspecionar
        upload: async (caminho: string, bytes: Uint8Array, opts: { contentType?: string; upsert?: boolean }) => {
          const chave = `${bucket}/${caminho}`;
          if (objetos.has(chave) && !opts?.upsert) return { data: null, error: { message: "The resource already exists" } };
          objetos.set(chave, { size: bytes.length, mimetype: opts?.contentType ?? "application/octet-stream" });
          conteudos.set(chave, bytes);
          return { data: { path: caminho }, error: null };
        },
        // usado só pelo teste para simular o upload feito pelo navegador
        _simularUpload: (caminho: string, size: number, mimetype: string) => objetos.set(`${bucket}/${caminho}`, { size, mimetype }),
      }),
    },
  };
}
