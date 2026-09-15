import { TestBed } from '@angular/core/testing';
import { LimpiezaDeSesionService } from './limpieza-de-sesion.service';

describe('LimpiezaDeSesionService', () => {
  let limpieza: LimpiezaDeSesionService;

  beforeEach(() => {
    limpieza = TestBed.inject(LimpiezaDeSesionService);
  });

  it('ejecuta todas las limpiezas registradas', () => {
    const catalogos = jasmine.createSpy('catalogos');
    const borradores = jasmine.createSpy('borradores');
    limpieza.registrar(catalogos);
    limpieza.registrar(borradores);

    limpieza.limpiar();

    expect(catalogos).toHaveBeenCalledTimes(1);
    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('una limpieza que falla no deja sin hacer las demás', () => {
    const despues = jasmine.createSpy('despues');
    limpieza.registrar(() => { throw new Error('rota'); });
    limpieza.registrar(despues);

    expect(() => limpieza.limpiar()).not.toThrow();
    expect(despues).toHaveBeenCalled();
  });
});
