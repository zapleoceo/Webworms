export function assetUrl(relPath: string): string {
  const base = (import.meta as any).env?.BASE_URL || '/';
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  return `${b}${p}`;
}

