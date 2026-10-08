# Validación del flujo de recuperación

Fecha: 2026-10-07. Referencia: `hotfix/0.3.1-account-reset-flow`.
Herramienta: Codex.

No se recibió un prompt adicional para esta etapa. Se verificó la misma
petición registrada en `prompts/antes/2026-10-07-account-reset-login.md`.

## Diagnóstico y resultado

En Vercel, Auth.js emitía `__Secure-authjs.session-token` sobre HTTPS. Las rutas
BFF que usaban `getToken` sin `secureCookie` buscaban `authjs.session-token`,
por lo que `/api/account/me` y las demás rutas autenticadas respondían 401
aunque `/api/auth/session` y el login respondieran 200. El dashboard interpretaba
ese 401 como sesión vencida y redirigía a `/login`.

Se centralizó la lectura de la cookie según el protocolo de la solicitud y se
añadió una prueba para HTTP y HTTPS. La pantalla de restablecimiento ahora sólo
muestra el enlace de inicio de sesión al guardar correctamente la contraseña.
Pasaron 8 pruebas de Vitest, 7 recorridos E2E, lint, typecheck, formato y build
del frontend. El cambio queda pendiente de revisión independiente y despliegue.
