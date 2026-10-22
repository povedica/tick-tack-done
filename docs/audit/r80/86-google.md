# TTD-AUD-86 — aislamiento Google

Las tres regresiones previas intentaban llamar a Google con la credencial global de otra cuenta. Ahora las tres devuelven 409 google_not_connected antes de cualquier llamada remota.

Se conserva el respaldo únicamente en NODE_ENV=development y para el email exacto de DEV_GOOGLE_USER_EMAIL. El token propio cifrado siempre prevalece. En producción se ignora el respaldo y se emite el aviso exigido sin imprimir su valor.

Validación: 3 unitarias de consumidores, 4 de política, 1 de aviso de arranque y 1 e2e HTTP (Drive y Calendar, usuario sin vincular, variable global definida), con PostgreSQL local aislado y Node 26.

Producción, 22/10/2026: comprobación SSH de solo lectura dentro del contenedor API; el comando que únicamente imprime set/unset devolvió **unset**. No está definida GOOGLE_REFRESH_TOKEN. No hubo que retirarla ni se ha modificado o revocado ninguna credencial real. No se ha desplegado la PR durante esta comprobación.
