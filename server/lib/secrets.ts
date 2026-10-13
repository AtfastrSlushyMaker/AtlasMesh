/** Atlas credentials must never appear in public feed errors or key-test results. */
const SECRET_ENV_KEYS = [
  'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'OPENSKY_USERNAME', 'OPENSKY_PASSWORD',
  'AISSTREAM_TOKEN', 'DEEPSEEK_API_KEY', 'LLM_API_KEY', 'GITHUB_TOKEN',
  'STACKEXCHANGE_KEY', 'S2_API_KEY', 'CERTSPOTTER_TOKEN', 'OSINT_ACCESS_KEY',
];

/** Include unsaved drafts when an upstream response might echo a tested key. */
export function redactSecrets(text: string, extraSecrets: Array<string | undefined> = []): string {
  const secrets = [...SECRET_ENV_KEYS.map((key) => process.env[key]), ...extraSecrets].filter(Boolean) as string[];
  const user = process.env.OPENSKY_USERNAME;
  const pass = process.env.OPENSKY_PASSWORD;
  if (user && pass) secrets.push(Buffer.from(`${user}:${pass}`).toString('base64'));

  const variants = new Set<string>();
  for (const secret of secrets) {
    variants.add(secret);
    variants.add(JSON.stringify(secret).slice(1, -1));
    // Errors can contain query parameters or OAuth form data rather than raw keys.
    const encodings = [new URLSearchParams({ key: secret }).toString().slice(4)];
    try {
      encodings.push(encodeURIComponent(secret), encodeURI(secret));
    } catch { /* A malformed Unicode draft still has its raw and form variants. */ }
    for (const encoded of encodings) {
      variants.add(encoded);
      variants.add(encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()));
    }
  }
  // Replace complete values before truncation, longest first to cover overlapping keys.
  const patterns = [...variants].filter(Boolean).sort((a, b) => b.length - a.length)
    .map((secret) => secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return patterns.length ? text.replace(new RegExp(patterns.join('|'), 'g'), '[redacted]') : text;
}
