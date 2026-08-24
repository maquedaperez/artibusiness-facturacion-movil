import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular, ModalController } from '@ionic/angular/standalone';
import { LineasEditorComponent } from './lineas-editor.component';
import { LineaFactura, ProductoCatalogo, Suscripcion } from '../../services/mock-facturas.service';
import { CatalogoSelectorComponent } from '../../modals/catalogo-selector/catalogo-selector.component';
import { SuscripcionSelectorComponent } from '../../modals/suscripcion-selector/suscripcion-selector.component';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

const TRADUCCIONES_TEST = {
  es: {
    common: {
      linesEditor: { originManual: 'Manual', originCatalog: 'Catálogo', originSubscription: 'Suscripción' },
    },
  },
};

describe('LineasEditorComponent', () => {
  let component: LineasEditorComponent;
  let fixture: ComponentFixture<LineasEditorComponent>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let idCounter: number;

  const producto: ProductoCatalogo = {
    id: 5, nombre: 'Consultoría de proceso (hora)', precioUnitario: 50, ivaPct: 21, referencia: 'SRV-004',
  };
  const suscripcion: Suscripcion = {
    id: 2, nombre: 'Soporte premium', periodicidad: 'Mensual', precio: 150, ivaPct: 21, estado: 'activa',
  };

  function crearModalSpy(dataDevuelta: any, role: string) {
    return {
      present: () => Promise.resolve(),
      onWillDismiss: () => Promise.resolve({ data: dataDevuelta, role }),
    };
  }

  beforeEach(() => {
    idCounter = 1000;
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);

    TestBed.configureTestingModule({
      imports: [LineasEditorComponent],
      providers: [
        provideIonicAngular(),
        ...provideTranslocoTesting(TRADUCCIONES_TEST),
        { provide: ModalController, useValue: modalCtrlSpy },
      ],
    });
    fixture = TestBed.createComponent(LineasEditorComponent);
    component = fixture.componentInstance;
    component.lineas = [];
    component.generarId = () => idCounter++;
    fixture.detectChanges();
  });

  it('añade una línea manual (fuera de catálogo) editable desde cero', () => {
    component.agregarManual();

    expect(component.lineas.length).toBe(1);
    const l = component.lineas[0];
    expect(l.origen).toBe('manual');
    expect(l.origenRef).toBeUndefined();
    expect(l.descripcion).toBe('');
    expect(l.cantidad).toBe(1);
    expect(l.precioUnitario).toBe(0);
  });

  it('añade una línea desde catálogo con un snapshot del producto, no una referencia viva', async () => {
    modalCtrlSpy.create.and.returnValue(Promise.resolve(crearModalSpy(producto, 'confirm')) as any);

    await component.agregarDesdeCatalogo();

    expect(modalCtrlSpy.create).toHaveBeenCalledWith({ component: CatalogoSelectorComponent });
    expect(component.lineas.length).toBe(1);
    const l: LineaFactura = component.lineas[0];
    expect(l.origen).toBe('catalogo');
    expect(l.origenRef).toEqual({ tipo: 'catalogo', id: 5 });
    expect(l.descripcion).toBe('Consultoría de proceso (hora)');
    expect(l.precioUnitario).toBe(50);
    expect(l.ivaPct).toBe(21);

    // Es una copia: mutar el producto original (o cambiar su precio en el catálogo más
    // tarde) no debe afectar a la línea ya añadida a la factura.
    producto.precioUnitario = 999;
    expect(l.precioUnitario).toBe(50);
  });

  it('añade una línea desde suscripción con un snapshot de la suscripción', async () => {
    modalCtrlSpy.create.and.returnValue(Promise.resolve(crearModalSpy(suscripcion, 'confirm')) as any);

    await component.agregarDesdeSuscripcion();

    expect(modalCtrlSpy.create).toHaveBeenCalledWith({ component: SuscripcionSelectorComponent });
    expect(component.lineas.length).toBe(1);
    const l: LineaFactura = component.lineas[0];
    expect(l.origen).toBe('suscripcion');
    expect(l.origenRef).toEqual({ tipo: 'suscripcion', id: 2 });
    expect(l.descripcion).toBe('Soporte premium');
    expect(l.precioUnitario).toBe(150);
  });

  it('cancelar el selector de catálogo no añade ninguna línea', async () => {
    modalCtrlSpy.create.and.returnValue(Promise.resolve(crearModalSpy(null, 'cancel')) as any);

    await component.agregarDesdeCatalogo();

    expect(component.lineas.length).toBe(0);
  });

  it('elimina una línea existente', () => {
    component.agregarManual();
    component.agregarManual();
    expect(component.lineas.length).toBe(2);

    component.eliminarLinea(component.lineas[0]);

    expect(component.lineas.length).toBe(1);
  });

  it('distingue visualmente el origen de cada línea (etiqueta)', () => {
    component.agregarManual();
    expect(component.origenLabel(component.lineas[0])).toBe('Manual');

    component.lineas.push({
      id: idCounter++, origen: 'catalogo', origenRef: { tipo: 'catalogo', id: 1 },
      descripcion: 'x', cantidad: 1, precioUnitario: 1, descuentoPct: 0, ivaPct: 21,
    });
    expect(component.origenLabel(component.lineas[1])).toBe('Catálogo');

    component.lineas.push({
      id: idCounter++, origen: 'suscripcion', origenRef: { tipo: 'suscripcion', id: 1 },
      descripcion: 'x', cantidad: 1, precioUnitario: 1, descuentoPct: 0, ivaPct: 21,
    });
    expect(component.origenLabel(component.lineas[2])).toBe('Suscripción');
  });

  it('cuando no se permite catálogo ni suscripción, "elegir origen" añade directamente una línea manual', async () => {
    component.permitirCatalogo = false;
    component.permitirSuscripcion = false;

    await component.elegirOrigen();

    expect(component.lineas.length).toBe(1);
    expect(component.lineas[0].origen).toBe('manual');
    expect(modalCtrlSpy.create).not.toHaveBeenCalled();
  });

  it('calcula el total de línea (cantidad × precio − descuento), sin IVA, igual que la Base imponible', () => {
    const l: LineaFactura = {
      id: 1, origen: 'manual', descripcion: 'x', cantidad: 3, precioUnitario: 20, descuentoPct: 10, ivaPct: 21,
    };
    // 3 * 20 = 60; menos 10% de descuento = 54.
    expect(component.lineaTotal(l)).toBe(54);
  });

  it('soporta múltiples líneas simultáneas de distinto origen (como exige Recibidas)', async () => {
    modalCtrlSpy.create.and.returnValue(Promise.resolve(crearModalSpy(producto, 'confirm')) as any);
    await component.agregarDesdeCatalogo();
    component.agregarManual();
    component.agregarManual();

    expect(component.lineas.length).toBe(3);
    expect(component.lineas.map(l => l.origen)).toEqual(['catalogo', 'manual', 'manual']);
  });
});
