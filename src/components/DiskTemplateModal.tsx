import { useEffect, useMemo, useState } from 'preact/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEPLOYMENT_WINDOWS = ['EPS', 'SEGUROS', 'ARL', 'DINAMICA'] as const;
const ENVIRONMENTS = [
  'PRODUCCION',
  'DESARROLLO',
  'LABORATORIO',
  'STAGING',
  'SITIO ALTERNO',
] as const;
const OPERATING_SYSTEMS = ['AIX', 'Linux', 'Windows'] as const;

type DeploymentWindow = (typeof DEPLOYMENT_WINDOWS)[number];
type Environment = (typeof ENVIRONMENTS)[number];
type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];

interface ServerRow {
  hostname: string;
  ip: string;
}

interface FormState {
  application: string;
  deploymentWindow: DeploymentWindow;
  businessProcess: string;
  environment: Environment;
  operatingSystem: OperatingSystem;
  servers: ServerRow[];
  paths: string[];
  diskCount: string;
  diskSize: string;
  remediation: string;
  changeClass: string;
  reason: string;
}

type CopyState = 'idle' | 'copied' | 'error';

function createInitialForm(): FormState {
  return {
    application: 'N/A',
    deploymentWindow: 'EPS',
    businessProcess: 'N/A',
    environment: 'PRODUCCION',
    operatingSystem: 'AIX',
    servers: [
      { hostname: '', ip: '' },
      { hostname: '', ip: '' },
    ],
    paths: ['/dev/secvm/dev/rENC_DGDTASLW414'],
    diskCount: '1',
    diskSize: '400',
    remediation: 'N/A',
    changeClass: 'Estandar (Automático)',
    reason: 'Mantenimiento',
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function serverTable(servers: ServerRow[]): string {
  return servers
    .map((server) => `${server.hostname.trim() || 'N/A'}\t${server.ip.trim() || 'N/A'}`)
    .join('\n');
}

function pathLines(paths: string[]): string {
  const values = paths.map((path) => path.trim()).filter(Boolean);
  return values.length > 0 ? values.join('\n') : 'N/A';
}

function renderTemplate(form: FormState): string {
  const diskCount = Math.max(0, Math.floor(Number(form.diskCount) || 0));
  const diskSize = Math.max(0, Number(form.diskSize) || 0);
  const totalSize = diskCount * diskSize;

  return [
    `Aplicación impactada con el cambio: ${form.application.trim() || 'N/A'}`,
    `Ventana despliegue: ${form.deploymentWindow}`,
    `Proceso de negocio a impactar con el cambio: ${form.businessProcess.trim() || 'N/A'}`,
    'Descripción del cambio:',
    'Se solicita una ampliación de la capacidad de almacenamiento en el entorno de',
    form.environment,
    'para soportar el crecimiento proyectado de los datos. Esta necesidad de capacidad adicional',
    `debe ser implementada en la plataforma con sistema operativo ${form.operatingSystem}`,
    `AMBIENTE ${form.environment}`,
    'SERVIDOR y/o IP:',
    serverTable(form.servers),
    'PATH NUEVOS:',
    pathLines(form.paths),
    'CANTIDAD DE DISCOS:',
    `${formatNumber(diskCount)} DISCO`,
    'TAMAÑO DISCOS:',
    `${formatNumber(diskSize)} GB C/U`,
    'TOTAL TAMAÑO:',
    `${formatNumber(totalSize)} GB`,
    `TOTAL DISCOS SOLICITADOS EN LA OC: ${formatNumber(diskCount)} DISCO(s)`,
    `Plan de remediación ante fallas: ${form.remediation.trim() || 'N/A'}`,
    `Clase de cambio: ${form.changeClass.trim() || 'N/A'}`,
    `Motivo de cambio: ${form.reason.trim() || 'N/A'}`,
  ].join('\n');
}

export default function DiskTemplateModal({ open, onClose }: Props) {
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const template = useMemo(() => renderTemplate(form), [form]);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm());
    setCopyState('idle');
  }, [open]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }));
    setCopyState('idle');
  }

  function setServer(rowIndex: number, key: keyof ServerRow, value: string): void {
    setForm((previous) => {
      const servers = previous.servers.map((server, index) =>
        index === rowIndex ? { ...server, [key]: value } : server,
      );
      return { ...previous, servers };
    });
    setCopyState('idle');
  }

  function addServerRow(): void {
    setForm((previous) => ({
      ...previous,
      servers: [...previous.servers, { hostname: '', ip: '' }],
    }));
    setCopyState('idle');
  }

  function removeServerRow(rowIndex: number): void {
    setForm((previous) => {
      if (previous.servers.length <= 2) return previous;
      return {
        ...previous,
        servers: previous.servers.filter((_, index) => index !== rowIndex),
      };
    });
    setCopyState('idle');
  }

  function setPath(index: number, value: string): void {
    setForm((previous) => {
      const paths = [...previous.paths];
      paths[index] = value;
      return { ...previous, paths };
    });
    setCopyState('idle');
  }

  function addPath(): void {
    setForm((previous) => ({ ...previous, paths: [...previous.paths, ''] }));
    setCopyState('idle');
  }

  function removePath(index: number): void {
    setForm((previous) => {
      if (previous.paths.length <= 1) return previous;
      return { ...previous, paths: previous.paths.filter((_, pathIndex) => pathIndex !== index) };
    });
    setCopyState('idle');
  }

  async function copyToClipboard(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(template);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = template;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const legacyDocument = document as unknown as {
          execCommand: (commandId: string) => boolean;
        };
        const copied = legacyDocument.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('El navegador no permitió copiar.');
      }
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  if (!open) return null;

  const diskCount = Math.max(0, Math.floor(Number(form.diskCount) || 0));
  const diskSize = Math.max(0, Number(form.diskSize) || 0);

  return (
    <div
      class="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        class="modal modal--disk-template"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disk-template-title"
      >
        <div class="modal-header">
          <div>
            <h2 id="disk-template-title">Plantilla disco</h2>
            <p>Completa la información y copia la plantilla al portapapeles.</p>
          </div>
          <button type="button" class="modal-close" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>

        <div class="modal-body">
          <div class="disk-template-form">
            <label class="field">
              <span>Aplicación impactada con el cambio</span>
              <input
                type="text"
                value={form.application}
                onInput={(event) => setField('application', (event.target as HTMLInputElement).value)}
              />
            </label>

            <label class="field">
              <span>Ventana despliegue</span>
              <select
                value={form.deploymentWindow}
                onChange={(event) =>
                  setField(
                    'deploymentWindow',
                    (event.target as HTMLSelectElement).value as DeploymentWindow,
                  )
                }
              >
                {DEPLOYMENT_WINDOWS.map((window) => (
                  <option key={window} value={window}>{window}</option>
                ))}
              </select>
            </label>

            <label class="field">
              <span>Proceso de negocio a impactar con el cambio</span>
              <input
                type="text"
                value={form.businessProcess}
                onInput={(event) =>
                  setField('businessProcess', (event.target as HTMLInputElement).value)
                }
              />
            </label>

            <label class="field">
              <span>Plan de remediación ante fallas</span>
              <input
                type="text"
                value={form.remediation}
                onInput={(event) => setField('remediation', (event.target as HTMLInputElement).value)}
              />
            </label>

            <label class="field">
              <span>Clase de cambio</span>
              <input
                type="text"
                value={form.changeClass}
                onInput={(event) => setField('changeClass', (event.target as HTMLInputElement).value)}
              />
            </label>

            <label class="field">
              <span>Motivo de cambio</span>
              <input
                type="text"
                value={form.reason}
                onInput={(event) => setField('reason', (event.target as HTMLInputElement).value)}
              />
            </label>

            <fieldset class="field disk-template-fieldset">
              <legend>Descripción del cambio</legend>
              <div class="disk-template-grid">
                <label class="field">
                  <span>Entorno / Ambiente</span>
                  <select
                    value={form.environment}
                    onChange={(event) =>
                      setField('environment', (event.target as HTMLSelectElement).value as Environment)
                    }
                  >
                    {ENVIRONMENTS.map((environment) => (
                      <option key={environment} value={environment}>{environment}</option>
                    ))}
                  </select>
                </label>

                <label class="field">
                  <span>Sistema operativo</span>
                  <select
                    value={form.operatingSystem}
                    onChange={(event) =>
                      setField(
                        'operatingSystem',
                        (event.target as HTMLSelectElement).value as OperatingSystem,
                      )
                    }
                  >
                    {OPERATING_SYSTEMS.map((operatingSystem) => (
                      <option key={operatingSystem} value={operatingSystem}>{operatingSystem}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div class="field">
                <span>SERVIDOR y/o IP</span>
                <small class="disk-template-hint">Izquierda: hostname · Derecha: IP</small>
                <div class="disk-template-server-list">
                  {form.servers.map((server, index) => (
                    <div class="disk-template-server-row" key={index}>
                      <input
                        type="text"
                        value={server.hostname}
                        placeholder="Hostname"
                        aria-label={`Hostname ${index + 1}`}
                        onInput={(event) => setServer(index, 'hostname', (event.target as HTMLInputElement).value)}
                      />
                      <input
                        type="text"
                        value={server.ip}
                        placeholder="IP"
                        aria-label={`IP ${index + 1}`}
                        onInput={(event) => setServer(index, 'ip', (event.target as HTMLInputElement).value)}
                      />
                      {form.servers.length > 2 && (
                        <button
                          type="button"
                          class="disk-template-row-remove"
                          aria-label={`Quitar fila ${index + 1}`}
                          title="Quitar fila"
                          onClick={() => removeServerRow(index)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  class="disk-template-add"
                  aria-label="Agregar hostname e IP"
                  title="Agregar hostname e IP"
                  onClick={addServerRow}
                >
                  + Agregar hostname/IP
                </button>
              </div>

              <div class="disk-template-grid">
                <div class="field">
                  <div class="disk-template-label-row">
                    <span>PATH NUEVOS</span>
                    <button
                      type="button"
                      class="disk-template-add disk-template-add--inline"
                      aria-label="Agregar path"
                      title="Agregar path"
                      onClick={addPath}
                    >
                      +
                    </button>
                  </div>
                  <div class="disk-template-path-list">
                    {form.paths.map((path, index) => (
                      <div class="disk-template-path-row" key={index}>
                        <input
                          type="text"
                          value={path}
                          placeholder="Path"
                          aria-label={`Path ${index + 1}`}
                          onInput={(event) => setPath(index, (event.target as HTMLInputElement).value)}
                        />
                        {form.paths.length > 1 && (
                          <button
                            type="button"
                            class="disk-template-row-remove"
                            aria-label={`Quitar path ${index + 1}`}
                            title="Quitar path"
                            onClick={() => removePath(index)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div class="field">
                  <span>Totales</span>
                  <div class="disk-template-totals">
                    <label>
                      <small>Cantidad de discos</small>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.diskCount}
                        onInput={(event) => setField('diskCount', (event.target as HTMLInputElement).value)}
                      />
                    </label>
                    <label>
                      <small>Tamaño GB c/u</small>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.diskSize}
                        onInput={(event) => setField('diskSize', (event.target as HTMLInputElement).value)}
                      />
                    </label>
                    <label>
                      <small>Total tamaño</small>
                      <output>{formatNumber(diskCount * diskSize)} GB</output>
                    </label>
                    <label>
                      <small>Total discos OC</small>
                      <output>{formatNumber(diskCount)} DISCO(s)</output>
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          <label class="field">
            <span>Vista previa de la plantilla</span>
            <textarea class="disk-template-preview" value={template} readonly />
          </label>
        </div>

        <div class="modal-footer disk-template-footer">
          {copyState === 'copied' && <span class="notice notice--ok">Copiado al portapapeles</span>}
          {copyState === 'error' && <span class="hint hint--error">No se pudo copiar. Selecciona la vista previa y copia manualmente.</span>}
          <button
            type="button"
            class="button button--template"
            onClick={() => void copyToClipboard()}
            aria-label="Copiar plantilla al portapapeles"
            title="Copiar plantilla al portapapeles"
          >
            <span aria-hidden="true">📋</span> Copiar plantilla
          </button>
          <button type="button" class="button button--ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
