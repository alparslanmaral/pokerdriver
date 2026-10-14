export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: Element,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

export function formatMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString('en-US')}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
