import { Injectable } from '@angular/core';
import { Provincia, ProvincesRepository } from '../../ports/provinces.repository';

// Los nombres OFICIALES, que es lo que tienen los catálogos reales — incluidos los que la gente
// escribe de otra manera (A Coruña, Girona, Bizkaia...). Así el buscador del formulario se puede
// probar con los casos que dieron problemas de verdad sin depender del backend.
const PROVINCIAS_DEMO: Provincia[] = [
  { id: 1, nombre: 'Álava' },
  { id: 2, nombre: 'Albacete' },
  { id: 3, nombre: 'Alicante' },
  { id: 4, nombre: 'Almería' },
  { id: 5, nombre: 'Asturias' },
  { id: 6, nombre: 'Ávila' },
  { id: 7, nombre: 'Badajoz' },
  { id: 8, nombre: 'Illes Balears' },
  { id: 9, nombre: 'Barcelona' },
  { id: 10, nombre: 'Burgos' },
  { id: 11, nombre: 'Cáceres' },
  { id: 12, nombre: 'Cádiz' },
  { id: 13, nombre: 'Cantabria' },
  { id: 14, nombre: 'Castellón' },
  { id: 15, nombre: 'Ciudad Real' },
  { id: 16, nombre: 'Córdoba' },
  { id: 17, nombre: 'A Coruña' },
  { id: 18, nombre: 'Cuenca' },
  { id: 19, nombre: 'Girona' },
  { id: 20, nombre: 'Granada' },
  { id: 21, nombre: 'Guadalajara' },
  { id: 22, nombre: 'Gipuzkoa' },
  { id: 23, nombre: 'Huelva' },
  { id: 24, nombre: 'Huesca' },
  { id: 25, nombre: 'Jaén' },
  { id: 26, nombre: 'León' },
  { id: 27, nombre: 'Lleida' },
  { id: 28, nombre: 'Lugo' },
  { id: 29, nombre: 'Madrid' },
  { id: 30, nombre: 'Málaga' },
  { id: 31, nombre: 'Murcia' },
  { id: 32, nombre: 'Navarra' },
  { id: 33, nombre: 'Ourense' },
  { id: 34, nombre: 'Palencia' },
  { id: 35, nombre: 'Las Palmas' },
  { id: 36, nombre: 'Pontevedra' },
  { id: 37, nombre: 'La Rioja' },
  { id: 38, nombre: 'Salamanca' },
  { id: 39, nombre: 'Santa Cruz de Tenerife' },
  { id: 40, nombre: 'Segovia' },
  { id: 41, nombre: 'Sevilla' },
  { id: 42, nombre: 'Soria' },
  { id: 43, nombre: 'Tarragona' },
  { id: 44, nombre: 'Teruel' },
  { id: 45, nombre: 'Toledo' },
  { id: 46, nombre: 'Valencia' },
  { id: 47, nombre: 'Valladolid' },
  { id: 48, nombre: 'Bizkaia' },
  { id: 49, nombre: 'Zamora' },
  { id: 50, nombre: 'Zaragoza' },
  { id: 51, nombre: 'Ceuta' },
  { id: 52, nombre: 'Melilla' },
];

@Injectable({ providedIn: 'root' })
export class MockProvincesRepository extends ProvincesRepository {
  async enumerar(): Promise<Provincia[]> {
    return PROVINCIAS_DEMO;
  }
}
