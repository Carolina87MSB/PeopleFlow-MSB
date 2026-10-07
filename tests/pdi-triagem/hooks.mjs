import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const STUB_ADMIN = new URL("./stub-admin.mjs", import.meta.url).href;
const STUB_BROWSER = new URL("./stub-browser.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier.endsWith("/adminAuth.js")) return { url: STUB_ADMIN, shortCircuit: true };
  if (specifier.endsWith("/lib/supabaseClient")) return { url: STUB_BROWSER, shortCircuit: true };
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const abs = path.resolve(base, specifier);
    const candidatos = [abs, abs.replace(/\.js$/, ".ts"), abs + ".ts"];
    for (const c of candidatos) if (/\.ts$/.test(c) && existsSync(c)) return { url: pathToFileURL(c).href, shortCircuit: true };
  }
  return next(specifier, context);
}
