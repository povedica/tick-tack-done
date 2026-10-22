# TTD-AUD-81 — recurrencia

- Reproducción previa por MCP: la serie terminó con 3 filas en vez de 2; next_occurrence incluía la hora actual; faltaba warnings para martes con BYDAY=MO.
- Cierre de todas las filas del owner en una transacción y descarte de avances pendientes. Bloqueo compartido con el scheduler y relectura bajo bloqueo para evitar que un tick ya iniciado vuelva a crear otra ocurrencia.
- El scheduler sigue siendo quien materializa las ocurrencias. detach_occurrence conserva su vía independiente.
- next_occurrence usa nextOccurrence del dominio y series.next_due_date cuando existe. Aviso no bloqueante calculado con una función pura compartida con la UI.
- Conflicto comprobado: el código antiguo borraba también series_id al quitar la regla. Ahora se conserva el vínculo de historial; close-orphan-series puede recuperar el vínculo anterior únicamente cuando está acreditado por la actividad. No se infieren series por título.
- Validación: 2 casos de dominio, regresión MCP unitaria y 3 e2e PostgreSQL reales; aviso medido con boundingBox en los cuatro proyectos (1280×800/390×844, claro/oscuro), fuente de 12 px y separación de 4 px.
- Script --dry-run en base local: 0 series. El modo --apply exige pg_dump validado previamente (ruta privada absoluta, sin sobrescritura). No se ejecutó contra producción ni una copia de producción; ese criterio externo sigue pendiente.
- Evidencias: ../evidencias/r80/81_ancla-repeticion_{antes|despues}_{desktop|mobile}_{light|dark}.png. El detalle modal del Calendario y el panel de Hoy/listas se conservan.
