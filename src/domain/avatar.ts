const AVATARS = ["#56A4BB", "#5F88A1", "#2c6679", "#3d8499", "#4E7A8C", "#6b9aa8"];

export function initials(nome: string): string {
  const parts = nome.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const first = (parts[0] || "")[0] || "";
  const last = parts.length > 1 ? (parts[parts.length - 1] || "")[0] || "" : "";
  return first + last;
}

export function avatarBg(nome: string): string {
  let sum = 0;
  for (let i = 0; i < nome.length; i++) sum += nome.charCodeAt(i);
  return AVATARS[sum % AVATARS.length];
}
