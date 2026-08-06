/**
 * ¿Esta URL es la página del grafo? Chrome reporta las pestañas capturadas por
 * `chrome_url_overrides` como chrome://newtab/, no con la URL de la extensión,
 * así que solo cuentan como grafo mientras la override siga activa.
 */
export function isGraphTabUrl(url: string, graphBase: string, newtabTakeover: boolean): boolean {
  return url.startsWith(graphBase) || (newtabTakeover && url.startsWith('chrome://newtab'))
}
