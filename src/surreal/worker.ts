// El agente se auto-registra al importarse: instala el listener de mensajes,
// instancia el WASM en el primer connect y responde READY al hilo principal.
import '@surrealdb/wasm/worker'
