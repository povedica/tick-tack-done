# Refinamiento local de Apariencia, Jornada y Tiempo de Foco

26/10/2026, rama `codex/local-tests-refinement`. Petición de Pablo; referencias RF-1201 y ajustes de cuenta/apariencia del producto. Sin cambios de API, cuentas ni preferencias reales durante las pruebas.

- Apariencia: estado seleccionado inequívoco en los controles segmentados (tema, densidad, inicio de semana e idioma), con fondo de acento suave, borde de acento y texto reforzado, en claro y oscuro. Se respetan las preferencias elegidas; no se fuerza idioma automático.
- Jornada: filas coherentes con etiqueta y control alineados, ayuda secundaria, controles de ancho consistente y Guardar primario azul con feedback y bloqueo mientras guarda. Las horas mantienen texto HH:mm de 24 horas, evitando que el estilo global que oculta AM/PM en inputs nativos convierta visualmente las 18:00 en 06:00.
- Foco: menú y título «Tiempo de Foco»; Guardar usa el componente primario compartido.

Prueba `wt-e-refinement.spec.ts` con API simulada: selección visual, seis filas alineadas, guardado de la hora, botones primarios y nuevo nombre; capturas en 1280 claro y 390 oscuro. Se conserva la prueba existente de validación de Foco.

Validación final de esta revisión: lint sin errores (aviso previo de console en prueba D), tipos del monorepo y 890 unitarios correctos. Integración F 13/13 en BD sintética. Regresión funcional de planificación, incluido guardar/recargar una ordinaria y una recurrente de 0 min, correcta; la prueba anterior que permitía volver a decidir se adaptó al bloqueo solicitado y pasa. Ajustes y popup verificados con capturas en escritorio claro y móvil oscuro. Sin cambios de API de ejecución ni escrituras sobre las tareas de trabajo durante las pruebas.
