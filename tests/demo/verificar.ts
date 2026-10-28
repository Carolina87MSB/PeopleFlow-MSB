// Executa os 10 cenários de homologação sobre o banco de demonstração (local, fictício) e imprime esperado × verificado.
import fs from "node:fs";
import { criarDemo } from "./banco.ts";
import { executarCenarios } from "./cenarios.ts";

const demo = await criarDemo();
const r = await executarCenarios(demo);
let falhas = 0;
for (const p of r.passos) {
  if (!p.ok) falhas++;
  console.log(`${p.ok ? "✓" : "✗"} [${p.cenario}] ${p.descricao}\n     esperado: ${p.esperado}\n     verificado: ${p.observado}`);
}
fs.writeFileSync(new URL("./resultado-homologacao.json", import.meta.url), JSON.stringify(r, null, 2));
console.log(`\n${r.passos.length - falhas} passos verificados, ${falhas} com falha`);
process.exit(falhas ? 1 : 0);
