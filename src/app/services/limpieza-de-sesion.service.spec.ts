import { TestBed } from '@angular/core/testing';
import { LimpiezaDeSesionService } from './limpieza-de-sesion.service';

describe('LimpiezaDeSesionService', () => {
  let limpieza: LimpiezaDeSesionService;
  let catalogos: jasmine.Spy;
  let borradores: jasmine.Spy;

  const EMPRESA_9 = 'arti|9|abraham@artisoftware.com';
  const EMPRESA_4 = 'arti|4|abraham@artisoftware.com';

  beforeEach(() => {
    limpieza = TestBed.inject(LimpiezaDeSesionService);
    catalogos = jasmine.createSpy('catalogos');
    borradores = jasmine.createSpy('borradores');
    limpieza.registrar(catalogos);
    limpieza.registrarSoloAlCambiarDeEmpresa(borradores);
  });

  it('al cerrar sesión tira los catálogos, pero no los borradores sin guardar', () => {
    limpieza.cerrarSesion(EMPRESA_9);

    expect(catalogos).toHaveBeenCalledTimes(1);
    expect(borradores).not.toHaveBeenCalled();
  });

  // Lo que pidió Abraham (2026-09-15): cerrar sesión y volver a la misma empresa no puede
  // costarle una factura a medias.
  it('salir y volver a entrar en la MISMA empresa conserva los borradores', () => {
    limpieza.iniciarSesion(null, EMPRESA_9);
    limpieza.cerrarSesion(EMPRESA_9);

    limpieza.iniciarSesion(null, EMPRESA_9);

    expect(borradores).not.toHaveBeenCalled();
    expect(catalogos).toHaveBeenCalledTimes(3);
  });

  it('entrar en OTRA empresa tira los borradores de la anterior', () => {
    limpieza.cerrarSesion(EMPRESA_9);

    limpieza.iniciarSesion(null, EMPRESA_4);

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('otro usuario de la misma empresa tampoco hereda los borradores', () => {
    limpieza.cerrarSesion(EMPRESA_9);

    limpieza.iniciarSesion(null, 'arti|9|otra.persona@artisoftware.com');

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('entrar en otra empresa encima de una sesión abierta, sin cerrarla, también los tira', () => {
    limpieza.iniciarSesion(EMPRESA_9, EMPRESA_4);

    expect(borradores).toHaveBeenCalledTimes(1);
  });

  it('una limpieza que falla no deja sin hacer las demás', () => {
    const despues = jasmine.createSpy('despues');
    limpieza.registrar(() => { throw new Error('rota'); });
    limpieza.registrar(despues);

    expect(() => limpieza.cerrarSesion(EMPRESA_9)).not.toThrow();
    expect(despues).toHaveBeenCalled();
  });
});
