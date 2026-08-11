import { EmisorFiscal } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para los datos fiscales del emisor (nuestra empresa/tenant).
 * Implementado hoy por MockEmisorRepository. El futuro HttpEmisorRepository debe
 * cumplir exactamente este mismo contrato — ver docs/SERVICE_CONTRACT_GAPS.md #6.
 */
export abstract class EmisorRepository {
  abstract getEmisor(): EmisorFiscal;
  abstract actualizarEmisor(data: EmisorFiscal): void;
}
