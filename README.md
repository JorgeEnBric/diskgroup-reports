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
DB_CONNECT=//host:1521/SERVICE
TNS_ADMIN=
NLS_LANG=AMERICAN_AMERICA.AL32UTF8
JOB_TIMEOUT_MS=120000
JAVA_OPTS=
CONFIG_ENCRYPTION_KEY=<clave_base64_de_32_bytes>
```

> `DB_PASSWORD` **no se escribe en `.env`**. La contraseña se descifra de `.config`, queda solo en memoria del servidor y se pasa al cliente Oracle en la línea de conexión. Nunca se envía al navegador ni se muestra en la PTY. No uses prefijo `PUBLIC_` en ninguna variable.

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
7. En **2. Discos candidatos**, usa **ACCION → 📋 Copiar función** para copiar al portapapeles la función `Valido_disco()` y la invocación con el **PATH completo** de esa fila, por ejemplo `Valido_disco /dev/oracleasm/DISCO_1`.
8. Pulsa **Confirmar disco libre**, escribe un nombre de disco y consulta. Si existe se muestra `DISCO YA EXISTE!!!` con sus datos; si no, `Disco consultado NOMBRE, es un disco libre`. Cada resultado se añade como sección eliminable con **✕**; quitarla también la excluye del PDF.
9. Usa **Conexión guardada (.config)**, justo encima de la botonera principal, para cambiar entre las conexiones configuradas a mano. Al elegir una se aplica y se guarda en `.env`.

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
- Cada tarjeta muestra un único título, `Discos del diskgroup NOMBRE`, sin el `<h3>` duplicado.
- Las tablas no muestran badges de estado (`OK`/`WARN`/`ERROR`). El indicador superior de ejecución se conserva.

## Copiar función para discos candidatos

En la tabla **2. Discos candidatos**, la columna **ACCION** incluye **📋 Copiar función**. El texto copiado se genera en `src/lib/candidate-copy.ts` y contiene la función `Valido_disco()` completa más una invocación final construida con el **PATH completo** de la fila:

```bash
Valido_disco /dev/oracleasm/DISCO_1
```

El path se copia tal cual; no se extrae el basename ni se añade `/dev/`. Si la fila no tiene PATH, el botón queda deshabilitado.

## Confirmar disco libre

El botón **Confirmar disco libre** abre un modal que ejecuta esta consulta oculta (`disk_free_check`):

```sql
select 'DISCO YA EXISTE!!!' AS NOTA, name, path, mount_status
from v$asm_disk
where name = '{{DISK_NAME}}';
```

- El nombre se valida en servidor con `/^[A-Za-z0-9_]{1,30}$/`; no se acepta SQL libre.
- Si hay filas, el modal muestra **DISCO YA EXISTE!!!** y una tabla con `NOTA`, `NAME`, `PATH` y `MOUNT_STATUS`.
- Si no hay filas, muestra `Disco consultado NOMBRE, es un disco libre`.
- El resultado se añade como una sección más con botón **✕**, con un único título `Confirmar disco libre NOMBRE` (sin corchetes) y el mismo color del aviso del modal: rojo si el disco existe, verde si está libre, azul mientras consulta. Al cerrar esa sección se elimina del DOM y de futuros PDF.
- Cerrar el modal mientras consulta cancela el job y descarta el resultado.

## Conexiones guardadas (.config)

El panel de la izquierda incluye un desplegable **Conexión guardada (.config)** justo encima de los botones principales. Copia `.config.example` a `.config` y edítalo a mano con este formato:

```text
{
  "password": "<BASE64_NONCE_TAG_CIPHERTEXT>",
SURASTAT/[PASS]@srorcbdd04:1537/DLLFINAN
SURASTAT/[PASS]@mdebdfndmtop01.suramericana.com.co:1537/PDNFNDMTO
SURASTAT/[PASS]@cluster1b-scan.suranet.com:1537/ADMIN
}
```

- Cada conexión se escribe en una línea con el formato `USUARIO/[PASS]@HOST:PUERTO/SERVICIO`. El usuario pasa a `DB_USER` y `HOST:PUERTO/SERVICIO` se convierte en `DB_CONNECT=//HOST:PUERTO/SERVICIO`.
- El desplegable muestra el **servicio** (`DLLFINAN`, `PDNFNDMTO`, `ADMIN`). Si un servicio se repite se numeriza con `_2`, `_3`, etc.
- `[PASS]` es un marcador: el servidor lo sustituye por la contraseña descifrada del campo `password`, una sola para todas las conexiones. El navegador nunca recibe la contraseña ni el marcador.
- `password` es una clave reservada con cifrado AES-256-GCM y clave de 32 bytes en `CONFIG_ENCRYPTION_KEY` (base64 o hexadecimal). El valor guardado es base64 de `nonce(12) + tag(16) + ciphertext`.
- El valor de `password` se mantiene fijo; la herramienta **no lo regenera**. El servidor lo descifra al iniciar con `CONFIG_ENCRYPTION_KEY` y conserva la contraseña solo en memoria.
- Al elegir una conexión se escriben `DB_USER`, `DB_CONNECT` y `TNS_ADMIN` en `.env`, se actualiza la conexión activa y se recarga la contraseña maestra en memoria. **`DB_PASSWORD` no se escribe en `.env`.**
- El desplegable incluye un buscador por nombre, usuario o cadena de conexión, con contador de coincidencias y botón **↻** para recargar `.config`.
- Se permiten llaves, comas finales, líneas vacías y comentarios (`#`, `//`, `--`). Una línea malformada produce un error con su número.
- La lista también se recarga al volver a enfocar la ventana.
- Si `.config` no existe, el desplegable queda vacío. Una conexión inexistente o un error de cifrado muestra un error sin modificar `.env`.

## Ajustes desde la interfaz (engranaje ⚙)

El botón ⚙ de la barra superior abre un panel que lee y escribe el archivo `.env` del proyecto:

- **Cliente Oracle**: `SQLcl (sql.exe)` por defecto, o `SQL\*Plus (sqlplus.exe)`.
- **Ruta del ejecutable**, **usuario**, **timeout** y **NLS_LANG**. La contraseña no se edita aquí: se toma de `.config`.
- **Conexión directa**: al activar el toggle se muestran **hostname**, **puerto** y **servicio/SID**; al guardar se construye `DB_CONNECT=//host:puerto/servicio`. Al desactivarlo vuelven a usarse `DB_CONNECT` y `TNS_ADMIN`.
- **TNS_ADMIN vacío**: se elimina del entorno del proceso hijo. Así SQLcl no intenta usar una ruta vacía y usa la ubicación por defecto de Oracle.
- **JAVA_OPTS** (solo para SQLcl): se inyecta como `JAVA_TOOL_OPTIONS`. Ejemplo para JVM recientes:
  ```
  --enable-native-access=ALL-UNNAMED --enable-final-field-mutation=ALL-UNNAMED
  ```
  Déjalo vacío si tu Java no admite estos flags. Las líneas `WARNING:` y `Picked up JAVA_TOOL_OPTIONS:` se ocultan en el terminal, pero el log completo queda en memoria del job para depuración.
- **Contraseña**: se muestra el marcador `__CONFIG__` cuando la maestra de `.config` está disponible. La contraseña descifrada nunca se devuelve al navegador ni se escribe en `.env`.
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
| `src/pages/api/check-disk-free.ts` | Consulta oculta “Confirmar disco libre” con nombre de disco validado. |
| `src/pages/api/connections.ts` | Lee `.config`, aplica una conexión y actualiza `.env` sin contraseña. |
| `src/lib/connections.ts` | Parser de `.config` y descifrado AES-256-GCM de la contraseña. |
| `src/lib/master-password.ts` | Contraseña maestra descifrada en memoria, nunca persistida. |
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
