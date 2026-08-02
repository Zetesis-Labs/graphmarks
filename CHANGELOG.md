# Changelog

## [0.6.1](https://github.com/Zetesis-Labs/graphmarks/compare/v0.6.0...v0.6.1) (2026-08-02)


### Bug Fixes

* declarar data_collection_permissions en el manifest de Firefox ([f05f770](https://github.com/Zetesis-Labs/graphmarks/commit/f05f7709b802d333d3dbf5dc8ba1bd02b7053970))

## [0.6.0](https://github.com/Zetesis-Labs/graphmarks/compare/v0.5.0...v0.6.0) (2026-08-02)


### Features

* build multi-navegador con target de Firefox ([532bf8c](https://github.com/Zetesis-Labs/graphmarks/commit/532bf8c69a76c64d891dfb0530ab61fa8f0b00a3))
* jerarquía de subdominios y rutas en la vista de dominios ([7ce5c5d](https://github.com/Zetesis-Labs/graphmarks/commit/7ce5c5d02f0ce766e25d4fe5496b500577efd8b7))

## [0.5.0](https://github.com/Zetesis-Labs/graphmarks/compare/v0.4.0...v0.5.0) (2026-08-02)


### ⚠ BREAKING CHANGES

* migrar a TypeScript modular con las convenciones de Zetesis-Portal

### Features

* buscador-paleta, historial vivo, layout fijado, tags en sync y empaquetado ([d3369ec](https://github.com/Zetesis-Labs/graphmarks/commit/d3369ec5f05cad536e09428b90e9059232e4ef8e))
* diagnóstico de sesiones y captura genérica de vistas divididas ([48193da](https://github.com/Zetesis-Labs/graphmarks/commit/48193dac76485908796d412a94020274416427ac))
* filtro de pestañas por ventana (todas / actual / concreta) ([fd910cd](https://github.com/Zetesis-Labs/graphmarks/commit/fd910cdc6dd31f74bc192bca7af6615a40825d8a))
* grafo más vivo — curvas, territorios de cluster, glow, partículas y fondo con profundidad ([b02b930](https://github.com/Zetesis-Labs/graphmarks/commit/b02b9301467db3cb298a9e3652e79a18d4bafc40))
* iconos personalizados y colores de carpeta ([95ec6ce](https://github.com/Zetesis-Labs/graphmarks/commit/95ec6ce641b301a83c7e48d3d1bb1e26adbdeb36))
* interfaz en español e inglés con chrome.i18n ([d5e43db](https://github.com/Zetesis-Labs/graphmarks/commit/d5e43db946eaa2ac287d5c48da43f9106b9f8f24))
* pestañas sueltas como nodos fantasma con adopción por arrastre ([05af188](https://github.com/Zetesis-Labs/graphmarks/commit/05af188306e7882c1931051508dd9c883e2a6563))
* previsualización de pestañas abiertas en el tooltip (demo) ([e7d3b43](https://github.com/Zetesis-Labs/graphmarks/commit/e7d3b4379f58f7f3d84fa5241b0e4ff8a1d94f88))
* release-please como ciclo de release completo ([bb5ef94](https://github.com/Zetesis-Labs/graphmarks/commit/bb5ef94a872163a34b01afcc14987f05d394d1fc))
* sesiones de ventanas guardadas (con grupos de pestañas) ([892b5a7](https://github.com/Zetesis-Labs/graphmarks/commit/892b5a73c46b1f741f262723b4c26b4893cea959))
* sincronizar sesiones entre equipos vía chrome.storage.sync ([7dceb91](https://github.com/Zetesis-Labs/graphmarks/commit/7dceb918d39e103ad8068037b004806c235f85da))
* spike de SurrealDB embebido (WASM + indxdb) como BBDD de grafos local ([fa0e4a9](https://github.com/Zetesis-Labs/graphmarks/commit/fa0e4a910c90fb0472603ac24b72d40c4e0590aa))


### Bug Fixes

* autochequeo de permisos y aviso al guardar sesiones sin tabGroups ([7b98aec](https://github.com/Zetesis-Labs/graphmarks/commit/7b98aec7800d9f1f3f02d2f12a5ed9ef7a3e890d))
* capturar splitViewId vía tabs.query y dejar el par dividido seleccionado ([6c21bab](https://github.com/Zetesis-Labs/graphmarks/commit/6c21babd5a5232fc14972ee85620dcf9959020ad))
* clavar @surrealdb/wasm en 2.6.1 (backend indxdb roto en 3.0.x) y validar con arnés real ([938f314](https://github.com/Zetesis-Labs/graphmarks/commit/938f3149323293eb8f215ae40610c59fa73ae74b))
* guía de credenciales de la Store con flujo loopback y guardarraíl de versión en release ([afcea23](https://github.com/Zetesis-Labs/graphmarks/commit/afcea23f3e39fe42b9348f59a1e33ae6ea9625e7))
* los menús de Sesiones y ventanas se cerraban con su propio clic ([ffbfbbe](https://github.com/Zetesis-Labs/graphmarks/commit/ffbfbbeb91aa7eba3b12c8df4569dd8bc4543028))
* pedir tabGroups en runtime (optional_permissions) con gesto de usuario ([5f08817](https://github.com/Zetesis-Labs/graphmarks/commit/5f08817c19421bbb5a5f17d790d29dac208761f0))
* restaurar grupos de pestañas aunque falte el permiso tabGroups ([32e11da](https://github.com/Zetesis-Labs/graphmarks/commit/32e11da27a4229aa03673f279661ac9cdfd643e5))
* selección robusta del par dividido e integración futura de tabs.split ([83e4972](https://github.com/Zetesis-Labs/graphmarks/commit/83e497259a44fcfb856d296e5fccc2ee1f72d1a7))


### Code Refactoring

* migrar a TypeScript modular con las convenciones de Zetesis-Portal ([e6a347e](https://github.com/Zetesis-Labs/graphmarks/commit/e6a347e60f7e3178a17ec34f1cf5e1289a8ae81c))
