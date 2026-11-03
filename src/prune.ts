/**
 * Deep-copies a Mouser response without empty values (`null`, `undefined`,
 * `""`, `[]`, `{}`), so pass-through tool results carry only real data.
 */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  if (value === null || value === "") return undefined;
  return value;
}

/** {@link prune} for a top-level response object; never returns undefined. */
export function pruneObject(value: unknown): Record<string, unknown> {
  const pruned = prune(value);
  return pruned !== null && typeof pruned === "object" && !Array.isArray(pruned)
    ? (pruned as Record<string, unknown>)
    : {};
}
