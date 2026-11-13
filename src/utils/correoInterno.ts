/**
 * Supabase Auth requiere un correo por cuenta. Para usuarios sin correo institucional
 * se genera uno interno (no recibe mensajes; el usuario entra con su nombre de usuario).
 */
export const DOMINIO_INTERNO = 'usuarios.cultura-cca.local';

export const correoInterno = (username: string): string =>
  `${username.trim().toLowerCase()}@${DOMINIO_INTERNO}`;

export const esCorreoInterno = (email?: string | null): boolean =>
  !!email && email.toLowerCase().endsWith(`@${DOMINIO_INTERNO}`);

/** Usuario válido: minúsculas, números, punto, guion o guion bajo; 3 a 30 caracteres */
export const USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;

export const MENSAJE_USERNAME_INVALIDO =
  'El usuario solo puede tener letras, números, punto, guion o guion bajo (mín. 3, sin espacios ni "@").';
