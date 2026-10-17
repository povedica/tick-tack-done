# nlp

Parser del quick add (RF-102) en español e inglés con reglas (no ML, sección 20).
Extrae: fecha/hora ("mañana 18:00", "cada lunes"), prioridad (!alta, p1-p3),
etiquetas (#casa), lista (^trabajo), recordatorio ("avísame 30 min antes").
Siempre devuelve los fragmentos reconocidos para que la UI los resalte antes de confirmar.
Extensible por plugins (RF-103): registrar patrones adicionales sin tocar el núcleo.
