// Decodifica el payload de un JWT en el propio cliente — sin validar la firma (para eso
// no hace falta: el token ya vino firmado y aceptado por el backend en el login, aquí solo
// leemos un claim no sensible, EmpresaId, que el backend no nos devuelve por otro sitio en
// el JSON de login). Nunca usar esto para decidir permisos ni para nada de seguridad real:
// el backend es quien de verdad valida el token en cada petición.
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
