# Revisión CodeQL del corte

El check de la PR75 sobre4d58b37 detectó siete alertas nuevas. Se corrigen en el código y en las pruebas, sin desactivar reglas ni descartar alertas:

- Extractor de URLs: se sustituyen expresiones con ancla final y recuentos repetidos por recorrido lineal con contadores de delimitadores; prueba con40000 caracteres de puntuación/delimitadores.
- Títulos HTML: se elimina la sanitización con regex y la cadena de decodificaciones. El contenido de title se trata como texto, con decodificación única y límite200. Prueba roja reprodujo `&amp;lt;` convertido dos veces; ahora se conserva `&lt;`. La web renderiza mediante texto React, sin innerHTML.
- Dobles de Telegram: se compara URL.origin y pathname, evitando coincidencias arbitrarias del hostname en una cadena.
- Playwright de Drive: expresión de hostname con esquema/ancla y puntos escapados.
- Adicionalmente, el estado OAuth rechaza tipos de parámetro no string y valida la forma del payload firmado antes de usarla.

Las alertas históricas ajenas al corte no se declaran resueltas. El resultado remoto del nuevo análisis se anotará en el cierre.
