# Nueva tarea TTD

Extensión de Raycast para crear una tarea en [TTD](https://todo.reflexionia.com) desde un panel flotante. Escribes el texto y pulsas Enter. La extensión no interpreta fechas, `#etiquetas`, `^listas` ni `!prioridad`: eso lo hace el servidor.

Solo para Mac, con [Raycast](https://www.raycast.com/) y Node 20 o superior.

## Instalación local

1. Descarga el zip desde Ajustes → Integraciones, o abre esta carpeta del repositorio (`integrations/raycast`).
2. Descomprime el zip si hace falta y, en esa carpeta:

   ```bash
   npm install && npm run dev
   ```

   Raycast importa la extensión sola. Si no aparece: Settings → Extensions → «+» → Import Extension, y elige esta carpeta.

3. Cuando Raycast lo pida, pega un token personal con permiso **Tareas → Escribir**. Se crea en la web, en Ajustes → Tokens (`/settings/tokens`). Raycast lo guarda cifrado. No lo copies a un fichero ni lo dejes en la terminal.
4. La URL del servidor es `https://todo.reflexionia.com`. Cámbiala solo si usas otro servidor.

## Atajo Cmd+Shift+A

1. Abre Raycast y busca «Nueva tarea TTD».
2. En Settings → Extensions → Tick Tack Done → Nueva tarea TTD, graba el atajo.
3. Asigna **Cmd+Shift+A**.

Al pulsarlo se abre solo el formulario, con el foco en el campo. Enter crea la tarea y cierra la ventana.

## Quitar el script command antiguo

Si ya tenías otro «Añadir a TTD», desactívalo para que el atajo no abra dos comandos:

1. En Raycast: Settings → Extensions.
2. Busca el script `quickadd_task.sh` de la carpeta `~/Projects/raycast/`.
3. Desactiva ese comando, o quita esa carpeta de Script Commands.

El comando nuevo es el que debe responder a Cmd+Shift+A.
