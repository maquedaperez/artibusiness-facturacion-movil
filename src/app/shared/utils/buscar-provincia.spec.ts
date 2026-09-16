import { buscarProvincias, canonizarProvincia, esLaMismaProvincia, normalizarProvincia } from './buscar-provincia';
import { Provincia } from '../../core/ports/provinces.repository';

// Mismos casos que WebAPIARTIBusiness.Tests/ProvinciaEspanolaTests.cs: si aquí se encontrara una
// provincia que el backend no empareja, el alta fallaría DESPUÉS de elegirla de la lista.
describe('buscar-provincia', () => {
  const catalogo: Provincia[] = [
    { id: 15, nombre: 'A Coruña' },
    { id: 28, nombre: 'Madrid' },
    { id: 17, nombre: 'Girona' },
    { id: 48, nombre: 'Bizkaia' },
    { id: 7, nombre: 'Illes Balears' },
    { id: 46, nombre: 'València' },
    { id: 24, nombre: 'León' },
    { id: 12, nombre: 'Castellón' },
  ];

  describe('normalizar y canonizar', () => {
    it('quita acentos, puntuación y espacios de más', () => {
      expect(normalizarProvincia(' a  coruña ')).toBe('A CORUNA');
      expect(normalizarProvincia('Coruña, A')).toBe('CORUNA A');
      expect(normalizarProvincia(null)).toBe('');
    });

    it('el artículo da igual, vaya delante o detrás', () => {
      const esperado = canonizarProvincia('A Coruña');
      expect(canonizarProvincia('La Coruña')).toBe(esperado);
      expect(canonizarProvincia('Coruña, A')).toBe(esperado);
      expect(canonizarProvincia('Coruña')).toBe(esperado);
      expect(canonizarProvincia('a coruna')).toBe(esperado);
    });

    it('los nombres en las dos lenguas son la misma provincia', () => {
      expect(canonizarProvincia('Gerona')).toBe(canonizarProvincia('Girona'));
      expect(canonizarProvincia('Vizcaya')).toBe(canonizarProvincia('Bizkaia'));
      expect(canonizarProvincia('Islas Baleares')).toBe(canonizarProvincia('Illes Balears'));
      expect(canonizarProvincia('Orense')).toBe(canonizarProvincia('Ourense'));
      expect(canonizarProvincia('Madrid')).not.toBe(canonizarProvincia('Barcelona'));
    });

    it('esLaMismaProvincia no da por buena una cadena vacía', () => {
      expect(esLaMismaProvincia('Madrid', '')).toBeFalse();
      expect(esLaMismaProvincia('Madrid', '  ')).toBeFalse();
      expect(esLaMismaProvincia('Madrid', 'madrid')).toBeTrue();
    });
  });

  describe('sugerencias mientras se teclea', () => {
    it('encuentra A Coruña escribiendo "la coruña"', () => {
      expect(buscarProvincias(catalogo, 'la coruña').map(p => p.nombre)).toEqual(['A Coruña']);
    });

    it('encuentra Girona escribiendo "gerona"', () => {
      expect(buscarProvincias(catalogo, 'gerona').map(p => p.nombre)).toEqual(['Girona']);
    });

    it('encuentra Bizkaia escribiendo "vizcaya"', () => {
      expect(buscarProvincias(catalogo, 'vizcaya').map(p => p.nombre)).toEqual(['Bizkaia']);
    });

    it('con el campo vacío ofrece las primeras, para poder elegir sin escribir', () => {
      expect(buscarProvincias(catalogo, '').length).toBe(6);
    });

    // Teclear "leon" tiene que ofrecer León ANTES que Castilla y León: si no, la que se busca
    // queda enterrada bajo las que solo la contienen por dentro.
    it('primero las que empiezan por lo escrito', () => {
      const conDosLeones = [...catalogo, { id: 99, nombre: 'Castilla y León' }];
      expect(buscarProvincias(conDosLeones, 'leon').map(p => p.nombre)).toEqual(['León', 'Castilla y León']);
    });

    it('lo que no está en el catálogo no devuelve nada', () => {
      expect(buscarProvincias(catalogo, 'Oporto')).toEqual([]);
    });

    it('nunca devuelve más del máximo pedido', () => {
      expect(buscarProvincias(catalogo, '', 3).length).toBe(3);
    });
  });
});
