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

type DeploymentWindow = (typeof DEPLOYMENT_WINDOWS)[number];
type Environment = (typeof ENVIRONMENTS)[number];

interface FormState {
  application: string;
  deploymentWindow: DeploymentWindow;
  businessProcess: string;
  environment: Environment;
  ambiente: Environment;
  servers: [string, string, string, string];
  path: string;
  diskCount: string;
  diskSize: string;
  remediation: string;
  changeClass: string;
  reason: string;
}

type CopyState = 'idle' | 'copied' | 'error';

const INITIAL_FORM: FormState = {
  application: 'N/A',
  deploymentWindow: 'EPS',
  businessProcess: 'N/A',
  environment: 'PRODUCCION',
  ambiente: 'PRODUCCION',
  servers: ['', '', '', ''],
  path: '/dev/secvm/dev/rENC_DGDTASLW414',
  diskCount: '1',
  diskSize: '400',
  remediation: 'N/A',
  changeClass: 'Estandar (Automático)',
  reason: 'Mantenimiento',
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function serverTable(servers: FormState['servers']): string {
  const cells = servers.map((server) => server.trim() || 'N/A');
  return `${cells[0]}\t${cells[1]}\n${cells[2]}\t${cells[3]}`;
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
    'debe ser implementada en la plataforma con sistema operativo AIX',
    `AMBIENTE ${form.ambiente}`,
    'SERVIDOR y/o IP:',
    serverTable(form.servers),
    'PATH NUEVOS:',
    form.path.trim() || 'N/A',
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
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const template = useMemo(() => renderTemplate(form), [form]);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setCopyState('idle');
  }, [open]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }));
    setCopyState('idle');
  }

  function setServer(index: number, value: string): void {
    setForm((previous) => {
      const servers = [...previous.servers] as FormState['servers'];
      servers[index] = value;
      return { ...previous, servers };
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
                  <span>Entorno</span>
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
                  <span>Ambiente</span>
                  <select
                    value={form.ambiente}
                    onChange={(event) =>
                      setField('ambiente', (event.target as HTMLSelectElement).value as Environment)
                    }
                  >
                    {ENVIRONMENTS.map((environment) => (
                      <option key={environment} value={environment}>{environment}</option>
                    ))}
                  </select>
                </label>
              </div>

              <p class="disk-template-static">Sistema operativo: AIX</p>

              <div class="field">
                <span>SERVIDOR y/o IP (tabla 2 × 2)</span>
                <div class="disk-template-server-grid">
                  {form.servers.map((server, index) => (
                    <input
                      key={index}
                      type="text"
                      value={server}
                      placeholder={`Servidor/IP ${index + 1}`}
                      aria-label={`Servidor o IP ${index + 1}`}
                      onInput={(event) => setServer(index, (event.target as HTMLInputElement).value)}
                    />
                  ))}
                </div>
              </div>

              <div class="disk-template-grid">
                <label class="field">
                  <span>PATH NUEVOS</span>
                  <input
                    type="text"
                    value={form.path}
                    onInput={(event) => setField('path', (event.target as HTMLInputElement).value)}
                  />
                </label>

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
