/**
 * Texto que se copia al portapapeles desde la tabla "Discos candidatos".
 * Se usa String.raw para conservar literalmente comillas, `$` y saltos de línea.
 */
export function buildCandidateCopyText(path: string): string {
  const diskPath = path.trim();
  const fn = String.raw`Valido_disco() {
    d=$1; [ -e "$d" ] || return 1
    ls -l "$d"
    r=$d
    while [ -L "$r" ]; do
        t=$(ls -ld "$r" | sed 's/.* -> //')
        case $t in /*) r=$t ;; *) r=$(dirname "$r")/$t ;; esac
    done
    set -- $(ls -ld "$r" | awk '{print $5, $6}')
    [ -n "$2" ] || return 1
    ls -l "$(dirname "$r")" | awk -v a="$1" -v b="$2" '$5==a && $6==b'
    echo "Validando cabecera"
    kfed read "$d"
}
`;

  return diskPath ? `${fn}Valido_disco ${diskPath}` : fn.trimEnd();
}
