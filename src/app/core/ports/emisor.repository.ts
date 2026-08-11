import { EmisorContactoEditable, EmisorFiscal } from '../../services/mock-facturas.service';

/**
 * Puerto tipado para los datos fiscales del emisor (nuestra empresa/tenant).
 * Implementado hoy por MockEmisorRepository. El futuro HttpEmisorRepository debe
 * cumplir exactamente este mismo contrato — ver docs/SERVICE_CONTRACT_GAPS.md #6.
 *
 * Razón social, NIF/CIF y esEmpresa son identidad fiscal de solo lectura — llegan
 * de alta/backend, nunca se editan desde la app. actualizarEmisor solo admite el
 * subconjunto de contacto (EmisorContactoEditable): estructuralmente no se le puede
 * pasar nombre/nif, así que no hay forma de "colarlos" manipulando solo la UI.
 */
export abstract class EmisorRepository {
  abstract getEmisor(): EmisorFiscal;
  abstract actualizarEmisor(data: EmisorContactoEditable): void;
}
