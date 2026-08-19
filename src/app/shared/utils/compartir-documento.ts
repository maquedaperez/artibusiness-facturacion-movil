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

// Comparte un Blob usando el mecanismo estándar de cada plataforma: en nativo
// (Capacitor) escribe el archivo en caché y usa el diálogo de compartir del sistema;
// en web usa la Web Share API si el navegador la soporta con ficheros, o descarga
// directa como último recurso. Revoca el object URL creado para la descarga.
export async function compartirBlob(blob: Blob, nombreArchivoSolicitado: string): Promise<'compartido' | 'descargado'> {
  const nombreArchivo = conExtension(nombreArchivoSolicitado, blob);
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobABase64(blob);
    const resultado = await Filesystem.writeFile({
      path: nombreArchivo,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: nombreArchivo, url: resultado.uri });
    return 'compartido';
  }

  const archivo = new File([blob], nombreArchivo, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [archivo] }) && nav.share) {
    await nav.share({ files: [archivo], title: nombreArchivo });
    return 'compartido';
  }

  return descargarBlob(blob, nombreArchivo);
}

// Descarga directa (sin diálogo de compartir) — usada como fallback web y también
// disponible como acción explícita "Descargar".
export function descargarBlob(blob: Blob, nombreArchivoSolicitado: string): 'descargado' {
  const nombreArchivo = conExtension(nombreArchivoSolicitado, blob);
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
