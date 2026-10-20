export const supabaseAdmin = globalThis.__ADMIN;
// Só para o módulo carregar: as guardas reais (requireRH etc.) não são exercitadas por estes testes.
const negar = async () => ({ ok: false, status: 403, error: "guarda não simulada" });
export const requireRH = negar;
export const requireAuth = negar;
export const requireRHOuGestorDoColaborador = negar;
