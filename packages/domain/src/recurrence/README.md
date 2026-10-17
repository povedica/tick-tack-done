# recurrence

Expansión RRULE (RFC 5545) con rrule.js. Reglas de la sección 6.1 y RF-701 a RF-706.
Casos límite obligatorios en tests: 29-31 de febrero, DST en la zona de captura,
completar con retraso, `repeat_from: completion_date`. Solo se materializa la
ocurrencia actual; el cálculo de ocurrencias teóricas (RF-704) no persiste nada.
