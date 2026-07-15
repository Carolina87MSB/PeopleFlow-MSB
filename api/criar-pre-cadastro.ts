import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRH, supabaseAdmin } from "./_lib/adminAuth.js";
import { norm } from "../src/domain/hierarquia.js";

/** Cria o pré-cadastro de um colaborador em `colaboradores` quando uma
 * movimentação de Admissão é concluída no PeopleFlow — RH-only, mesma
 * service_role key das demais functions administrativas.
 *
 * Só preenche o que o formulário de Admissão coleta (nome, cargo,
 * departamento, gestor, vínculo, admissão). `cpf` é NOT NULL no schema do
 * SST mas fica como string vazia — quem completa CPF/nascimento/EPIs/exames
 * continua sendo o RH, hoje só pelo Supabase Dashboard (o SST não tem uma
 * tela de edição desses campos). `id` não é auto-incremento no Postgres
 * (é atribuído manualmente pelos scripts de seed do SST), então calculamos
 * o próximo aqui. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método não permitido." });
      return;
    }

    const auth = await requireRH(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const body = req.body as
      | { candidato?: string; cargo?: string; depto?: string; gestor?: string; vinculo?: string; admissao?: string }
      | undefined;
    const nome = String(body?.candidato || "").trim();
    const cargo = String(body?.cargo || "").trim();
    const depto = String(body?.depto || "").trim();
    const gestor = String(body?.gestor || "").trim();
    const vinculo = String(body?.vinculo || "").trim();
    const admissao = String(body?.admissao || "").trim();

    if (!nome) {
      res.status(400).json({ error: "Nome do candidato é obrigatório." });
      return;
    }
    if (admissao && !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) {
      res.status(400).json({ error: "Data de admissão inválida (esperado aaaa-mm-dd)." });
      return;
    }

    const existente = auth.colaboradores.find((c) => norm(c.nome) === norm(nome));
    if (existente) {
      res.status(200).json({ ok: true, jaExistia: true });
      return;
    }

    const { data: maxRow, error: maxError } = await supabaseAdmin
      .from("colaboradores")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    if (maxError) {
      res.status(500).json({ error: maxError.message });
      return;
    }
    const novoId = (maxRow?.[0]?.id ?? 0) + 1;

    const { error: insertError } = await supabaseAdmin.from("colaboradores").insert({
      id: novoId,
      cpf: "",
      nome,
      cargo,
      departamento: depto,
      gestor,
      vinculo,
      admissao: admissao || null,
    });
    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }

    res.status(200).json({ ok: true, jaExistia: false, id: novoId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/criar-pre-cadastro]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro inesperado no servidor." });
  }
}
