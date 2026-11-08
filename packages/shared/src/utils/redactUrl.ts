// Request logs record each URL. Some carry one-time secrets in the query string (Google's sign-in
// callback brings ?code=&state=), and logs are kept, copied and read by more people than the
// database is. Values of sensitive parameters are replaced before a URL is logged.
const SENSITIVE = /^(code|state|token|access_token|refresh_token|id_token|password|secret|key|signature)$/i;

export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const params = url
    .slice(q + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        /* keep as is */
      }
      return eq !== -1 && SENSITIVE.test(decoded) ? `${name}=REDACTED` : pair;
    });
  return `${url.slice(0, q)}?${params.join('&')}`;
}
