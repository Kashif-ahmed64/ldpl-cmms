/** True when running inside the LDPL CMMS Electron desktop shell. */
export function isDesktop(): boolean {
  return window.ldplCmms?.isDesktop === true;
}

/** Resolve public asset paths for both Vite dev and packaged file:// builds. */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${clean}`;
}
