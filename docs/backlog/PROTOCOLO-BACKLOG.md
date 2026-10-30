# Protocolo del backlog de ttd

Destino en el repo: `docs/backlog/PROTOCOLO-BACKLOG.md`. Forma parte del harness: lo aplica el **coordinador de proyecto**, y la skill `backlog-github-projects` tiene los comandos.

## 1. Fuentes de verdad

| Pieza | Qué es | Quién la escribe |
|---|---|---|
| **Project «ttd · backlog»** (GitHub Projects v2, privado) | **Estado vivo.** Si hay discrepancia, manda el Project | Coordinador, agentes con scope `project`, workflows y Pablo |
| **Issues `BKL-NNN`** | Una unidad de trabajo o decisión, con contexto, siguiente paso y decisión pendiente | Coordinador o agente; Pablo |
| **`docs/backlog/BACKLOG.md`** | **Espejo legible** del Project, versionado. El bloque entre `backlog:inicio` y `backlog:fin` es generado | `scripts/backlog/generar-backlog.sh`, a mano o con backlog-sync. Se revisa en la PR |
| **`docs/backlog/DECISIONES.md`** | **Registro** de decisiones: pregunta, opciones, recomendación, origen, estado, fecha y decisión | La PR que aplica la decisión. Solo Pablo decide |

El campo nativo de GitHub se llama `Status` y no se puede renombrar. En este protocolo,
«Estado» se refiere a ese campo con sus siete opciones en español. Se conserva el campo
nativo para que funcionen las automatizaciones integradas; no se crea un campo duplicado.

IDs estables: `BKL-NNN` para el trabajo y `DEC-NNN` para las decisiones. No se reutilizan.

## 2. Estados y definición de hecho

| Estado | Entra cuando | Sale cuando |
|---|---|---|
| Idea | Se registra una idea, bug o deuda | Se pide decisión o se escribe spec |
| Decidir | Falta una decisión de Pablo (etiqueta `decision-pendiente` y fila en DECISIONES) | Pablo decide |
| Spec lista | Hay spec o prompt entregado y aprobado | Un agente empieza |
| En Codex/PR | Un agente trabaja o hay PR abierta. **Máximo 3 a la vez** | Se fusiona la PR que la cierra |
| Fusionado | La PR con «Closes #N» se fusiona (automático). Etiqueta `pendiente-despliegue` | El commit llega a producción y se prueba |
| Desplegado | **Hecho.** `/api/v1/health` publica un commit que contiene el merge **y** se ha hecho la prueba de la PR en producción. Etiqueta `verificado-prod` | — |
| Descartado | Pablo lo descarta; se cierra como «not planned» con el motivo | — |

**Definición de hecho:** solo cuenta como hecho lo que está en **Desplegado**. «Fusionado» no es hecho. La etiqueta `en-produccion` (que pone backlog-sync) significa que el código está en producción pero **falta la prueba**.

**Límite de WIP:** como mucho **3** elementos en «En Codex/PR». Si ya hay 3, antes de empezar otro se termina, se bloquea (vuelve a «Decidir» con el motivo) o se pausa (vuelve a «Spec lista») uno de los que hay. El tablero lleva el límite de columna en 3 para que se vea.

## 3. Reglas por evento

| Evento | Project | Issue | Ficheros | Quién |
|---|---|---|---|---|
| **Idea nueva** | Item en «Idea», con Prioridad, Area, Tipo y Referencia | Issue `BKL-NNN` con la plantilla | — (BACKLOG se regenera) | Coordinador o agente; Pablo si la apunta él |
| **Necesita decisión** | «Decidir» | Etiqueta `decision-pendiente`; plantilla «Decisión» si es una decisión pura | Fila `DEC-NNN` «Abierta» en DECISIONES.md (en la siguiente PR de docs) | Coordinador |
| **Decisión tomada** | Al estado que toque (Spec lista, Idea o Descartado) | Quitar `decision-pendiente`; comentario con la decisión | Fila «Decidida» con fecha, elección y motivo, **en la PR que la aplica** (o en una PR de docs si no hay código) | Pablo decide; el coordinador o el agente lo registran |
| **Spec o prompt entregado** | «Spec lista»; Referencia = documento | Comentario con el nombre del documento | — | Quien escribe la spec |
| **Empieza el trabajo / PR abierta** | «En Codex/PR» (comprobar WIP ≤ 3) | La PR lleva «Closes #N» (termina) o «Refs #N» (avanza) | — | Agente (Codex o Cursor) |
| **PR fusionada** | «Fusionado» (automático: workflow integrado y backlog-sync) | `pendiente-despliegue` + comentario con el merge | — | Automático; el coordinador lo revisa |
| **Desplegado** | Sigue en «Fusionado»; backlog-sync detecta el commit por `/api/v1/health` y pone `en-produccion` | Comentario con el commit de producción | — | Automático (o a mano con `curl`) |
| **Verificado en producción** | «Desplegado» | `verificado-prod`; casilla «verificado en producción» de la PR marcada | — | Quien hace la prueba (agente con cuenta de prueba, o Pablo) |
| **Descartado** | «Descartado» (corregir si el workflow lo pone en Fusionado al cerrar) | Cerrar como «not planned» con el motivo | Fila de DECISIONES a «Decidida» si venía de una decisión | Pablo decide; el coordinador lo registra |

## 4. Quién actualiza qué

- **Coordinador de proyecto (harness):** dueño del backlog. Al inicio y al cierre de cada tarea: crea issues, mueve estados, vigila el WIP, abre filas en DECISIONES y regenera BACKLOG.md. No decide producto.
- **Codex/Cursor (agentes que implementan), vía PR:** enlazan la issue (Closes/Refs), la ponen en «En Codex/PR» si tienen el scope `project` (si no, lo dejan escrito en la PR) y actualizan DECISIONES.md cuando aplican una decisión. No editan el bloque generado.
- **Grok Bot (ticktackdone), en el repaso semanal:** contrasta el Project con el código, las PRs y `/api/v1/health`, propone movimientos y prepara el resumen y las decisiones pendientes. Con el acceso actual (solo lectura) **no escribe en GitHub**: entrega los comandos para que los ejecute Pablo o un agente con permiso.
- **Pablo:** decide (DECISIONES), prioriza, aprueba PRs y, si quiere, marca «Desplegado» tras probar.
- **Workflows:** «Item closed» y «Pull request merged» (integrados) → Fusionado; `backlog-sync` → check de PR, comentarios, `en-produccion` y PR de regeneración de BACKLOG.md.

## 5. Cadencia

- **Al cierre de cada PR:** issue y Project al día (lo automático más la revisión del coordinador); DECISIONES en la misma PR si aplica.
- **Cada día laborable a las 07:00 (hora de Madrid):** backlog-sync regenera BACKLOG.md y, si hay cambios, abre o actualiza la PR `chore/backlog-sync`.
- **Cada hora:** backlog-sync mira `/api/v1/health` para detectar despliegues.
- **Repaso semanal (viernes, ≈15 min):** Grok Bot prepara el informe; Pablo decide lo que esté en «Decidir» y fusiona la PR de BACKLOG.md.
- Fines de semana y festivos: sin repaso ni avisos.

## 6. Higiene

- Sin datos personales, de familia ni nombres de clientes en issues, PRs o ficheros del backlog. Los documentos se citan por su nombre, nunca por rutas locales.
- Si el repo vuelve a ser público, se revisa DECISIONES.md antes y se pasa al repo privado lo que tenga contexto personal.
- Una issue por unidad que se pueda desplegar. Las épicas se reparten en sub-issues.
