// Triagem das ações de PDI pelo RH ("Sugestões a partir do PDI").
// Duas decisões formais, ambas fora do PDI (o PDI nunca é alterado):
//  • confirmar → vira uma Necessidade de Desenvolvimento na Base (ação pdi_sugestao_aceitar);
//  • manter somente no PDI → a ação continua válida no PDI, sai da fila e não entra na Base.
// "Manter somente no PDI" reaproveita a estrutura de sugestões dispensadas (Fase 4), cujo campo
// de motivo é obrigatório no banco: sem observação do RH, grava-se este texto padrão.
export const MOTIVO_PADRAO_MANTER_NO_PDI = "Mantida somente no PDI (sem observação).";
