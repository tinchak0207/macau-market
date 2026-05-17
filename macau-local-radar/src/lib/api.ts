const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

function inferApiBaseUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  const { hostname, origin } = window.location;

  if (hostname === 'market.tinchak0207.xyz') {
    return 'https://api.market.tinchak0207.xyz';
  }

  if (hostname.startsWith('market.')) {
    return origin.replace('//market.', '//api.market.');
  }

  return '';
}

export function buildApiUrl(path: string) {
  const apiBaseUrl = rawApiBaseUrl || inferApiBaseUrl();

  if (!apiBaseUrl) {
    return path;
  }

  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}
