// Tela Feedback: a equipe de hoje (gestor no cadastro) sempre aparece, sem tirar quem já estava na lista. Dados fictícios.
//   cd tests && npx tsx feedback/teste_equipe.ts
import { colaboradoresParaFeedbackDe } from "../../src/domain/feedback.ts";
import type { Colaborador, Perfil } from "../../src/types/domain.ts";

let ok = 0;
let falhas = 0;
const check = (nome: string, cond: boolean, det = "") => {
  if (cond) ok++;
  else {
    falhas++;
    console.log("  FALHOU:", nome, det);
  }
};

const c = (nome: string, gestor: string, extra: Partial<Colaborador> = {}) => ({ nome, gestor, cargo: "x", depto: "x", desligado: false, ...extra }) as Colaborador;
// Situação real, com nomes fictícios: Lia (inspetora) hoje reporta à Rita, mas foi avaliada na AVD pela Tânia; Bia (líder) reporta à Tânia, mas foi avaliada na AVD pela Rita.
const lia = c("Lia", "Rita");
const bia = c("Bia", "Tânia");
const leo = c("Leo", "Rita");
const aux = c("Aux", "Bia"); // avaliada pela Tânia no ciclo, hoje reporta à Bia
const saiu = c("Saiu", "Rita", { desligado: true });
const rita = c("Rita", "Diretor");
const tania = c("Tânia", "Diretor");
const todos = [lia, bia, leo, aux, saiu, rita, tania];
// população da Matriz 9 Box (regra antiga): Rita avaliou a Bia; Tânia avaliou a Lia e a Aux; Leo ninguém avaliou → fica com o gestor atual
const popRita = [bia, leo];
const popTania = [lia, aux];
const ele = (perfil: Perfil, me: string, pop: Colaborador[], t = todos) => colaboradoresParaFeedbackDe({ perfil, me, todos: t, populacaoMatriz9Box: pop }).map((x) => x.nome).sort().join();

check("antes do ajuste a Lia faltava para a Rita; agora a equipe de hoje (Lia, Leo) aparece", ele("Gestor", "Rita", popRita) === "Bia,Leo,Lia", ele("Gestor", "Rita", popRita));
check("a Bia passa a aparecer para a Tânia (reporta a ela hoje) e a Lia continua (já estava)", ele("Gestor", "Tânia", popTania) === "Aux,Bia,Lia", ele("Gestor", "Tânia", popTania));
check("quem já estava na lista não some (Rita ainda vê a Bia que ela avaliou)", ele("Gestor", "Rita", popRita).includes("Bia"));
check("sem duplicar quem está nas duas regras (Leo)", ele("Gestor", "Rita", popRita).split(",").filter((n) => n === "Leo").length === 1);
check("desligado nunca aparece", !ele("Gestor", "Rita", popRita).includes("Saiu") && !ele("Gestor", "Rita", [saiu, ...popRita]).includes("Saiu"));
check("Diretoria segue a mesma regra do Gestor (soma a equipe de hoje)", ele("Diretoria", "Rita", popRita) === "Bia,Leo,Lia");
check("RH: empresa toda (ativos), como antes", ele("RH", "Rita", todos) === "Aux,Bia,Leo,Lia,Rita,Tânia");
check("Colaborador nunca (defesa em profundidade)", ele("Colaborador", "Rita", todos) === "");
check("gestor sem equipe e sem avaliados: lista vazia", ele("Gestor", "Ninguém", []) === "");
const antes = JSON.stringify(todos);
colaboradoresParaFeedbackDe({ perfil: "Gestor", me: "Rita", todos, populacaoMatriz9Box: popRita });
check("função pura: não altera as entradas", JSON.stringify(todos) === antes);

console.log(`\nFEEDBACK EQUIPE: ${ok} verificações OK, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
