// El tarball de @surrealdb/wasm 3.0.3 no incluye worker-agent.d.ts pese a
// declararlo en exports./worker.types; sin esto tsc no resuelve el módulo.
declare module '@surrealdb/wasm/worker'
