import { useEffect, useState } from 'preact/hooks';
import { isValidDiskgroup } from '../lib/queries';

interface Props {
  open: boolean;
  existingNames: string[];
  tableNames: string[];
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export default function NewDiskgroupModal({ open, existingNames, tableNames, onClose, onConfirm }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) return;
    setName('');
    setError('');
  }, [open]);

  if (!open) return null;

  const normalized = name.trim().toUpperCase();
  const duplicate = existingNames.includes(normalized) || tableNames.includes(normalized);
  const valid = isValidDiskgroup(normalized) && !duplicate;

  function confirm(): void {
    if (!isValidDiskgroup(normalized)) {
      setError('Nombre de diskgroup inválido. Usa solo letras, números y guion bajo (máx. 30).');
      return;
    }
    if (duplicate) {
      setError('Ya existe un diskgroup con ese nombre.');
      return;
    }
    onConfirm(normalized);
  }

  return (
    <div
      class="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-diskgroup-title"
      >
        <div class="modal-header">
          <div>
            <h2 id="new-diskgroup-title">Pedir un diskgroup nuevo</h2>
            <p>El nombre se usará para generar el script CREATE DISKGROUP.</p>
          </div>
          <button type="button" class="modal-close" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div class="modal-body">
            <label class="field">
              <span>Nombre del diskgroup</span>
              <input
                type="text"
                value={name}
                autoFocus
                maxLength={30}
                placeholder="DATA_NUEVO"
                onInput={(event) => {
                  setName((event.target as HTMLInputElement).value.toUpperCase());
                  setError('');
                }}
              />
              <small class={valid || name.trim() === '' ? 'hint' : 'hint hint--error'}>
                Solo letras, números y guion bajo (máx. 30 caracteres).
              </small>
            </label>
            {duplicate && <p class="alert">Ya existe un diskgroup con ese nombre.</p>}
            {error && <p class="alert">{error}</p>}
          </div>

          <div class="modal-footer">
            <button type="submit" class="button button--primary" disabled={!valid}>
              Aceptar
            </button>
            <button type="button" class="button button--ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
