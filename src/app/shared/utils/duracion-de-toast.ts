/**
 * Cuánto tiempo se queda un toast en pantalla (2026-09-14).
 *
 * EL PROBLEMA. Tres pantallas lo tenían fijo en 2,5 segundos. Servía cuando los avisos eran
 * cortos ("Factura guardada"), pero los mensajes de error ya no lo son: desde que explican QUÉ
 * ha pasado y dónde mirar, van de 80 a 110 caracteres.
 *
 *     "No se ha podido firmar la factura. Comprueba que la empresa tenga
 *      configurado un certificado de firma válido."                        → 109 caracteres
 *
 * A ritmo de lectura atenta —unos 17 caracteres por segundo— eso son más de 6 segundos. Con
 * 2,5 el aviso se iba antes de poder leerlo, que es tanto como no darlo: el usuario ve un
 * destello rojo y se queda igual.
 *
 * La fórmula no es nueva: ya estaba en Facturas Recibidas. Esto solo la saca a un sitio para
 * que las cinco pantallas usen la misma y no se vuelvan a separar.
 */

// Por corto que sea el mensaje, da tiempo a verlo aparecer.
const MINIMO_MS = 3000;

// Por largo que sea, no se queda ahí tapando la pantalla. Si un mensaje necesita más de esto,
// el sitio correcto es un diálogo, no un toast.
const MAXIMO_MS = 8000;

// 60 ms por carácter ≈ 17 caracteres por segundo, que es lectura atenta de algo inesperado
// (no lectura corrida de un texto que ya sabes de qué va).
const MS_POR_CARACTER = 60;

export function duracionDeToast(mensaje: string): number {
  const largo = mensaje?.length ?? 0;
  return Math.max(MINIMO_MS, Math.min(MAXIMO_MS, largo * MS_POR_CARACTER));
}
