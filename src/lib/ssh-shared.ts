/** Tipos compartidos entre el servidor y el selector de instancias SSH. */

export interface SshInstanceOption {
  id: string;
  database: string;
  ambiente: string;
  host: string;
  ip: string;
  label: string;
}
