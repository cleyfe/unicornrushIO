export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.innerHTML = html;
  return e;
}

/** Progress from $1M to $1B on a log scale, so early growth is visible. */
export function unicornProgress(valuation: number): number {
  return Math.max(0, Math.min(1, Math.log10(Math.max(1, valuation) / 1e6) / 3));
}
