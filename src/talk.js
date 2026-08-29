/** Spoken lines before the stacker. Not a legal card. */

export function parseStoreys(text) {
  const s = String(text || "");
  let best = 0;
  const re = /(\d+)\s*(?:-|to\s+)?(?:storey|storeys|storied|floor|floors)\b/gi;
  let m;
  while ((m = re.exec(s))) best = Math.max(best, Number(m[1]) || 0);
  const parts = s.matchAll(/part[-\s]*(\d+)/gi);
  for (const p of parts) best = Math.max(best, Number(p[1]) || 0);
  return best || 0;
}
