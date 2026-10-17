# filters

ÚNICA implementación de la gramática de filtros de la sección 5.7
(combinators AND/OR, un nivel de grupos, campos lista/etiqueta/fecha/prioridad/keyword/estado).
La usan `POST /filters/preview`, smart lists, automatizaciones (11.3) y revisiones (9.23).
Prohibido duplicar esta lógica en cliente o en queries SQL a mano (RF-904): si hace falta
evaluar en SQL, generar el WHERE desde esta misma gramática.
