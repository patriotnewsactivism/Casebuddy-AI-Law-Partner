/**
 * safeText — guarantees a renderable React child.
 * Defends against upstream data (AI JSON output, legacy records) that may
 * hand us an object/array where a plain string was expected. Rendering a
 * raw object directly in JSX throws React error #31 and crashes the whole
 * page — this makes that class of bug impossible at the render layer.
 */
export const safeText = (v: unknown, fallback = ''): string => {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return (
      v
        .map(item => safeText(item))
        .filter(Boolean)
        .join(', ') || fallback
    );
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.event === 'string') return obj.event;
    if (typeof obj.title === 'string') return obj.title;
    if (typeof obj.value === 'string') return obj.value;
    try {
      return JSON.stringify(obj);
    } catch {
      return fallback;
    }
  }
  return String(v) || fallback;
};
