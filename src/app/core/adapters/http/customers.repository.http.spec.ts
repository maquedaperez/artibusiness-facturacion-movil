import { TestBed } from '@angular/core/testing';

import { HttpCustomersRepository } from './customers.repository.http';
import { MockCustomersRepository } from '../mock/customers.repository.mock';
import { MockFacturasService } from '../../../services/mock-facturas.service';
import { ApiService } from '../../../services/api.service';
import { provideTranslocoTesting } from '../../i18n/testing/transloco-testing.providers';

describe('HttpCustomersRepository', () => {
  let repo: HttpCustomersRepository;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['post']);
    apiSpy.post.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        ...provideTranslocoTesting(),
        HttpCustomersRepository,
        MockCustomersRepository,
        MockFacturasService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    repo = TestBed.inject(HttpCustomersRepository);
  });

  it('con menos de 2 caracteres, no llama al backend y devuelve página vacía', async () => {
    const resultado = await repo.buscar('a');
    expect(apiSpy.post).not.toHaveBeenCalled();
    expect(resultado).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('si el texto parece un NIF/CIF, busca por dni en vez de por nombre', async () => {
    await repo.buscar('B12345678');
    expect(apiSpy.post).toHaveBeenCalledWith('/api/Clientes/Enumerar', { dni: 'B12345678', top: 20 });
  });

  it('un texto que no tiene pinta de NIF busca por nombre', async () => {
    await repo.buscar('Clínica Dental');
    expect(apiSpy.post).toHaveBeenCalledWith('/api/Clientes/Enumerar', { nombre: 'Clínica Dental', top: 20 });
  });

  it('mapea la respuesta del backend a ClienteMock, prefiriendo nombreCompleto e infiriendo esEmpresa del NIF', async () => {
    apiSpy.post.and.resolveTo([
      {
        idCliente: 42, idEmpresa: 9, idSujeto: 100,
        nombre: 'Clínica Dental', apellido1: 'Sonrisas', apellido2: 'SL',
        nombreCompleto: 'Clínica Dental Sonrisas SL', dni: 'B12345678',
        direccionFacturacion: {
          idDireccion: 7, direccion: 'Calle Mayor 1', codigoPostal: '28001',
          poblacion: 'Madrid', idProvincia: 28, provincia: 'Madrid',
        },
      },
    ]);

    const resultado = await repo.buscar('clínica');

    expect(resultado.items).toEqual([{
      id: 42, nif: 'B12345678', nombre: 'Clínica Dental Sonrisas SL', esEmpresa: true,
      direccion: 'Calle Mayor 1', poblacion: 'Madrid', cp: '28001', provincia: 'Madrid',
    }]);
  });

  it('un NIF que empieza por dígito se marca como particular (esEmpresa: false)', async () => {
    apiSpy.post.and.resolveTo([
      {
        idCliente: 43, idEmpresa: 9, idSujeto: 101,
        nombre: 'María', apellido1: 'Fernández', apellido2: 'López',
        nombreCompleto: 'María Fernández López', dni: '12345678Z',
        direccionFacturacion: null,
      },
    ]);

    const resultado = await repo.buscar('maría');
    expect(resultado.items[0].esEmpresa).toBeFalse();
  });

  it('crearAdHoc llama de verdad a POST /api/Clientes/Crear con idMedioPago', async () => {
    apiSpy.post.and.resolveTo({
      idCliente: 55, idEmpresa: 9, idSujeto: 200,
      nombre: 'Cliente Nuevo', apellido1: null, apellido2: null,
      nombreCompleto: 'Cliente Nuevo', dni: 'B00000000',
      direccionFacturacion: null,
    });

    const creado = await repo.crearAdHoc(
      { nombre: 'Cliente Nuevo', nif: 'B00000000', esEmpresa: true, direccion: 'Calle 1', poblacion: 'Madrid', cp: '28001', provincia: 'Madrid' },
      3
    );

    expect(apiSpy.post).toHaveBeenCalledWith('/api/Clientes/Crear', {
      nombre: 'Cliente Nuevo', nif: 'B00000000',
      direccion: 'Calle 1', codigoPostal: '28001', poblacion: 'Madrid', provincia: 'Madrid',
      idMedioPago: 3,
    });
    expect(creado.id).toBe(55);
    expect(creado.nombre).toBe('Cliente Nuevo');
  });
});
