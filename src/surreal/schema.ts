/* Esquema completo desde el día 1, aunque la UI aún no use notas: bookmark y
   tag son proyecciones reconstruibles (chrome.bookmarks / storage.sync);
   note y sus aristas serán el único dato con origen aquí. La clave canónica
   es la URL (los ids de chrome.bookmarks no son estables entre dispositivos),
   por eso los record ids son type::thing(tabla, url).

   Sintaxis SurrealDB 2.x: @surrealdb/wasm está clavado en 2.6.1 porque el
   backend indxdb de TODA la serie 3.0.x (verificado en 3.0.0 y 3.0.3) no
   comitea transacciones: mem:// funciona e indxdb:// falla en página y en
   worker con IndexedDB nativo sano. Al subir a 3.x: migrar type::thing →
   type::record y SEARCH → FULLTEXT ANALYZER. */
export const SCHEMA = `
DEFINE TABLE IF NOT EXISTS bookmark SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS url ON bookmark TYPE string;
DEFINE FIELD IF NOT EXISTS title ON bookmark TYPE string;
DEFINE FIELD IF NOT EXISTS folder ON bookmark TYPE option<string>;
DEFINE FIELD IF NOT EXISTS chrome_id ON bookmark TYPE option<string>;

DEFINE TABLE IF NOT EXISTS tag SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON tag TYPE string;

DEFINE TABLE IF NOT EXISTS note SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON note TYPE string;
DEFINE FIELD IF NOT EXISTS content ON note TYPE string;
DEFINE FIELD IF NOT EXISTS created ON note TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS updated ON note TYPE datetime DEFAULT time::now();

DEFINE TABLE IF NOT EXISTS tagged TYPE RELATION IN bookmark|note OUT tag;
DEFINE TABLE IF NOT EXISTS about TYPE RELATION IN note OUT bookmark;
DEFINE TABLE IF NOT EXISTS links_to TYPE RELATION IN note OUT note;

DEFINE ANALYZER IF NOT EXISTS simple TOKENIZERS class FILTERS lowercase, ascii;
DEFINE INDEX IF NOT EXISTS bm_title_fts ON bookmark FIELDS title SEARCH ANALYZER simple BM25;
DEFINE INDEX IF NOT EXISTS note_content_fts ON note FIELDS content SEARCH ANALYZER simple BM25;
`
