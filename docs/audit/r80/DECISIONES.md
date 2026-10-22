# Decisiones de producto durante la implementación

- 22/10/2026, Pablo: mantener **dos tarjetas, Calendar y Drive**, con estado de autorización y activación independientes y una sola conexión OAuth. Es la decisión final confirmada en el chat y sustituye la tarjeta única de97.
- Autorizar un servicio solicita permisos incrementales con el mismo cliente Google. Se guardan los scopes **realmente concedidos**, incluso si el consentimiento es parcial. No se deducen de la mera existencia del token.
- Desactivar un servicio detiene su uso dentro de tick-tack-done conservando el permiso en Google. No se denomina revocación. La revocación completa afecta a ambos; Cambiar permisos avisa de esa interrupción, revoca el acceso y vuelve a abrir Google para elegir permisos. [Google, consentimiento granular](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions), [revocación](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
- No hacen falta proyectos OAuth ni credenciales separados. No se ha modificado configuración de producción. Las conexiones antiguas sin scopes registrados muestran Permisos por comprobar y requieren revisar el consentimiento; no se les atribuyen permisos no verificados.
- Los avisos de tratamiento de datos usan tick-tack-done completo. No se utiliza el gestor de tareas para registrar esta decisión.
