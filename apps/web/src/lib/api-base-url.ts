export const apiBaseUrl = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"
);

export function buildApiUrl(path: string, baseUrl = apiBaseUrl): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "/api";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
