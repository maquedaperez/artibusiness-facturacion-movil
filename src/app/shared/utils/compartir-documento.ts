import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Encontrado en revisión 2026-08-19: documentoNombre nunca se reconstruye al leer una
// factura ya existente (el backend no lo guarda, solo vive mientras dura la sesión en la
// que se adjuntó) — sin esto, descargar/compartir el documento de una factura recargada
// (otra sesión, otro dispositivo) perdía la extensión por completo ("documento-adjunto" en
// vez de "documento-adjunto.pdf"), dificultando abrirlo por asociación de tipo de archivo.
const EXTENSION_POR_CONTENT_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Cómo acabó el archivo en manos del usuario.
 *
 * 'cancelado' NO es un error: en móvil, cerrar el diálogo del sistema sin elegir nada es
 * una respuesta perfectamente válida. Quien llama debe callarse en ese caso, no avisar de
 * que algo ha fallado.
 */
export type ResultadoDeEntrega = 'descargado' | 'compartido' | 'cancelado';

function conExtension(nombreArchivo: string, blob: Blob): string {
  if (/\.[a-z0-9]+$/i.test(nombreArchivo)) return nombreArchivo;
  const extension = EXTENSION_POR_CONTENT_TYPE[blob.type];
  return extension ? `${nombreArchivo}.${extension}` : nombreArchivo;
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Cerrar el diálogo del sistema sin elegir nada llega como excepción, no como un "no".
// Sin distinguirlo, pensárselo mejor se vería como "no se pudo descargar la factura".
//
// Se exporta solo para poder probarlo: depende del TEXTO que manda el plugin ("Share
// canceled"), que es justo la clase de detalle que cambia de versión en versión sin avisar.
export function esCancelacion(error: unknown): boolean {
  const mensaje = (error as { message?: string } | undefined)?.message ?? '';
  return /cancel/i.test(mensaje);
}

/**
 * EN MÓVIL NO EXISTE "DESCARGAR": el archivo se escribe en la caché de la app y se ofrece
 * al usuario con el diálogo del sistema, donde "Guardar en Archivos" es una opción más
 * junto a Mail, WhatsApp o AirDrop. Es el único camino que hay, y sirve para las dos cosas
 * (bajar y compartir), por eso lo comparten compartirBlob() y descargarBlob().
 */
async function entregarEnNativo(blob: Blob, nombreArchivo: string): Promise<ResultadoDeEntrega> {
  const base64 = await blobABase64(blob);
  const archivo = await Filesystem.writeFile({
    path: nombreArchivo,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({ title: nombreArchivo, url: archivo.uri });
  } catch (error) {
    if (esCancelacion(error)) return 'cancelado';
    throw error;
  }
  return 'compartido';
}

// La descarga de toda la vida del navegador. Solo funciona en web.
function descargarEnNavegador(blob: Blob, nombreArchivo: string): ResultadoDeEntrega {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'descargado';
}

// Comparte un Blob usando el mecanismo estándar de cada plataforma: en nativo (Capacitor)
// escribe el archivo en caché y usa el diálogo de compartir del sistema; en web usa la Web
// Share API si el navegador la soporta con ficheros, o descarga directa como último recurso.
export async function compartirBlob(blob: Blob, nombreArchivoSolicitado: string): Promise<ResultadoDeEntrega> {
  const nombreArchivo = conExtension(nombreArchivoSolicitado, blob);
  if (Capacitor.isNativePlatform()) return entregarEnNativo(blob, nombreArchivo);

  const archivo = new File([blob], nombreArchivo, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [archivo] }) && nav.share) {
    await nav.share({ files: [archivo], title: nombreArchivo });
    return 'compartido';
  }

  return descargarEnNavegador(blob, nombreArchivo);
}

/**
 * "Descargar" como acción explícita del usuario.
 *
 * BUG REAL (iPhone, 2026-09-09): esto hacía SIEMPRE la descarga del navegador, incluso en
 * la app nativa. WKWebView ignora el atributo `download` de un enlace por completo — no
 * lanza ningún error, simplemente no ocurre nada. Y como el toast de "factura descargada"
 * se mostraba igual, la pantalla afirmaba que había funcionado mientras el usuario no veía
 * absolutamente nada.
 *
 * En nativo va por el mismo camino que compartir, que es el único que existe.
 */
export async function descargarBlob(blob: Blob, nombreArchivoSolicitado: string): Promise<ResultadoDeEntrega> {
  const nombreArchivo = conExtension(nombreArchivoSolicitado, blob);
  if (Capacitor.isNativePlatform()) return entregarEnNativo(blob, nombreArchivo);
  return descargarEnNavegador(blob, nombreArchivo);
}
