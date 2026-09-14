// Validación del NIF/CIF de un cliente español antes de darlo de alta (2026-09-14).
//
// EL PROBLEMA QUE RESUELVE, visto en la demo: se dio de alta a Iberdrola con "A-95758389" y la
// factura se contabilizó, pero la AEAT la devolvió con "[1100] Valor o tipo incorrecto del
// campo: NIF". El NIF se guardaba tal cual se escribía —con el guion— y así se mandaba. Ni la
// app ni el backend lo limpiaban, y el usuario no se enteraba hasta tener ya la factura
// rechazada, que solo se arregla subsanándola.
//
// Aquí se comprueba lo mismo que la AEAT mira primero: el FORMATO y la LETRA O DÍGITO DE
// CONTROL. Que el NIF exista de verdad en el censo solo lo sabe la AEAT.

export type TipoNif = 'DNI' | 'NIE' | 'CIF';

export type ResultadoNif =
  | { valido: true; normalizado: string; tipo: TipoNif }
  | { valido: false; normalizado: string; motivo: 'vacio' | 'formato' | 'control' };

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const LETRAS_CONTROL_CIF = 'JABCDEFGHI';

// Lo que la gente escribe de más al copiar un NIF: guiones, espacios y puntos.
const SEPARADORES = /[\s.\-]/g;

const FORMATO_DNI = /^(\d{8})([A-Z])$/;
// K, L y M son NIF de personas físicas sin DNI (menores, extranjeros sin NIE...). Su letra se
// calcula igual que la del DNI, sobre los siete números.
const FORMATO_NIF_ESPECIAL = /^[KLM](\d{7})([A-Z])$/;
const FORMATO_NIE = /^([XYZ])(\d{7})([A-Z])$/;
const FORMATO_CIF = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/;

// Según la letra inicial, el control de un CIF es obligatoriamente un número (sociedades
// anónimas, limitadas, comunidades de bienes...) o una letra (entidades públicas, extranjeras,
// religiosas...). El resto admite las dos formas.
const CIF_CONTROL_NUMERO = 'ABEH';
const CIF_CONTROL_LETRA = 'KPQSNW';

export function normalizarNif(valor: string | null | undefined): string {
  return (valor ?? '').replace(SEPARADORES, '').toUpperCase();
}

export function validarNif(valor: string | null | undefined): ResultadoNif {
  const nif = normalizarNif(valor);
  if (!nif) return { valido: false, normalizado: nif, motivo: 'vacio' };

  const dni = FORMATO_DNI.exec(nif) ?? FORMATO_NIF_ESPECIAL.exec(nif);
  if (dni) return resultado(nif, 'DNI', letraDni(Number(dni[1])) === dni[2]);

  const nie = FORMATO_NIE.exec(nif);
  if (nie) {
    // X, Y y Z valen 0, 1 y 2 delante de los siete números.
    const numero = Number('XYZ'.indexOf(nie[1]) + nie[2]);
    return resultado(nif, 'NIE', letraDni(numero) === nie[3]);
  }

  const cif = FORMATO_CIF.exec(nif);
  if (cif) return resultado(nif, 'CIF', controlDeCifCorrecto(cif[1], cif[2], cif[3]));

  return { valido: false, normalizado: nif, motivo: 'formato' };
}

function resultado(nif: string, tipo: TipoNif, controlCorrecto: boolean): ResultadoNif {
  return controlCorrecto
    ? { valido: true, normalizado: nif, tipo }
    : { valido: false, normalizado: nif, motivo: 'control' };
}

function letraDni(numero: number): string {
  return LETRAS_DNI[numero % 23];
}

function controlDeCifCorrecto(letraInicial: string, digitos: string, control: string): boolean {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const cifra = Number(digitos[i]);
    if (i % 2 === 0) {
      // Posiciones 1ª, 3ª, 5ª y 7ª: se dobla y se suman las cifras del resultado.
      const doble = cifra * 2;
      suma += Math.floor(doble / 10) + (doble % 10);
    } else {
      suma += cifra;
    }
  }
  const digitoControl = (10 - (suma % 10)) % 10;
  const comoNumero = control === String(digitoControl);
  const comoLetra = control === LETRAS_CONTROL_CIF[digitoControl];

  if (CIF_CONTROL_NUMERO.includes(letraInicial)) return comoNumero;
  if (CIF_CONTROL_LETRA.includes(letraInicial)) return comoLetra;
  return comoNumero || comoLetra;
}
