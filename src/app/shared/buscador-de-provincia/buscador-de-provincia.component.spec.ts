import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BuscadorDeProvinciaComponent } from './buscador-de-provincia.component';
import { Provincia, ProvincesRepository } from '../../core/ports/provinces.repository';

describe('BuscadorDeProvinciaComponent', () => {
  let component: BuscadorDeProvinciaComponent;
  let fixture: ComponentFixture<BuscadorDeProvinciaComponent>;

  const CATALOGO: Provincia[] = [
    { id: 15, nombre: 'A Coruña' },
    { id: 28, nombre: 'Madrid' },
    { id: 17, nombre: 'Girona' },
  ];

  function crear(enumerar: () => Promise<Provincia[]>) {
    TestBed.configureTestingModule({
      imports: [BuscadorDeProvinciaComponent],
      providers: [
        provideIonicAngular(),
        { provide: ProvincesRepository, useValue: { enumerar } },
      ],
    });
    fixture = TestBed.createComponent(BuscadorDeProvinciaComponent);
    component = fixture.componentInstance;
  }

  describe('con el catálogo de la empresa cargado', () => {
    beforeEach(async () => {
      crear(() => Promise.resolve(CATALOGO));
      component.textoNoEstaEnElCatalogo = 'No está en el catálogo';
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('escribir "la coruña" ofrece A Coruña', () => {
      component.alEscribir('la coruña');
      expect(component.sugerencias.map(p => p.nombre)).toEqual(['A Coruña']);
    });

    it('elegir una de la lista deja el nombre oficial y avisa al formulario', () => {
      const emitido: string[] = [];
      component.valorChange.subscribe(v => emitido.push(v));
      component.alEscribir('coru');

      component.elegir(component.sugerencias[0]);

      expect(component.valor).toBe('A Coruña');
      expect(emitido[emitido.length - 1]).toBe('A Coruña');
      expect(component.sugerencias).toEqual([]);
    });

    it('cuando ya está escrita tal cual, no insiste con la lista', () => {
      component.alEscribir('A Coruña');
      expect(component.sugerencias).toEqual([]);
    });

    // El aviso es informativo: nunca impide guardar (el backend empareja con tolerancia, y un
    // proveedor extranjero puede no tener provincia española).
    it('avisa si lo escrito no está en el catálogo, pero solo al salir del campo', () => {
      component.alEscribir('Oporto');
      expect(component.avisoNoEstaEnElCatalogo).toBeFalse(); // mientras escribe, no

      component.escribiendo = false;
      expect(component.avisoNoEstaEnElCatalogo).toBeTrue();
    });

    it('no avisa de una escrita de otra forma: "La Coruña" es la del catálogo', () => {
      component.alEscribir('La Coruña');
      component.escribiendo = false;
      expect(component.avisoNoEstaEnElCatalogo).toBeFalse();
    });
  });

  // ESTO ES LO QUE PERMITE QUE ESTÉ EN LA APP ANTES QUE EL BACKEND: mientras el endpoint
  // responda 404, el adaptador devuelve [] y el campo tiene que comportarse como el texto libre
  // de siempre — sin lista, sin avisos y sin estorbar.
  describe('sin catálogo (endpoint todavía sin publicar)', () => {
    beforeEach(async () => {
      crear(() => Promise.resolve([]));
      component.textoNoEstaEnElCatalogo = 'No está en el catálogo';
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('no ofrece nada y deja escribir cualquier cosa', () => {
      component.alEscribir('La Coruña');

      expect(component.sugerencias).toEqual([]);
      expect(component.valor).toBe('La Coruña');
    });

    it('no avisa de nada: sin catálogo no se sabe si es correcta', () => {
      component.alEscribir('Oporto');
      component.escribiendo = false;
      expect(component.avisoNoEstaEnElCatalogo).toBeFalse();
    });
  });
});
