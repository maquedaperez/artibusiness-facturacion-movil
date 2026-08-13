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

  it('sin idEmpresa resoluble (token ausente/roto), no llama al backend y devuelve página vacía', async () => {
    apiSpy.getEmpresaId.and.returnValue(null);
    const resultado = await repo.buscar('iberdrola');
    expect(apiSpy.post).not.toHaveBeenCalled();
    expect(resultado.items).toEqual([]);
  });

  it('manda idEmpresa (leído del JWT), nombre y top a Proveedores/Enumerar', async () => {
    await repo.buscar('iberdrola', 1, 15);

    expect(apiSpy.post).toHaveBeenCalledWith(
      '/api/Proveedores/Enumerar',
      { idEmpresa: 9, nombre: 'iberdrola', top: 15 },
    );
  });

  it('mapea la respuesta del backend a ProveedorMock, prefiriendo nombreCompleto', async () => {
    apiSpy.post.and.resolveTo([
      {
        idProveedor: 42, idEmpresa: 9, idSujeto: 100,
        nombre: 'Iberdrola', apellido1: 'Clientes', apellido2: 'SAU',
        nombreCompleto: 'Iberdrola Clientes SAU', dni: 'A95758389',
      },
    ]);

    const resultado = await repo.buscar('iberdrola');

    expect(resultado.items).toEqual([{ id: 42, nif: 'A95758389', nombre: 'Iberdrola Clientes SAU' }]);
    expect(resultado.total).toBe(1);
  });

  it('si falta nombreCompleto, cae a nombre; si falta dni, deja el nif vacío', async () => {
    apiSpy.post.and.resolveTo([
      { idProveedor: 1, idEmpresa: 9, idSujeto: 1, nombre: 'Solo Nombre', apellido1: null, apellido2: null, nombreCompleto: null, dni: null },
    ]);

    const resultado = await repo.buscar('solo');

    expect(resultado.items[0].nombre).toBe('Solo Nombre');
    expect(resultado.items[0].nif).toBe('');
  });

  it('crearAdHoc sigue delegando en el mock (el backend no tiene endpoint de alta todavía)', () => {
    const creado = repo.crearAdHoc({ nombre: 'Nuevo Proveedor', nif: 'B00000000' });
    expect(creado.id).toBeGreaterThan(0);
    expect(creado.nombre).toBe('Nuevo Proveedor');
  });
});
