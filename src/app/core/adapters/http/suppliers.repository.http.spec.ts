import { TestBed } from '@angular/core/testing';

import { HttpSuppliersRepository } from './suppliers.repository.http';
import { MockSuppliersRepository } from '../mock/suppliers.repository.mock';
import { MockFacturasService } from '../../../services/mock-facturas.service';
import { ApiService } from '../../../services/api.service';

describe('HttpSuppliersRepository', () => {
  let repo: HttpSuppliersRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post', 'getEmpresaId']);
    apiSpy.getEmpresaId.and.returnValue(9);
    apiSpy.post.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        HttpSuppliersRepository,
        MockSuppliersRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpSuppliersRepository);
  });

  it('con menos de 2 caracteres, no llama al backend y devuelve página vacía', async () => {
    const resultado = await repo.buscar('a');
    expect(apiSpy.post).not.toHaveBeenCalled();
    expect(resultado).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('sin idEmpresa resoluble (token ausente/roto), lanza un error claro en vez de fingir "sin resultados"', async () => {
    apiSpy.getEmpresaId.and.returnValue(null);
    await expectAsync(repo.buscar('iberdrola')).toBeRejectedWithError(/sesión/);
    expect(apiSpy.post).not.toHaveBeenCalled();
  });

  it('manda idEmpresa (leído del JWT), nombre y top a Proveedores/Enumerar', async () => {
    await repo.buscar('iberdrola', 1, 15);

    expect(apiSpy.post).toHaveBeenCalledWith(
      '/api/Proveedores/Enumerar',
      { idEmpresa: 9, nombre: 'iberdrola', top: 15 },
    );
  });

  // BUG real corregido en auditoría 2026-08-14: el placeholder del selector prometía
  // "nombre o NIF", pero siempre se mandaba como 'nombre' — teclear un NIF real no
  // encontraba nunca nada porque Enumerar filtra por dni con un campo aparte.
  it('si el texto parece un NIF/CIF, busca por dni en vez de por nombre', async () => {
    await repo.buscar('B12345678');
    expect(apiSpy.post).toHaveBeenCalledWith('/api/Proveedores/Enumerar', { idEmpresa: 9, dni: 'B12345678', top: 20 });
  });

  it('un texto que no tiene pinta de NIF sigue buscando por nombre', async () => {
    await repo.buscar('Iberdrola');
    expect(apiSpy.post).toHaveBeenCalledWith('/api/Proveedores/Enumerar', { idEmpresa: 9, nombre: 'Iberdrola', top: 20 });
  });

  it('mapea la respuesta del backend a ProveedorMock, prefiriendo nombreCompleto e incluyendo la dirección de facturación', async () => {
    apiSpy.post.and.resolveTo([
      {
        idProveedor: 42, idEmpresa: 9, idSujeto: 100,
        nombre: 'Iberdrola', apellido1: 'Clientes', apellido2: 'SAU',
        nombreCompleto: 'Iberdrola Clientes SAU', dni: 'A95758389',
        direccionFacturacion: {
          idDireccion: 7, direccion: 'Calle Mayor 1', codigoPostal: '28001',
          poblacion: 'Madrid', idProvincia: 28, provincia: 'Madrid',
        },
      },
    ]);

    const resultado = await repo.buscar('iberdrola');

    expect(resultado.items).toEqual([{
      id: 42, nif: 'A95758389', nombre: 'Iberdrola Clientes SAU',
      direccion: 'Calle Mayor 1', poblacion: 'Madrid', cp: '28001', provincia: 'Madrid',
    }]);
    expect(resultado.total).toBe(1);
  });

  it('limpia el punto de relleno del apellido1 al final de nombreCompleto (proveedor tipo empresa)', async () => {
    apiSpy.post.and.resolveTo([
      {
        idProveedor: 43, idEmpresa: 9, idSujeto: 101,
        nombre: 'Iberdrola Clientes, S.A.U.', apellido1: '.', apellido2: null,
        nombreCompleto: 'Iberdrola Clientes, S.A.U. .', dni: 'A95758389',
        direccionFacturacion: null,
      },
    ]);

    const resultado = await repo.buscar('iberdrola');

    expect(resultado.items[0].nombre).toBe('Iberdrola Clientes, S.A.U.');
  });

  it('si falta nombreCompleto, cae a nombre; si falta dni, deja el nif vacío; sin dirección, deja los campos de dirección sin definir', async () => {
    apiSpy.post.and.resolveTo([
      {
        idProveedor: 1, idEmpresa: 9, idSujeto: 1, nombre: 'Solo Nombre',
        apellido1: null, apellido2: null, nombreCompleto: null, dni: null,
        direccionFacturacion: null,
      },
    ]);

    const resultado = await repo.buscar('solo');

    expect(resultado.items[0].nombre).toBe('Solo Nombre');
    expect(resultado.items[0].nif).toBe('');
    expect(resultado.items[0].direccion).toBeUndefined();
  });

  describe('crearAdHoc', () => {
    const datosCompletos = {
      nombre: 'Nuevo Proveedor', nif: 'B00000000',
      direccion: 'Calle Falsa 123', cp: '28002', poblacion: 'Madrid', provincia: 'Madrid',
    };

    it('valida nombre y nif antes de llamar al backend', async () => {
      await expectAsync(repo.crearAdHoc({ ...datosCompletos, nombre: '' }))
        .toBeRejectedWithError('Nombre y NIF son obligatorios.');
      expect(apiSpy.post).not.toHaveBeenCalled();
    });

    it('valida dirección, cp, población y provincia antes de llamar al backend', async () => {
      await expectAsync(repo.crearAdHoc({ ...datosCompletos, direccion: '' }))
        .toBeRejectedWithError('Dirección, código postal, población y provincia son obligatorios.');
      expect(apiSpy.post).not.toHaveBeenCalled();
    });

    it('manda la razón social completa en nombre y un punto fijo "." como apellido1 (decisión del jefe)', async () => {
      apiSpy.post.and.resolveTo({
        idProveedor: 55, idEmpresa: 9, idSujeto: 200,
        nombre: 'Nuevo Proveedor', apellido1: '.', apellido2: null,
        nombreCompleto: 'Nuevo Proveedor .', dni: 'B00000000',
        direccionFacturacion: {
          idDireccion: 9, direccion: 'Calle Falsa 123', codigoPostal: '28002',
          poblacion: 'Madrid', idProvincia: 28, provincia: 'Madrid',
        },
      });

      const creado = await repo.crearAdHoc(datosCompletos);

      // apellido1 NO puede ser un espacio en blanco: el backend usa IsNullOrWhiteSpace, lo
      // rechaza con 400 "apellido1 es obligatorio" (probado en real 2026-08-14). El jefe
      // confirmó que no se hace opcional en el backend, y prefiere un placeholder fijo y
      // reconocible ('.') antes que partir el texto para disimularlo.
      expect(apiSpy.post).toHaveBeenCalledWith('/api/Proveedores/Crear', {
        idEmpresa: 9,
        nombre: 'Nuevo Proveedor',
        apellido1: '.',
        nif: 'B00000000',
        direccion: 'Calle Falsa 123',
        codigoPostal: '28002',
        poblacion: 'Madrid',
        provincia: 'Madrid',
      });
      // '.' no es whitespace para el backend (Where(!IsNullOrWhiteSpace) no lo filtra), así
      // que el propio backend lo deja pegado en nombreCompleto — pero mapearProveedor lo
      // limpia antes de mostrarlo (petición del jefe en la reunión 2026-08-14: un proveedor
      // tipo empresa se ve solo con su razón social, sin el punto de relleno).
      expect(creado).toEqual({
        id: 55, nif: 'B00000000', nombre: 'Nuevo Proveedor',
        direccion: 'Calle Falsa 123', poblacion: 'Madrid', cp: '28002', provincia: 'Madrid',
      });
    });

    it('propaga el error del backend (ej. NIF duplicado, 409) sin envolverlo', async () => {
      apiSpy.post.and.rejectWith(new Error("HTTP 409 - Ya existe un proveedor con NIF 'B00000000' para esta empresa."));

      await expectAsync(repo.crearAdHoc(datosCompletos)).toBeRejectedWithError(/409/);
    });
  });
});
