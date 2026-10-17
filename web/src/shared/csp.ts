export function cspNonce(): string | undefined {
  const value = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
  return value && !value.startsWith('__') ? value : undefined;
}
