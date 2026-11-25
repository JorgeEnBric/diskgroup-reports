# Validador de Diskgroups

Herramienta web local (sin login) para ejecutar 3 consultas maestras contra diskgroups ASM mediante **SQLcl (por defecto)** o **SQL\*Plus**, lanzado desde una **PTY (ConPTY en Windows)** y mostrado en vivo en un terminal xterm.js. Genera un reporte en PDF con portada, una sección por consulta y resumen.

## Requisitos

- Windows 10 1809+ / Windows 11 (necesario para ConPTY).
- Node.js 22.23.4 o superior.
- SQLcl (`sql.exe`) o SQL\*Plus (`sqlplus.exe`) de Oracle, con su ruta completa configurada.

## Instalación

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` (valores de ejemplo para SQLcl):

```dotenv
SQL_CLIENT=sqlcl
SQLPLUS_BIN=C:/oracle/sqlcl/bin/sql.exe
DB_USER=system
DB_PASSWORD=<tu_password>
DB_CONNECT=//host:1521/SERVICE
TNS_ADMIN=
NLS_LANG=AMERICAN_AMERICA.AL32UTF8
JOB_TIMEOUT_MS=120000
JAVA_OPTS=
```

> El password solo existe en el proceso servidor. Nunca se envía al navegador ni se muestra en la PTY. No uses prefijo `PUBLIC_` en ninguna variable.

Para usar SQL\*Plus en lugar de SQLcl:

```dotenv
SQL_CLIENT=sqlplus
SQLPLUS_BIN=C:/oracle/instantclient_19_20/sqlplus.exe
```

## Ejecución

```powershell
npm run dev
```

Abre <http://127.0.0.1:4321>. Para un arranque compilado:

```powershell
npm run build
npm start
```

El servidor compilado escucha en `127.0.0.1:4321` (configurable en `astro.config.mjs`).

## Uso

1. Escribe la etiqueta del informe (por defecto `DATA`); las consultas son globales.
2. Marca las consultas maestras a ejecutar.
3. Pulsa **Ejecutar consultas**. Verás la salida real de SQLcl/SQL\*Plus en el terminal.
4. Revisa la tabla de resultados y pulsa **Descargar PDF**.
5. En la tabla **1. Diskgroups ASM**, usa la columna **ACCION → 🔍 Ver discos** para consultar los discos de ese diskgroup. El resultado se añade como una sección nueva sin borrar las consultas maestras y también entra en el PDF.
6. Cada sección de discos tiene un botón **✕** para cerrarla. Puedes tener varias abiertas a la vez; al cerrar una desaparece del DOM y de futuros PDF.

## Discos del diskgroup

La consulta bajo demanda está en `src/lib/queries.ts` (`dg_disks_by_group`, oculta de la lista inicial):

```sql
SELECT group_number, disk_number, name, path, mount_status, header_status,
       state, redundancy, os_mb, total_mb, free_mb, mount_date
from v$asm_disk
where GROUP_NUMBER IN (
  SELECT GROUP_NUMBER FROM V$ASM_DISKGROUP WHERE NAME = '{{DISKGROUP_NAME}}'
)
ORDER BY name;
```

- El nombre se toma de la fila clickeada y se valida en servidor con `/^[A-Za-z0-9_]{1,30}$/`; el navegador no puede enviar SQL libre.
- Incluye `set lines 180 pages 200` y sentencias `col ... format` para evitar desbordes en SQLcl.
- `HEADER_STATUS <> 'MEMBER'` o `STATE <> 'NORMAL'` se marca como ERROR; sin filas se marca WARN.
- Si pulsas de nuevo **Ver discos** en el mismo diskgroup, se refresca su tarjeta; no se crea un duplicado.
- Cerrar una tarjeta solo la quita de la página: el job en servidor continúa, pero su resultado se ignora.
- Las tablas no muestran badges de estado (`OK`/`WARN`/`ERROR`). El indicador superior de ejecución se conserva.

## Ajustes desde la interfaz (engranaje ⚙)

El botón ⚙ de la barra superior abre un panel que lee y escribe el archivo `.env` del proyecto:

- **Cliente Oracle**: `SQLcl (sql.exe)` por defecto, o `SQL\*Plus (sqlplus.exe)`.
- **Ruta del ejecutable**, **usuario**, **contraseña**, **timeout** y **NLS_LANG**.
- **Conexión directa**: al activar el toggle se muestran **hostname**, **puerto** y **servicio/SID**; al guardar se construye `DB_CONNECT=//host:puerto/servicio`. Al desactivarlo vuelven a usarse `DB_CONNECT` y `TNS_ADMIN`.
- **TNS_ADMIN vacío**: se elimina del entorno del proceso hijo. Así SQLcl no intenta usar una ruta vacía y usa la ubicación por defecto de Oracle.
- **JAVA_OPTS** (solo para SQLcl): se inyecta como `JAVA_TOOL_OPTIONS`. Ejemplo para JVM recientes:
  ```
  --enable-native-access=ALL-UNNAMED --enable-final-field-mutation=ALL-UNNAMED
  ```
  Déjalo vacío si tu Java no admite estos flags. Las líneas `WARNING:` y `Picked up JAVA_TOOL_OPTIONS:` se ocultan en el terminal, pero el log completo queda en memoria del job para depuración.
- La contraseña nunca se devuelve al navegador: se muestra el marcador `__KEEP__`. Déjalo así para conservar la contraseña actual o escríbela nueva para reemplazarla.
- Los cambios se aplican a la siguiente ejecución sin reiniciar el servidor.

## Consultas maestras

Están definidas en `src/lib/queries.ts` y se ejecutan **tal cual**, sin filtrar por la etiqueta del informe:

1. `V$ASM_DISKGROUP`: estado, redundancia y espacio de todos los diskgroups.
2. `V$ASM_DISK WHERE HEADER_STATUS = 'CANDIDATE'`: discos sin asignar; cada fila se marca `WARN` y “sin filas” se marca `OK`.
3. `V$DATABASE`: nombre de la base de datos conectada.

Cada definición tiene:

- `id`, `title`, `description`
- `sql`: se inserta tal cual en el script; si ya termina en `;`, el lanzador no añade otro. El marcador `{{DISKGROUP}}` sigue disponible si algún día necesitas filtrar, pero estas consultas no lo usan.
- `columns`: columnas mostradas en la tabla y en el PDF.
- `evaluate(row)`: devuelve `OK`, `WARN` o `ERROR` aplicando tus umbrales.
- `empty`: estado y mensaje cuando la consulta no devuelve filas.

Los `set lines 180 pages 200` y `col ... format` incluidos en las consultas se respetan; se ejecutan después de los ajustes de formato del lanzador.

## Arquitectura

| Archivo | Función |
| --- | --- |
| `src/pages/api/run.ts` | Valida la petición, crea el job y lanza SQLcl/SQL\*Plus en PTY. |
| `src/pages/api/run-disks.ts` | Consulta bajo demanda “Discos del diskgroup” con parámetro validado. |
| `src/pages/api/stream.ts` | SSE con `snapshot`, `output`, `result`, `status` y `done`. |
| `src/pages/api/cancel.ts` | Cancela el job y mata la PTY. |
| `src/pages/api/settings.ts` | GET/POST del panel ⚙: lee y guarda `.env` de forma atómica. |
| `src/lib/env.ts` | Configuración en caliente, normalización y escritura de `.env`. |
| `src/lib/sqlplus.ts` | Lanzador PTY, script SQL por cliente, filtro de warnings y parseo de resultados. |
| `src/lib/jobs.ts` | Registro de jobs en memoria y pub/sub de eventos. |
| `src/components/*.tsx` | Islas Preact: ajustes, controles, terminal xterm.js y reporte. |
| `src/lib/pdf-client.ts` | Generación del PDF con jsPDF + autoTable. |

## Seguridad

- El servidor escucha solo en `127.0.0.1`. Sin login, por diseño.
- El navegador solo envía un ID de consulta permitido y el nombre del diskgroup validado.
- Las credenciales se pasan en `argv` a `sql.exe` / `sqlplus.exe` (sin `cmd.exe`), por lo que no aparecen en la salida de la PTY.
- Se recomienda no exponer esta herramienta a la LAN. Si se necesita, añade autenticación en un proxy inverso.
- Las peticiones que modifican estado (ejecutar, cancelar, guardar ajustes) exigen la cabecera `X-Requested-With` como protección CSRF mínima.
- Para evitar incluso el password en la línea de comandos del proceso, migra a Oracle Wallet o autenticación externa.

## Notas

- SQLcl usa `SET SQLFORMAT DELIMITED |~| " "`; SQL\*Plus usa `SET COLSEP '|~|'` con `UNDERLINE OFF` y `PAGESIZE 50000`. El parser entiende ambos formatos y desescapa comillas dobles.
- SQLcl se lanza con `TERM=dumb` y `SQLPATH=<directorio temporal>` para evitar problemas de JLine con la PTY y `login.sql` ajenos.
- Cada job usa un directorio temporal en `%TEMP%` que se elimina al finalizar.
- `JOB_TIMEOUT_MS` mata la PTY si la consulta se cuelga.
