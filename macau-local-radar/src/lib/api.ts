const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export function buildApiUrl(path: string) {
  if (!rawApiBaseUrl) {
    return path;
  }

  return `${rawApiBaseUrl.replace(/\/$/, '')}${path}`;
}
