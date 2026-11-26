import { useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_SQL_CLIENT,
  KEEP_PASSWORD,
  type PublicSettings,
  type SqlClient,
} from '../lib/settings-shared';

interface FormState {
  sqlClient: SqlClient;
  sqlplusBin: string;
  dbUser: string;
  dbPassword: string;
  directConnection: boolean;
  host: string;
  port: string;
  service: string;
  dbConnect: string;
  tnsAdmin: string;
  nlsLang: string;
  timeoutMs: string;
  javaOpts: string;
}

const initialForm: FormState = {
  sqlClient: DEFAULT_SQL_CLIENT,
  sqlplusBin: '',
  dbUser: '',
  dbPassword: '',
  directConnection: false,
  host: '',
  port: '1521',
  service: '',
  dbConnect: '',
  tnsAdmin: '',
  nlsLang: 'AMERICAN_AMERICA.AL32UTF8',
  timeoutMs: '120000',
  javaOpts: '',
};

interface TextFieldProps {
  label: string;
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  hint?: string;
}

function TextField({ label, value, onValue, placeholder, type = 'text', hint }: TextFieldProps) {
  const readValue = (event: Event) => onValue((event.target as HTMLInputElement).value);

  return (
    <label class="settings-field">
      <span>{label}</span>
      {type === 'password' ? (
        <input
          type="password"
          value={value}
          placeholder={placeholder}
          onInput={(event) => readValue(event as Event)}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onInput={(event) => readValue(event as Event)}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [envPath, setEnvPath] = useState('');
  const [form, setForm] = useState<FormState>(initialForm);
  const [masterPassword, setMasterPassword] = useState('');
  const [masterEncrypted, setMasterEncrypted] = useState('');
  const [encrypting, setEncrypting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setMessage('');
    setError('');

    fetch('/api/settings')
      .then((response) => response.json())
      .then((data: PublicSettings & { envPath?: string }) => {
        if (!active) return;
        setEnvPath(data.envPath ?? '');
        setForm({
          sqlClient: data.sqlClient ?? DEFAULT_SQL_CLIENT,
          sqlplusBin: data.sqlplusBin ?? '',
          dbUser: data.dbUser ?? '',
          dbPassword: data.dbPassword ?? '',
          directConnection: Boolean(data.directConnection),
          host: data.dbHost ?? '',
          port: data.dbPort || '1521',
          service: data.dbService ?? '',
          dbConnect: data.dbConnect ?? '',
          tnsAdmin: data.tnsAdmin ?? '',
          nlsLang: data.nlsLang ?? 'AMERICAN_AMERICA.AL32UTF8',
          timeoutMs: String(data.timeoutMs ?? 120000),
          javaOpts: data.javaOpts ?? '',
        });
      })
      .catch(() => {
        if (active) setError('No se pudieron cargar los ajustes actuales.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function readClient(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    update('sqlClient', value === 'sqlplus' ? 'sqlplus' : DEFAULT_SQL_CLIENT);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'No se pudieron guardar los ajustes.');
        return;
      }

      setMessage('Ajustes guardados en .env. Se aplicarán a la siguiente ejecución.');
      window.dispatchEvent(new CustomEvent('dg:settings-changed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function encryptMaster(): Promise<void> {
    if (!masterPassword.trim()) {
      setError('Escribe la contraseña maestra antes de cifrarla.');
      return;
    }

    setEncrypting(true);
    setMessage('');
    setError('');
    setMasterEncrypted('');

    try {
      const response = await fetch('/api/encrypt-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ password: masterPassword }),
      });
      const data = (await response.json()) as { encrypted?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'No se pudo cifrar la contraseña.');
        return;
      }

      setMasterEncrypted(data.encrypted ?? '');
      setMessage('Contraseña cifrada y guardada en .config.');
      setMasterPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEncrypting(false);
    }
  }

  async function copyEncrypted(): Promise<void> {
    if (!masterEncrypted) return;
    try {
      await navigator.clipboard.writeText(masterEncrypted);
      setMessage('Valor cifrado copiado al portapapeles.');
    } catch {
      setError('No se pudo copiar el valor cifrado.');
    }
  }

  const isSqlcl = form.sqlClient === 'sqlcl';
  const binaryLabel = isSqlcl ? 'Ruta de sql.exe / sqlcl.exe' : 'Ruta de sqlplus.exe';
  const binaryPlaceholder = isSqlcl
    ? 'C:/oracle/sqlcl/bin/sql.exe'
    : 'C:/oracle/instantclient_19_20/sqlplus.exe';

  return (
    <>
      <button class="gear-button" title="Ajustes (.env)" aria-label="Abrir ajustes" onClick={() => setOpen(true)}>
        ⚙
      </button>

      {open && (
        <div
          class="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div class="modal" role="dialog" aria-modal="true" aria-label="Ajustes de conexión">
            <header class="modal-header">
              <div>
                <h2>Ajustes</h2>
                <p>Edita el archivo .env usado por {isSqlcl ? 'SQLcl' : 'SQL*Plus'}.</p>
              </div>
              <button class="modal-close" aria-label="Cerrar" onClick={() => setOpen(false)}>
                ✕
              </button>
            </header>

            <div class="modal-body">
              {loading ? (
                <p class="settings-loading">Cargando ajustes…</p>
              ) : (
                <>
                  <label class="toggle-row">
                    <input
                      type="checkbox"
                      checked={form.directConnection}
                      onChange={(event) => update('directConnection', (event.target as HTMLInputElement).checked)}
                    />
                    <span class="switch" aria-hidden="true" />
                    <span>
                      <strong>Conexión directa</strong>
                      <small>Define usuario, hostname, puerto y servicio en lugar de DB_CONNECT / TNS.</small>
                    </span>
                  </label>

                  <div class="settings-grid">
                    <label class="settings-field">
                      <span>Cliente Oracle</span>
                      <select value={form.sqlClient} onChange={(event) => readClient(event as Event)}>
                        <option value="sqlcl">SQLcl (sql.exe) — recomendado</option>
                        <option value="sqlplus">SQL*Plus (sqlplus.exe)</option>
                      </select>
                      <small>SQLcl es el cliente por defecto.</small>
                    </label>
                    <TextField
                      label={binaryLabel}
                      value={form.sqlplusBin}
                      onValue={(value) => update('sqlplusBin', value)}
                      placeholder={binaryPlaceholder}
                    />
                    <TextField
                      label="Usuario"
                      value={form.dbUser}
                      onValue={(value) => update('dbUser', value)}
                      placeholder="system"
                    />
                    <TextField
                      label="Contraseña"
                      type={form.dbPassword === KEEP_PASSWORD ? 'text' : 'password'}
                      value={form.dbPassword}
                      onValue={(value) => update('dbPassword', value)}
                      placeholder="contraseña"
                      hint="Déjala como __KEEP__ para conservar la contraseña actual."
                    />
                    <TextField
                      label="Timeout (ms)"
                      value={form.timeoutMs}
                      onValue={(value) => update('timeoutMs', value)}
                      placeholder="120000"
                    />
                  </div>

                  <h3 class="settings-section">Conexión</h3>
                  {form.directConnection ? (
                    <div class="settings-grid">
                      <TextField
                        label="Hostname"
                        value={form.host}
                        onValue={(value) => update('host', value)}
                        placeholder="srv-oracle01"
                      />
                      <TextField
                        label="Puerto"
                        value={form.port}
                        onValue={(value) => update('port', value)}
                        placeholder="1521"
                      />
                      <TextField
                        label="Servicio / SID"
                        value={form.service}
                        onValue={(value) => update('service', value)}
                        placeholder="ORCL"
                        hint="Se construye //host:puerto/servicio."
                      />
                    </div>
                  ) : (
                    <div class="settings-grid">
                      <TextField
                        label="DB_CONNECT"
                        value={form.dbConnect}
                        onValue={(value) => update('dbConnect', value)}
                        placeholder="//host:1521/SERVICE o alias TNS"
                      />
                      <TextField
                        label="TNS_ADMIN"
                        value={form.tnsAdmin}
                        onValue={(value) => update('tnsAdmin', value)}
                        placeholder={isSqlcl ? 'C:/oracle/sqlcl/network/admin' : 'C:/oracle/instantclient/network/admin'}
                        hint="Déjalo vacío para usar la ubicación por defecto de Oracle."
                      />
                    </div>
                  )}

                  <h3 class="settings-section">Contraseña maestra (.config)</h3>
                  <div class="settings-grid">
                    <label class="settings-field">
                      <span>Contraseña maestra</span>
                      <input
                        type="password"
                        value={masterPassword}
                        placeholder="Contraseña única para .config"
                        onInput={(event) => setMasterPassword((event.target as HTMLInputElement).value)}
                      />
                      <small>Se cifra en el servidor y se guarda en .config. No se guarda en .env.</small>
                    </label>
                    <label class="settings-field">
                      <span>Valor cifrado</span>
                      <div class="settings-inline">
                        <input
                          type="text"
                          value={masterEncrypted}
                          placeholder="Se generará al cifrar"
                          readOnly
                        />
                        <button
                          type="button"
                          class="button button--ghost button--small"
                          onClick={() => void copyEncrypted()}
                          disabled={!masterEncrypted}
                          title="Copiar valor cifrado"
                        >
                          📋
                        </button>
                      </div>
                      <small>AES-256-GCM con la clave CONFIG_ENCRYPTION_KEY del servidor.</small>
                    </label>
                  </div>
                  <div class="settings-actions">
                    <button
                      type="button"
                      class="button button--primary button--small"
                      onClick={() => void encryptMaster()}
                      disabled={loading || encrypting}
                    >
                      {encrypting ? 'Cifrando…' : 'Cifrar y guardar en .config'}
                    </button>
                  </div>

                  <h3 class="settings-section">Opciones avanzadas</h3>
                  <div class="settings-grid">
                    <TextField
                      label="NLS_LANG"
                      value={form.nlsLang}
                      onValue={(value) => update('nlsLang', value)}
                      placeholder="AMERICAN_AMERICA.AL32UTF8"
                    />
                    {isSqlcl && (
                      <TextField
                        label="JAVA_OPTS"
                        value={form.javaOpts}
                        onValue={(value) => update('javaOpts', value)}
                        placeholder="--enable-native-access=ALL-UNNAMED ..."
                        hint="Se inyecta como JAVA_TOOL_OPTIONS. Déjalo vacío si tu Java no admite estos flags."
                      />
                    )}
                  </div>

                  {envPath && (
                    <p class="settings-path">
                      Archivo: <code>{envPath}</code>
                    </p>
                  )}
                  {message && <p class="settings-success">{message}</p>}
                  {error && <p class="alert">{error}</p>}
                </>
              )}
            </div>

            <footer class="modal-footer">
              <button class="button button--ghost" onClick={() => setOpen(false)}>
                Cerrar
              </button>
              <button class="button button--primary" onClick={() => void save()} disabled={loading || saving}>
                {saving ? 'Guardando…' : 'Guardar ajustes'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
