# Tiempo aproximado hasta el despliegue

Esta reconstrucción responde a la solicitud de estimar el tiempo con los mensajes de `prompts/`. **No es una medición de horas trabajadas.** El registro de duraciones observadas sigue en [tiempos.csv](tiempos.csv); los resultados retrospectivos están en [tiempos_estimados.csv](tiempos_estimados.csv).

## Resultado

| Corte | Antes | Durante | Después | Total aproximado |
|---|---:|---:|---:|---:|
| Primera publicación de web, API y worker, 7 de octubre de 2026, 20:43:59 (México) | — | — | — | **7 h 09 min** |
| Último despliegue de cambios de código, 8 de octubre de 2026, 10:34:47 (México) | **4 h 11 min** | **5 h 41 min** | **59 min** | **10 h 51 min** |

Las columnas por etapa son aproximaciones del período hasta el **último despliegue de código**. Los despliegues posteriores de cambios sólo documentales quedan fuera de ese corte. Las etapas se intercalaron durante el desarrollo; el total no equivale al tiempo continuo entre el inicio y el fin. El primer despliegue se conserva como hito intermedio y no se suma al final.

## Fuentes y cálculo

1. Inicio de trabajo: **7 de octubre de 2026 a las 13:00, UTC−06**, hora declarada por el usuario en el registro original. Hay un prompt anterior, a las 12:46:38, que se trata como contexto y se acota al inicio declarado.
2. Se extrajeron **87 mensajes con hora**, correspondientes a **86 instantes distintos**, de los archivos `*chats-recuperados.md` en [antes](antes/2026-10-07-chats-recuperados.md), [durante](durante/2026-10-07-chats-recuperados.md) y [después](después/2026-10-07-chats-recuperados.md), junto con sus continuaciones del 8 de octubre en [antes](antes/2026-10-08-chats-recuperados.md), [durante](durante/2026-10-08-chats-recuperados.md) y [después](después/2026-10-08-chats-recuperados.md). Los demás prompts sólo indican fecha o tarea y no aportan una hora exacta para esta suma. Se interpretaron las horas como UTC−06 porque el prompt de las 13:51:41 del 7 de octubre coincide con el commit inicial de las 13:51:52 en ese huso.
3. Se ordenaron los instantes. Para cada mensaje se tomó el intervalo hasta el siguiente mensaje o hasta el despliegue, **con un máximo de 30 minutos**. El intervalo se atribuyó a la etapa de la carpeta del mensaje. Si dos etapas tienen mensajes con la misma hora, se dividió ese intervalo a partes iguales. Los minutos por encima del límite quedaron sin asignar; no se contaron como trabajo.
4. Los eventos de despliegue de GitHub fijan los cortes. La primera [publicación de Vercel](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925914845/statuses) terminó a las 20:43:59; [API](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925482177/statuses) y [worker](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6925482190/statuses) ya habían terminado. En el último corte de código, [Vercel](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941088929/statuses) terminó a las 10:30:49, [API](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941148454/statuses) a las 10:34:45 y [worker](https://api.github.com/repos/Eliseo10208/recordatorios-mvp/deployments/6941148653/statuses) a las 10:34:47.

Con el límite de 30 minutos, el total hasta ese último despliegue calculado es **650.85 minutos**, redondeado a **10 h 51 min**. El tiempo de reloj desde las 13:00 hasta ese despliegue fue **21 h 34 min 47 s**; aproximadamente **10 h 44 min** quedaron sin asignar por huecos entre mensajes, sobre todo durante la noche. Si se cambiara el límite a 15 o 45 minutos, el cálculo variaría entre **8 h 22 min** y **12 h 04 min**. Esa variación muestra la incertidumbre del método.

Estas cifras describen ventanas inferidas de interacción y pueden incluir pausas breves o excluir trabajo sin mensajes. La etapa de cada mensaje orienta la distribución, pero no demuestra qué se hizo durante todos los minutos siguientes. Las seis duraciones medidas directamente en [tiempos.csv](tiempos.csv) se conservan tal como estaban y **no se suman otra vez** a esta estimación.
