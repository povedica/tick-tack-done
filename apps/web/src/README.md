# Estructura del frontend

- `features/<feature>/` — por dominio: `components/`, `hooks/`, `api.ts` (solo vía packages/sdk), `types.ts`.
- `routes/` — rutas limpias de la sección 7 (`/today`, `/list/:id`, `/calendar/:view`, `/habits`, `/dashboard`…).
- `i18n/` — mensajes `es` (default) y `en`. Ninguna cadena hardcodeada en componentes.
- `lib/offline/` — cola de mutaciones en IndexedDB con Idempotency-Key (RF-13010).

Estado: TanStack Query para datos de servidor, Zustand para UI efímera. Sin fetch suelto.
