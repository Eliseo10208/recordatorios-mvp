# CLAUDE.md — Recordatorios

## 1. Propósito y alcance

Este repositorio contiene una aplicación web pública de recordatorios construida para una prueba técnica. Debe ser fácil de instalar, revisar, probar, desplegar y mantener. Es un monorepositorio para el frontend, la API, el worker de programación, la integración de WhatsApp, las migraciones, los contratos y la documentación. No es una aplicación de notas: el flujo principal es programar un aviso y recibirlo dentro de la app, con Web Push y WhatsApp como entregas adicionales opcionales.

La IA se usa exclusivamente durante el desarrollo: análisis, planificación, programación, generación de pruebas y revisión. La aplicación desplegada no llama modelos, no usa RAG y no ejecuta agentes. **OpenAPI** es la especificación abierta y el contrato de la API; no es OpenAI ni implica una dependencia de IA.

La definición funcional canónica está en [docs/specs/MVP_RECORDATORIOS.md](docs/specs/MVP_RECORDATORIOS.md). La decisión del emisor único está en [docs/adr/ADR-0001-whatsapp-centralizado.md](docs/adr/ADR-0001-whatsapp-centralizado.md). Si el código futuro contradice esos documentos, no cambies silenciosamente el comportamiento: actualiza la spec o crea un ADR con aprobación humana.

## 2. Stack y destinos previstos

- Frontend: Next.js 16, React 19 y TypeScript estricto.
- API: FastAPI, Pydantic 2 y Python 3.13.
- Persistencia: PostgreSQL, SQLAlchemy 2 y Alembic.
- Autenticación: Auth.js como límite de sesión web; FastAPI emite y valida JWT y es la autoridad de identidad y permisos.
- Programación: worker Python durable que reclama recordatorios vencidos desde PostgreSQL; no depende de timers del navegador ni de BackgroundTasks.
- Recordatorios por WhatsApp: un único servicio whatsapp/ en TypeScript/Node.js con [Baileys](https://github.com/WhiskeySockets/Baileys), conectado y administrado por el equipo, dentro del monorepositorio y desplegado por separado de FastAPI. Cada usuario sólo registra su número destino y consentimiento. El backend Python consume el contrato HTTP del servicio; Baileys no se instala en api/ ni en web/.
- Despliegue previsto: Vercel para el frontend; API, worker y servicio WhatsApp como procesos independientes en Render; y Neon para PostgreSQL.
- GitHub Actions para calidad, seguridad y despliegue.
- Gestores previstos: pnpm para TypeScript y uv para Python; las versiones concretas se fijarán en lockfiles.

### Referencia visual

La UI toma como referencia visual la [plantilla AI Moodboard Canvas de Lovable](https://lovable.dev/templates/apps/saas/inspo-canvas-visual-moodboard-creator-template). Se adaptará al dashboard, formulario y bandeja de recordatorios; no se copiará su dominio de moodboards o notas. Su generación de imágenes con IA, autenticación, backend y despliegue no se incorporan: prevalecen el stack y la prohibición de IA en producción definidos aquí. Antes de reutilizar código o recursos de la plantilla, comprobar licencia, procedencia y compatibilidad.

## 3. Prioridad de instrucciones

Antes de modificar código, sigue esta prioridad:

1. La petición y los criterios de aceptación de la tarea actual.
2. Este CLAUDE.md y el AGENTS.md raíz, si existe.
3. El CLAUDE.md o AGENTS.md más cercano al archivo modificado.
4. Specs y ADR aceptados en docs/.
5. Contratos versionados: OpenAPI, schemas Pydantic y migraciones Alembic.
6. El código y las pruebas existentes.

Este archivo es autosuficiente para el trabajo con IA. AGENTS.md puede añadir reglas generales o de dominio, pero no debilitar seguridad, validación ni Definition of Done. Si ambos archivos se contradicen, detente y solicita que se resuelva la contradicción; no elijas silenciosamente. Las reglas compartidas deben revisarse en el mismo PR para evitar divergencia.

## 4. Reglas para trabajar con código usando IA

1. Inspecciona el repositorio antes de editar. Revisa estructura, módulos y patrones existentes para evitar duplicar código o inventar APIs.
2. Define objetivo, exclusiones y supuestos. Deja claro qué se necesita resolver y cuáles son los límites de la tarea.
3. Detente ante decisiones importantes sin resolver. No tomes decisiones de arquitectura, permisos, manejo de datos o efectos externos sin autorización.
4. Realiza únicamente los cambios necesarios. Implementa la solución más pequeña que cumpla los requisitos.
5. No modifiques código ajeno al objetivo ni hagas refactorizaciones innecesarias.
6. Escribe o actualiza pruebas por cada comportamiento. Deben demostrar que funciona y permitir verificarlo de nuevo.
7. Conserva contratos existentes. No cambies interfaces, endpoints, estructuras de datos o integraciones sin autorización explícita.
8. Mantén la lógica de negocio en servicios. Las rutas HTTP y los modelos ORM deben ser simples.
9. Valida entradas y reglas de negocio también en el backend; nunca confíes sólo en el frontend.
10. Evita dependencias e infraestructura innecesarias.
11. Nunca expongas secretos, tokens, claves API ni datos reales en un repositorio público.
12. No ejecutes operaciones destructivas sin aprobación. Antes de borrar datos, modificar infraestructura o realizar acciones irreversibles, solicita autorización.
13. Ejecuta las verificaciones aplicables antes de terminar. No declares que algo funciona sin comprobarlo.
14. Informa qué verificaciones no se ejecutaron y por qué.
15. Trata el código generado por IA como no confiable: revisa errores, vulnerabilidades y referencias a APIs inexistentes.
16. La IA no aprueba sus propios cambios. Todo cambio generado por IA requiere revisión independiente antes de su aceptación final.

## 5. Arquitectura y límites

```text
Navegador
  → Next.js / BFF en Vercel
    → FastAPI en Render
      → PostgreSQL en Neon

Worker durable en Render
  → PostgreSQL en Neon
  → servicio whatsapp/ en otro despliegue de Render
    → WhatsApp
```

- Next.js gestiona presentación, navegación y sesión del navegador.
- Todo tráfico autenticado iniciado por el navegador pasa por endpoints BFF explícitos; no se crea un proxy genérico hacia la API.
- FastAPI es la autoridad de negocio, autenticación, autorización y persistencia.
- PostgreSQL es la fuente de verdad para el estado durable, incluidas las programaciones y el estado de entrega de recordatorios.
- Todo recordatorio vencido crea primero una notificación interna única. Web Push y WhatsApp son entregas independientes; el fallo de una no elimina ni invalida la notificación interna.
- El worker es obligatorio para este MVP. Reclama filas vencidas con leases y bloqueo seguro, materializa la notificación y registra intentos de entrega antes de llamar servicios externos.
- OpenAPI generado por FastAPI es el contrato canónico con el frontend. El cliente TypeScript se genera desde OpenAPI; no se mantienen interfaces duplicadas manualmente.
- Los procesos largos o reintentables no se ejecutan dentro de una petición HTTP.
- El backend Python encapsula el consumo del servicio whatsapp/ detrás de un adaptador de proveedor que usa el worker. La lógica de recordatorios no depende de rutas, payloads ni respuestas específicas de Baileys. El navegador nunca consume esos endpoints directamente.
- Antes de implementar WhatsApp, definir y versionar el contrato entre api/ y whatsapp/. Su entrada mínima es el número destino y el mensaje; autenticación, estados, errores, timeouts, reintentos e idempotencia también deben quedar definidos. No suponer que la aceptación de una solicitud equivale a entrega.
- El servicio whatsapp/ usa una sola sesión emisora administrada por el equipo. Los usuarios no conectan cuentas, no escanean QR, no proporcionan tokens y no administran sesiones de Baileys.
- El servicio whatsapp/ es la única excepción prevista a la regla de no añadir microservicios propios. El worker durable ya está justificado por la programación de recordatorios. No se introducen otros microservicios, brokers, workers o caches distribuidos sin un requisito adicional. El rate limiting distribuido de autenticación es una excepción de seguridad explícita.
- Ningún componente productivo depende de un proveedor de IA.

## 6. Flujo obligatorio con IA

### 6.1 Antes de implementar

1. Leer este archivo, las instrucciones del dominio y la spec.
2. Inspeccionar el código, las pruebas y los contratos afectados.
3. Resumir el comportamiento actual y el esperado.
4. Declarar supuestos y preguntas que puedan cambiar el resultado.
5. Identificar riesgos de seguridad, datos, concurrencia y compatibilidad.
6. Definir criterios de aceptación verificables.
7. Proponer el cambio mínimo y los archivos necesarios.
8. Proponer una prueba que falle antes del cambio.
9. Esperar decisión humana si hay arquitectura, permisos, migraciones destructivas o efectos externos no especificados.

No escribas código mientras falte una decisión que pueda cambiar el contrato.

### 6.2 Durante la implementación

1. Agrega o ajusta una prueba.
2. Confirma que falla por la razón esperada.
3. Implementa únicamente el comportamiento necesario.
4. Ejecuta la prueba focalizada.
5. Revisa el diff en busca de cambios fuera de alcance, secretos y cambios accidentales.
6. Repite para el siguiente criterio.
7. Ejecuta la suite completa del dominio.

Si aparece una decisión nueva o un riesgo irreversible, detente y repórtalo.

### 6.3 Después de implementar

Compara el resultado con la spec y los criterios de aceptación. Revisa caminos de éxito, fallo y límite; autenticación, autorización y validación; integridad de datos, migraciones y rollback; carreras, reintentos y efectos duplicados; compatibilidad de OpenAPI y del esquema; logs sin secretos ni PII; y si las pruebas detectarían una regresión real. Ejecuta los checks oficiales y entrega evidencia exacta y riesgos pendientes. La aprobación final corresponde a una persona o revisor independiente del implementador.

## 7. Uso permitido y prohibido de IA

### Permitido durante el desarrollo

- Explorar y explicar el repositorio; convertir requisitos en specs y criterios de aceptación.
- Proponer planes y alternativas con sus consecuencias.
- Implementar cambios delimitados y generar o mejorar pruebas.
- Diagnosticar errores con evidencia; revisar seguridad, datos, rendimiento y claridad.
- Redactar documentación y entregas.

### Obligaciones

- Revisar cada diff antes de aceptarlo y verificar APIs de librerías con documentación oficial actual.
- Ejecutar pruebas; nunca confiar sólo en la explicación del modelo.
- Registrar en el PR qué herramienta se usó y qué decisiones tomó la persona.
- Registrar en /prompts/antes/, /prompts/durante/ y /prompts/después/ los prompts reales utilizados en cada etapa, retirando secretos, tokens y datos personales e indicando cualquier redacción.
- Registrar en /prompts/tiempos.csv la duración real de cada etapa; no estimar ni reconstruir tiempos que no se midieron.
- Corregir o rechazar propuestas innecesarias, inseguras o fuera de alcance.

### Prohibido

- Incluir SDKs, claves o llamadas a modelos en la aplicación desplegada.
- Crear prompts para el runtime del producto, RAG, embeddings, pgvector o agentes del producto.
- Dar por correcta una respuesta de IA sin revisar código y pruebas.
- Pedir “implementa todo” sin alcance, criterios y restricciones.
- Pegar secretos, datos de producción o información personal en un chat.
- Ocultar fallos con mocks irreales, any, ignores de tipos o pruebas debilitadas.
- Permitir que el mismo asistente implemente, revise y declare aprobación final sin evidencia independiente.

Los prompts de desarrollo no se empaquetan en Docker, el bundle web ni producción. La aplicación no genera costos por tokens o inferencia. Los .dockerignore de los servicios deben excluir /prompts/; el proyecto de Vercel usa web/ como root directory. CI inspecciona las imágenes y el build para demostrar que los prompts de desarrollo no forman parte de los artefactos desplegados.

### Registro de prompts y tiempos

/prompts/README.md define cómo documentar los prompts utilizados antes, durante y después de cada tarea. Guardar el texto realmente usado, la etapa y una referencia a la tarea; no sustituirlo por un prompt idealizado ni incluir instrucciones internas no compartibles. Completar /prompts/tiempos.csv al cerrar la tarea con tiempos medidos por etapa. Si una etapa no ocurrió o no se midió, registrarlo explícitamente sin inventar una duración.

## 8. Comandos oficiales previstos

Estos comandos se aplicarán cuando existan los proyectos y scripts correspondientes. Deben mantenerse actualizados al cambiar el tooling; no son evidencia de que el repositorio ya esté implementado.

### Entorno local

```bash
docker compose up -d postgres

cd api
uv sync --frozen
uv run alembic upgrade head
uv run fastapi dev app/main.py

cd ../web
pnpm install --frozen-lockfile
pnpm dev
```

La integración entre api/ y whatsapp/ se probará con respuestas simuladas; el servicio WhatsApp usará dobles de transporte en las pruebas ordinarias. No se enviarán mensajes reales en pruebas ordinarias.

El comando definitivo del worker y los scripts de whatsapp/ se documentan aquí y en el README cuando esos paquetes existan. No inventar comandos ni afirmar que corren antes de agregarlos al repositorio.

### Verificación frontend

```bash
cd web
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm api:generate
pnpm api:check
pnpm build
pnpm test:e2e
```

pnpm verify debe agrupar formato, lint, tipos, pruebas unitarias, comprobación del cliente OpenAPI y build. Playwright puede ejecutarse por separado contra el entorno adecuado.

### Verificación API

```bash
cd api
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
uv run alembic check
```

### Migraciones

```bash
cd api
uv run alembic revision --autogenerate -m "descripcion breve"
uv run alembic upgrade head
uv run alembic check
```

Una migración creada debe aplicarse localmente antes de la entrega. El autogenerate es un borrador: revisar constraints, índices, nulabilidad, defaults y operaciones destructivas. Antes de ejecutar cualquier migración, verificar entorno, host y nombre de base sin imprimir credenciales. Nunca usar una DATABASE_URL productiva heredada del shell para una migración local.

## 9. Estándares frontend

- TypeScript en modo strict; no agregar archivos .js.
- Server Components por defecto; "use client" sólo cuando sea necesario.
- Cada feature vive en su propia carpeta bajo src/features/; las primitivas compartidas, en src/components/ui, sin negocio.
- React Hook Form y Zod para formularios; FastAPI vuelve a validar.
- TanStack Query sólo para polling, actualización optimista o datos interactivos; no agregar Redux/Zustand sin estado transversal demostrado.
- Todas las vistas cubren loading, vacío, error, permiso denegado y éxito.
- Accesibilidad: HTML semántico, teclado, foco visible y contraste WCAG 2.2 AA.
- JWT y refresh tokens nunca llegan a JavaScript ni a localStorage.
- No silenciar errores con ignoreBuildErrors o equivalentes.

## 10. Estándares backend

- Python con tipos explícitos, Ruff y Pyright estricto.
- Las rutas HTTP validan transporte y llaman servicios. Los servicios contienen reglas de negocio y límites transaccionales.
- Los modelos SQLAlchemy representan persistencia, no workflows de negocio. Los schemas Pydantic de request/response están separados del ORM.
- Toda consulta a datos protegidos aplica autorización del usuario o tenant.
- Toda llamada HTTP saliente define timeout; reintentos sólo para operaciones idempotentes.
- Los errores siguen application/problem+json con type, title, status, detail e instance; code, fieldErrors y traceId son extensiones.
- No mantener una transacción abierta durante una llamada de red.

## 11. Servicio de WhatsApp con Baileys

- Implementar whatsapp/ como proceso persistente de TypeScript/Node.js dentro del monorepositorio y desplegarlo como servicio independiente de la API. Baileys es una dependencia exclusiva de whatsapp/.
- Definir y versionar los endpoints, métodos, payloads, autenticación y respuestas entre api/ y whatsapp/ antes de implementarlos.
- Conectar una única sesión emisora del producto. El equipo la configura en whatsapp/; no existe una sesión ni conexión de WhatsApp por usuario.
- El usuario sólo registra un teléfono destino normalizado a E.164, acepta recibir recordatorios y puede desactivar el canal. Un número activo sólo puede pertenecer a una cuenta a la vez. FastAPI guarda el teléfono cifrado, una huella para comparaciones controladas y una versión enmascarada para la UI; nunca devuelve el valor completo innecesariamente.
- FastAPI decide qué recordatorio puede enviarse, a qué número y cuándo. Un adaptador aislado traduce esas órdenes al contrato del servicio WhatsApp; debe poder sustituirse sin modificar las reglas de negocio.
- El request mínimo entre servicios contiene { phone, message }. Se añade referenceId o Idempotency-Key únicamente si el contrato del servicio lo admite. El navegador nunca conoce esta ruta ni su credencial.
- WHATSAPP_API_URL es la URL base HTTPS pública que Render asigna al desplegar whatsapp/; se configura en el worker después del despliegue. El servicio implementa /v1/messages. No fijar el dominio de Render en el código. En Render Free, usar HTTPS y autenticación entre servicios porque whatsapp/ no puede recibir tráfico privado.
- Toda llamada saliente define timeout y manejo explícito de fallos. Los reintentos sólo se permiten con garantías de idempotencia; un resultado desconocido no debe provocar envíos duplicados.
- Proteger las credenciales entre servicios y la sesión y claves de Baileys como secretos; nunca guardarlas en Git, logs, respuestas del navegador o imágenes de despliegue. Persistir las credenciales y claves Signal de la única sesión en tablas propias de PostgreSQL en Neon, cifradas antes de escribir. La clave de cifrado queda en Render, fuera de Neon; en ejecución, sólo whatsapp/ accede a esas tablas. Las escrituras de claves deben confirmarse antes de continuar. No usar el filesystem efímero de Render Free como fuente de verdad. El servicio WhatsApp no es autoridad de identidad de los usuarios ni fuente de verdad del producto.
- Registrar fecha y versión del consentimiento, aplicar límites de envío y permitir cambiar o desactivar el destino. No usar el servicio para broadcasts, campañas, mensajes masivos ni spam: cada vencimiento produce como máximo una solicitud individual al número autorizado.
- Distinguir estado programado, intento, aceptación por el servicio, fallo y resultado desconocido. Sólo registrar entrega o lectura cuando exista evidencia explícita; un 2xx no basta. Registrar metadatos mínimos, sin contenido sensible innecesario.
- Las pruebas normales simulan el contrato entre servicios y el transporte de Baileys; cualquier prueba con un destinatario real requiere autorización explícita.
- Revisar condiciones de uso del proveedor antes de activar producción. [Baileys](https://github.com/WhiskeySockets/Baileys) no es una integración oficial de WhatsApp; sus mantenedores desaconsejan spam y mensajería masiva automatizada.

## 12. Contratos API

- Prefijo de versión: /api/v1.
- OpenAPI generado por FastAPI es canónico. Regenerar y confirmar el cliente TypeScript en el mismo cambio de contrato; CI falla si queda un diff inesperado.
- 401: identidad ausente o inválida. 403: identidad válida sin permiso. 404: recurso inexistente o no visible. 409: conflicto de versión o idempotencia. 422: payload inválido.
- Toda respuesta de error incluye traceId o request ID correlacionable.
- Las mutaciones críticas aceptan Idempotency-Key cuando pueden reintentarse.
- El contrato entre api/ y whatsapp/ se documenta y prueba en ambos lados; no sustituye la autoridad de FastAPI ni se expone al navegador.

## 13. Base de datos y migraciones

- Alembic es la fuente de verdad del esquema.
- UUID para identificadores públicos y TIMESTAMPTZ en UTC.
- Foreign keys, nulabilidad, unicidad y ON DELETE son explícitos.
- JSONB sólo para datos dinámicos o snapshots; normalizar e indexar columnas consultadas frecuentemente.
- No reescribir migraciones publicadas. CI prueba upgrade head desde una base vacía y verifica un único head.
- Cambios incompatibles: expandir → migrar/backfill → contraer.
- Ninguna migración elimina tablas, columnas o datos sin aprobación explícita, backup verificado y plan de recuperación.
- Producción ejecuta migraciones mediante un job único, no en cada réplica al iniciar.
- Actualizar documentación del esquema y ERD junto con el cambio.

## 14. Autenticación y seguridad

- Contraseñas con Argon2id; nunca cifrado reversible.
- Access JWT corto y refresh token opaco, hasheado, rotatorio y revocable.
- Firma RS256 con kid, allowlist de algoritmo y rotación documentada. Validar iss, aud, exp, iat, jti y sujeto.
- Cookie web HttpOnly, Secure y SameSite=Lax. Proteger mutaciones por cookie contra CSRF y validar Origin.
- CORS con una lista exacta de orígenes; nunca permitir todos los orígenes con credenciales.
- Rate limiting distribuido en registro, login y refresh.
- No registrar passwords, tokens, cookies, bodies completos ni PII.
- Los archivos .env.example contienen sólo nombres y valores ficticios. Secretos en GitHub Environments, Vercel y Render; WHATSAPP_API_URL, la credencial entre servicios y la sesión de Baileys sólo existen en los entornos que las necesitan. El número destino de un usuario es PII: se cifra en reposo, se enmascara en UI y logs y no forma parte de métricas.
- Cuentas demo sólo con datos sintéticos.

## 15. Pruebas obligatorias

### Frontend

- Vitest para lógica y adaptadores.
- React Testing Library y MSW para formularios y componentes cliente.
- Playwright para login, rutas protegidas y flujo principal.
- @axe-core/playwright para accesibilidad de recorridos críticos.

### API

- Unitarias para servicios, validadores y permisos.
- Integración contra PostgreSQL real para constraints y transacciones.
- HTTPX contra FastAPI para contratos y códigos de error.
- Pruebas negativas de autorización y aislamiento de tenant cuando aplique.
- Concurrencia e idempotencia para operaciones reintentables.
- Reloj controlado, zonas horarias, leases vencidas, reinicios y dos workers concurrentes para la programación de recordatorios.

### WhatsApp

- Unitarias de normalización E.164, opt-in, selección autorizada, errores, reintentos, idempotencia y estados de entrega.
- Pruebas del adaptador y del servicio whatsapp/ contra el contrato versionado { phone, message }: éxito, error, timeout y resultado desconocido, sin destinatarios reales.
- Pruebas de que cambiar o desactivar un número impide nuevos envíos al destino anterior y que un fallo de WhatsApp no afecta la notificación interna.

### Reglas

- Las pruebas ordinarias no dependen de red ni servicios externos reales.
- Un mock debe imitar el contrato real; no debe hacer pasar comportamiento imposible.
- No debilitar assertions ni borrar pruebas sólo para obtener CI verde.
- Cobertura recomendada: al menos 80 % en código nuevo y líneas modificadas; el porcentaje no sustituye la revisión.

## 16. Dependencias y código generado

- Añadir una dependencia sólo ante una necesidad actual que no cubra claramente el stack. Explicar en el PR propósito, licencia, mantenimiento y superficie de seguridad.
- Fijar versiones mediante lockfiles. No editar manualmente clientes OpenAPI ni otros archivos generados.
- Dependabot propone actualizaciones; CI y revisión humana deciden su integración.
- GitHub Actions de terceros se fijan por SHA.
- CodeQL, Gitleaks, pip-audit y Trivy forman parte de los controles del repositorio.

## 17. Tamaño, claridad y Git

- Un archivo de producción modificado no debe cruzar 500 líneas; dividir por responsabilidad antes de superar el límite.
- Componentes, servicios y rutas tienen una responsabilidad principal. No crear abstracciones para un solo uso si basta una función clara.
- No mover o renombrar archivos ajenos a la tarea. El código nuevo debe explicarse por el dominio, no por el prompt que lo generó.
- Conservar cambios existentes ajenos a la tarea. No usar git reset --hard, git checkout -- ni comandos destructivos sin petición explícita. No revertir cambios de otra persona o asistente.
- Commits pequeños con una frase que describa el resultado para el usuario.
- Cada PR explica problema, solución, alcance, validación, riesgos y rollback.
- No hacer merge automático: una persona conserva la responsabilidad final.

## 18. Acciones que requieren aprobación humana

- Cambiar arquitectura o proveedor principal.
- Romper un contrato público o formato de datos persistido.
- Introducir una migración destructiva o backfill irreversible.
- Cambiar roles, permisos, autenticación o límites de tenant.
- Enviar emails, mensajes de WhatsApp, pagos u otros efectos externos reales.
- Crear, rotar o revelar secretos; configurar credenciales reales entre servicios o vincular una cuenta de WhatsApp.
- Desplegar a producción o modificar datos productivos.
- Incorporar IA al runtime del producto.

La aprobación debe quedar registrada en la tarea o PR. Una instrucción inferida no es aprobación. La elección de whatsapp/ dentro del monorepositorio autoriza documentar e implementar el servicio y su integración una vez definido el contrato; no autoriza vincular una cuenta real, enviar mensajes reales ni activarlo en producción.

## 19. Formato del handoff

Toda entrega debe incluir:

```md
## Resultado
[Cambio observable]

## Archivos y contratos
[Superficies modificadas]

## Validación
- [comando] — [resultado]

## Migraciones y configuración
[Qué debe aplicarse]

## Seguridad y datos
[Impacto o “sin cambios”]

## Riesgos conocidos
[Limitaciones reales]

## Rollback
[Cómo desactivar o revertir]

## No ejecutado
[Checks omitidos y motivo]
```

## 20. Definition of Done

Una tarea sólo está terminada cuando los puntos aplicables tienen evidencia; los no aplicables se identifican como tales:

- [ ] Cada criterio de aceptación tiene evidencia.
- [ ] El diff contiene únicamente cambios relacionados.
- [ ] Se cubrieron caminos de éxito, errores y límites relevantes.
- [ ] Formato, lint, tipos y pruebas aplicables pasan.
- [ ] El frontend construye correctamente cuando se modifica.
- [ ] OpenAPI y el cliente TypeScript están sincronizados cuando cambia el contrato.
- [ ] Las migraciones fueron revisadas, aplicadas localmente y comprobadas cuando existen.
- [ ] No se expusieron secretos, tokens, PII ni datos productivos.
- [ ] La documentación y .env.example están actualizados cuando corresponde.
- [ ] El PR explica el uso de IA y las decisiones humanas relevantes.
- [ ] Los prompts reales y los tiempos medidos por etapa están registrados en /prompts/, o se indica qué etapa no ocurrió o no se midió.
- [ ] /prompts/ no está incluido en imágenes ni bundles desplegados.
- [ ] Se documentaron despliegue, riesgos y rollback cuando corresponde.
- [ ] Se indican explícitamente los checks no ejecutados.
- [ ] Una persona o revisor independiente aprobó el resultado antes del merge.
- [ ] Producción sigue sin SDK, claves, llamadas ni costos de IA.
- [ ] Si se toca WhatsApp, se verificaron el emisor central, el contrato { phone, message }, opt-in, protección del número destino, reintentos, idempotencia y protección de credenciales y sesión.
