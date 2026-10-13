export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.innerHTML = html;
  return e;
}

/** Progress to a $1B valuation, on a plain linear scale. */
export function unicornProgress(valuation: number): number {
  return Math.max(0, Math.min(1, valuation / 1e9));
}
