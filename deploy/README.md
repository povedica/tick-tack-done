# Despliegue

## Correo del restablecimiento de contraseña

Comprueba qué transporte está activo mirando si la variable existe, sin imprimir su valor:

```bash
test -n "$RESEND_API_KEY" && echo resend || echo smtp
```

1. El proceso de producción no arranca sin correo. Confirma Resend (`RESEND_API_KEY` y `EMAIL_FROM`) o SMTP (`SMTP_HOST` y `SMTP_FROM`).
2. El remitente debe ser un dominio propio, por ejemplo `tick-tack-done <no-reply@reflexionia.com>`.
3. Resend: dominio verificado (DKIM y SPF/MX del subdominio de envío) y seguimiento de clics y aperturas desactivado. Si el seguimiento reescribe el enlace, se pierde el fragmento `#token`.
4. SMTP: `SMTP_SECURE=true` en el puerto 465. Con otro puerto, `SMTP_SECURE=false` y TLS obligatorio salvo `mailpit` o `localhost`. SPF, DKIM y TLS los firma el proveedor.
5. DMARC en `_dmarc.reflexionia.com`, empezando por `p=none`.
6. `PUBLIC_URL` es la única base del enlace. No se usa `Host` ni `X-Forwarded-Host`.
7. Prueba de humo solo si la pide quien opera la cuenta: el aviso llega a la bandeja (no a spam), `Authentication-Results` muestra `spf=pass dkim=pass dmarc=pass` y el enlace conserva `#token`.
8. Si se pierden a la vez el TOTP y los códigos de recuperación, en el servidor: `pnpm --filter api admin:disable-totp --email <email>`. Pide confirmación, deja ActivityLog y no tiene endpoint HTTP.
