import { HttpError } from '../../services/api.service';
import { avisoDeFirmaFallida } from './aviso-de-firma';

const TEXTOS: Record<string, string> = {
  'invoices.issued.sign.demoUnavailable': 'La firma electrónica no está disponible en la cuenta de demostración.',
  'invoices.issued.sign.error': 'No se ha podido firmar la factura.',
};
const traducir = (clave: string) => TEXTOS[clave] ?? clave;
const enPruebas = () => Promise.resolve(true);
const enProduccion = () => Promise.resolve(false);

// Lo que devolvió de verdad Firmar en la cuenta demo (2026-09-11).
const falloDeFirmaEnLaDemo = () => new HttpError(
  'HTTP 502 - FacturaE no pudo procesar la factura. El XML del lote (Id=229) no coincide con el registro fiscal de la factura ART60.',
  502,
  null,
);

describe('avisoDeFirmaFallida', () => {
  beforeEach(() => spyOn(console, 'warn'));

  it('en la demo, un fallo del servicio de firma sale como aviso informativo, no como error rojo', async () => {
    const aviso = await avisoDeFirmaFallida(falloDeFirmaEnLaDemo(), enPruebas, traducir);

    expect(aviso).toEqual({ mensaje: TEXTOS['invoices.issued.sign.demoUnavailable'], color: 'medium' });
  });

  it('en la demo, el motivo real queda en la consola para quien esté probando', async () => {
    const error = falloDeFirmaEnLaDemo();

    await avisoDeFirmaFallida(error, enPruebas, traducir);

    expect(console.warn).toHaveBeenCalledWith(jasmine.any(String), error);
  });

  it('fuera de la demo, un cliente real ve el motivo real y en rojo', async () => {
    const aviso = await avisoDeFirmaFallida(falloDeFirmaEnLaDemo(), enProduccion, traducir);

    expect(aviso.color).toBe('danger');
    expect(aviso.mensaje).toContain('no coincide con el registro fiscal');
  });

  it('una regla de negocio (4xx) se enseña tal cual también en la demo', async () => {
    const anulada = new HttpError('HTTP 400 - Esta factura está anulada; no se puede firmar.', 400, null);

    const aviso = await avisoDeFirmaFallida(anulada, enPruebas, traducir);

    expect(aviso).toEqual({ mensaje: 'Esta factura está anulada; no se puede firmar.', color: 'danger' });
  });

  it('sin conexión no se disfraza de "firma no disponible"', async () => {
    const aviso = await avisoDeFirmaFallida(new TypeError('Failed to fetch'), enPruebas, traducir);

    expect(aviso.color).toBe('danger');
  });

  it('si no se puede saber el entorno, se trata como real', async () => {
    const aviso = await avisoDeFirmaFallida(falloDeFirmaEnLaDemo(), () => Promise.reject(new Error('sin config')), traducir);

    expect(aviso.color).toBe('danger');
  });
});
