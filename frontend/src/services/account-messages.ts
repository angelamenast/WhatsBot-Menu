// Mensajes de cuenta (correo y acceso) que dependen de lo que devuelve Supabase.

// Supabase no cambia el correo hasta que se confirma el enlace que envía: mientras tanto la cuenta
// sigue con el correo anterior y el cambio queda en user.new_email.
export function emailChangeNotice(current: string | undefined, pending: string | null | undefined) {
  if (!pending) return '';
  return `Cambio de correo pendiente: abre el enlace que te enviamos para confirmar ${pending}. Hasta que lo confirmes, sigue entrando con ${current || 'tu correo actual'}.`;
}

export type EmailChangeResult = { kind: 'changed'; email: string } | { kind: 'pending'; pending: string };

/** Interpreta la respuesta de PATCH /auth/account tras pedir un correo nuevo. */
export function emailChangeResult(requested: string, user: { email?: string; new_email?: string | null }): EmailChangeResult {
  const wanted = requested.trim().toLowerCase();
  if (user.email?.trim().toLowerCase() === wanted) return { kind: 'changed', email: user.email };
  return { kind: 'pending', pending: user.new_email || requested.trim() };
}

/** Texto del error de login. Ante credenciales rechazadas recuerda el caso del correo sin confirmar. */
export function loginFailureMessage(error: unknown) {
  const text = error instanceof Error ? error.message.trim() : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  const base = /[.!?]$/.test(text) ? text : text + '.';
  const status = (error as { status?: number } | null)?.status;
  return status === 401 ? `${base} Si cambiaste tu correo hace poco, el nuevo solo funciona después de confirmar el enlace que te enviamos; mientras tanto entra con el anterior.` : base;
}
