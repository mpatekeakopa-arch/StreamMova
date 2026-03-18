export function getInitials(nameOrEmail = "") {
  const s = String(nameOrEmail).trim();
  if (!s) return "U";
  const base = s.includes("@") ? s.split("@")[0] : s;
  const parts = base.replace(/[_\-.]+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function readUserFromStorage() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || typeof u !== "object") return null;
    return u;
  } catch {
    return null;
  }
}

export function getPlatform(platformId, availablePlatforms) {
  return availablePlatforms.find((p) => p.id === platformId);
}