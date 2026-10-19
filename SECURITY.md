# Política de seguridad

## Versiones con soporte

Solo la rama `main` recibe correcciones de seguridad.

## Cómo informar de una vulnerabilidad

No abras un issue público. Usa "Report a vulnerability" en la pestaña Security del repositorio
(private vulnerability reporting de GitHub).

Respuesta inicial en 7 días. Divulgación coordinada: 90 días o hasta publicar el arreglo.

## Alcance

Proyecto personal de un solo usuario. Si lo autoalojas, mantén `REGISTRATION_OPEN=false`,
`AUTH_MODE` vacío en producción, secretos fuertes y el servidor actualizado.
SSH solo con clave, sin acceso de root por contraseña, y el cortafuegos limitado a 22, 80 y 443.
