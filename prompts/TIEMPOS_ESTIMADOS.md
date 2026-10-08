# Tiempo aproximado hasta el despliegue

Este registro separa las **horas de trabajo estimadas por el usuario** del tiempo de reloj entre mensajes y despliegues. Las duraciones cronometradas siguen en [tiempos.csv](tiempos.csv); las estimaciones corregidas están en [tiempos_estimados.csv](tiempos_estimados.csv).

## Estimación corregida por etapa

| Etapa | Tiempo | Fuente y alcance |
|---|---:|---|
| Antes: planificación | **4 a 5 horas** | Estimación retrospectiva del usuario. Incluye decisiones de producto y arquitectura que continuaron mientras se iniciaba el código. |
| Durante: desarrollo efectivo | **Aproximadamente 3 horas o menos** | Estimación retrospectiva del usuario; no es el intervalo entre el primer y el último commit. |
| Después: revisión y despliegue | **2 a 3 horas** | Estimación retrospectiva del usuario; [tiempos.csv](tiempos.csv) conserva 17.27 minutos cronometrados dentro de esta etapa. |

Las tres etapas cubren el trabajo hasta el último despliegue de código. No se fija un total único: con desarrollo cercano a 3 horas, la suma orientativa sería **9 a 11 horas**; si fue menor, también baja el total. La cifra anterior de **10 h 51 min se descarta como cálculo por mensajes**: asignar hasta 30 minutos posteriores a cada prompt sobrecontó desarrollo y clasificó mal las etapas. Estos rangos no son duraciones cronometradas.

## Hitos de calendario, no horas trabajadas

- Inicio declarado: **7 de octubre de 2026, 13:00, UTC−06**. El primer prompt recuperado fue a las 12:46:38 y sirve sólo como contexto anterior al inicio declarado.
- Primera publicación de web, API y worker: **7 de octubre, 20:43:59, UTC−06**. Transcurrieron **7 h 43 min 59 s** desde el inicio declarado. El [despliegue de Vercel](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925914845/statuses) terminó entonces; [API](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925482177/statuses) y [worker](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925482190/statuses) ya habían terminado.
- Último despliegue de cambios de código de este corte: **8 de octubre, 10:34:47, UTC−06**. [Vercel](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941088929/statuses), [API](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941148454/statuses) y [worker](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941148653/statuses) registraron éxito. El intervalo de **21 h 34 min 47 s** desde el inicio incluye la noche y otras pausas; no representa trabajo activo.

Los **87 mensajes con hora** de los archivos `*chats-recuperados.md` en [antes](antes/2026-10-07-chats-recuperados.md), [durante](durante/2026-10-07-chats-recuperados.md) y [después](después/2026-10-07-chats-recuperados.md), con sus continuaciones del [8 de octubre](durante/2026-10-08-chats-recuperados.md), permiten ordenar los hitos y ver que las etapas se intercalaron. No miden cuánto se trabajó entre dos mensajes. La [corrección del usuario](después/2026-10-08-correccion-tiempos.md) es la fuente principal de los rangos por etapa.
