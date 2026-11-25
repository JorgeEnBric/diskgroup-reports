# Validador de Diskgroups

Herramienta web local (sin login) para ejecutar 3 consultas maestras contra diskgroups ASM mediante **SQL\*Plus real**, lanzado desde una **PTY (ConPTY en Windows)** y mostrado en vivo en un terminal xterm.js. Genera un reporte en PDF con portada, una sección por consulta y resumen.

## Requisitos

- Windows 10 1809+ / Windows 11 (necesario para ConPTY).
- Node.js 22.23.4 o superior.
- Oracle Instant Client con `sqlplus.exe` (se configura su ruta completa).

## Instalación

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env`:

```dotenv
SQLPLUS_BIN=C:/oracle/instantclient_19_20/sqlplus.exe
DB_USER=system
DB_PASSWORD=<tu_password>
DB_CONNECT=//host:1521/SERVICE
TNS_ADMIN=C:/oracle/instantclient_19_20/network/admin
NLS_LANG=AMERICAN_AMERICA.AL32UTF8
JOB_TIMEOUT_MS=120000
```

> El password solo existe en el proceso servidor. Nunca se envía al navegador ni se muestra en la PTY. No uses prefijo `PUBLIC_` en ninguna variable.

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

1. Escribe el nombre del diskgroup (por defecto `DATA`).
2. Marca las consultas maestras a ejecutar.
3. Pulsa **Ejecutar consultas**. Verás la salida real de SQL\*Plus en el terminal.
4. Revisa la tabla de resultados y pulsa **Descargar PDF**.

## Ajustes desde la interfaz (engranaje ⚙)

El botón ⚙ de la barra superior abre un panel que lee y escribe el archivo `.env` del proyecto:

- **Ruta de sqlplus.exe**, **usuario**, **contraseña**, **timeout** y **NLS_LANG**.
- **Conexión directa**: al activar el toggle se muestran **hostname**, **puerto** y **servicio/SID**; al guardar se construye `DB_CONNECT=//host:puerto/servicio`. Al desactivarlo vuelven a usarse `DB_CONNECT` y `TNS_ADMIN`.
- La contraseña nunca se devuelve al navegador: se muestra el marcador `__KEEP__`. Déjalo así para conservar la contraseña actual o escríbela nueva para reemplazarla.
- Los cambios se aplican a la siguiente ejecución sin reiniciar el servidor.

## Consultas maestras

Las consultas provisionales están en `src/lib/queries.ts`. Cada definición tiene:

- `id`, `title`, `description`
- `sql`: usa `{{DISKGROUP}}` como marcador del diskgroup.
- `columns`: columnas mostradas en la tabla y en el PDF.
- `evaluate(row)`: devuelve `OK`, `WARN` o `ERROR` aplicando tus umbrales.

Sustituye `sql` y `evaluate` por tus 3 consultas reales. El marcador se valida con `/^[A-Za-z0-9_]{1,30}$/` antes de sustituirse, por lo que no se puede inyectar SQL desde el navegador.

## Arquitectura

| Archivo | Función |
| --- | --- |
| `src/pages/api/run.ts` | Valida la petición, crea el job y lanza SQL\*Plus en PTY. |
| `src/pages/api/stream.ts` | SSE con `snapshot`, `output`, `result`, `status` y `done`. |
| `src/pages/api/cancel.ts` | Cancela el job y mata la PTY. |
| `src/pages/api/settings.ts` | GET/POST del panel ⚙: lee y guarda `.env` de forma atómica. |
| `src/lib/env.ts` | Configuración en caliente, normalización y escritura de `.env`. |
| `src/lib/sqlplus.ts` | Genera el script SQL con `SPOOL` y parsea los resultados. |
| `src/lib/jobs.ts` | Registro de jobs en memoria y pub/sub de eventos. |
| `src/components/*.tsx` | Islas Preact: ajustes, controles, terminal xterm.js y reporte. |
| `src/lib/pdf-client.ts` | Generación del PDF con jsPDF + autoTable. |

## Seguridad

- El servidor escucha solo en `127.0.0.1`. Sin login, por diseño.
- El navegador solo envía un ID de consulta permitido y el nombre del diskgroup validado.
- Las credenciales se pasan en `argv` a `sqlplus.exe` (sin `cmd.exe`), por lo que no aparecen en la salida de la PTY.
- Se recomienda no exponer esta herramienta a la LAN. Si se necesita, añade autenticación en un proxy inverso.
- Las peticiones que modifican estado (ejecutar, cancelar, guardar ajustes) exigen la cabecera `X-Requested-With` como protección CSRF mínima.
- Para evitar incluso el password en la línea de comandos del proceso, migra a Oracle Wallet o autenticación externa.

## Notas

- El spool usa `SET COLSEP '|~|'` y `SET UNDERLINE OFF` para un parseo fiable. Si tus datos contienen `|~|`, cambia el delimitador en `src/lib/env.ts`.
- Cada job usa un directorio temporal en `%TEMP%` que se elimina al finalizar.
- `JOB_TIMEOUT_MS` mata la PTY si la consulta se cuelga.
