import { CatalogoEnMemoria } from './catalogo-en-memoria';

describe('CatalogoEnMemoria', () => {
  it('pide el catálogo una sola vez aunque lo pidan dos pantallas a la vez', async () => {
    const catalogo = new CatalogoEnMemoria<string[]>();
    const cargar = jasmine.createSpy('cargar').and.resolveTo(['Contado']);

    const [a, b] = await Promise.all([catalogo.obtener(cargar), catalogo.obtener(cargar)]);

    expect(cargar).toHaveBeenCalledTimes(1);
    expect(a).toEqual(['Contado']);
    expect(b).toEqual(['Contado']);
  });

  // EL CASO DE LA DEMO (2026-09-14): al cambiar de empresa seguían las formas de pago de la otra.
  it('tras olvidar, vuelve a pedirlo en vez de dar el de la sesión anterior', async () => {
    const catalogo = new CatalogoEnMemoria<string[]>();
    await catalogo.obtener(() => Promise.resolve(['Openbank', 'Sabadell']));

    catalogo.olvidar();
    const nuevo = await catalogo.obtener(() => Promise.resolve(['Contado', 'Tarjeta']));

    expect(nuevo).toEqual(['Contado', 'Tarjeta']);
  });

  it('un fallo no se queda guardado: el siguiente intento vuelve a preguntar', async () => {
    const catalogo = new CatalogoEnMemoria<string[]>();

    await expectAsync(catalogo.obtener(() => Promise.reject(new Error('sin cobertura')))).toBeRejected();
    const reintento = await catalogo.obtener(() => Promise.resolve(['Contado']));

    expect(reintento).toEqual(['Contado']);
  });

  it('el fallo de una petición vieja no borra la que ya se pidió después', async () => {
    const catalogo = new CatalogoEnMemoria<string>();
    let fallarVieja!: (e: Error) => void;
    const vieja = catalogo.obtener(() => new Promise<string>((_, reject) => { fallarVieja = reject; }));

    catalogo.olvidar();
    const cargarNueva = jasmine.createSpy('cargarNueva').and.resolveTo('nueva');
    await catalogo.obtener(cargarNueva);

    fallarVieja(new Error('tarde'));
    await expectAsync(vieja).toBeRejected();
    await catalogo.obtener(cargarNueva);

    expect(cargarNueva).toHaveBeenCalledTimes(1);
  });
});
