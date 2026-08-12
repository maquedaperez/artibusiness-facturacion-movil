import { EmisorFiscal } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para los datos fiscales del emisor (nuestra empresa/tenant).
 * Implementado hoy por MockEmisorRepository. El futuro HttpEmisorRepository debe
 * cumplir exactamente este mismo contrato — ver docs/SERVICE_CONTRACT_GAPS.md #6 y
 * docs/AUDITORIA_INTEGRACION_BACKEND.md sección E (mapping a Empresa/Direccion).
 *
 * SOLO LECTURA en su totalidad — no es una limitación temporal del MVP, es una
 * decisión explícita: el usuario no puede modificar datos fiscales, de empresa ni
 * identificativos principales desde la app móvil. Por eso este puerto no tiene
 * ningún método de escritura.
 */
export abstract class EmisorRepository {
  abstract getEmisor(): EmisorFiscal;
}
