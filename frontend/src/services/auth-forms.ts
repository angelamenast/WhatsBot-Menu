interface LoginActions {
  login(credentials: {email:string; password:string}): Promise<unknown>;
  google(): Promise<unknown>;
  success(): Promise<void>;
  failure(): void;
}
export function loginErrors(email: string, password: string) {
  return {
    email: !email.trim() ? 'Escribe tu correo electrónico.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Escribe un correo válido, por ejemplo nombre@empresa.com.' : '',
    password: !password ? 'Escribe tu contraseña.' : '',
  };
}
export function bindLoginForm(actions: LoginActions) {
  const element = document.getElementById('loginForm') as HTMLFormElement | null;
  if (!element) return;
  const form = element;
  const email = document.getElementById('email') as HTMLInputElement;
  const password = document.getElementById('password') as HTMLInputElement;
  const submit = document.getElementById('btnSubmit') as HTMLButtonElement;
  const google = document.getElementById('btnGoogle') as HTMLButtonElement;
  const label = document.getElementById('btnText')!;
  const message = document.getElementById('login-error')!;
  const touched = new Set<string>();
  let busy = false;
  let rejected = false;
  form.noValidate = true;
  function render() {
    const errors = loginErrors(email.value, password.value);
    for (const [key, field] of [['email', email], ['password', password]] as const) {
      const error = touched.has(key) ? errors[key] : '';
      const hint = document.getElementById(key + '-error')!;
      hint.textContent = error;
      hint.hidden = !error;
      field.setAttribute('aria-invalid', String(Boolean(error)));
    }
    submit.disabled = busy || rejected || Boolean(errors.email || errors.password);
    google.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
    label.textContent = busy ? 'Autenticando…' : 'Iniciar Sesión';
  }
  for (const field of [email, password]) {
    field.addEventListener('input', () => {
      touched.add(field.id); rejected = false;
      message.textContent = ''; message.hidden = true; render();
    });
    field.addEventListener('blur', () => { touched.add(field.id); render(); });
    field.addEventListener('change', render);
  }
  function showFailure(error: unknown) {
    message.textContent = error instanceof Error ? error.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    message.hidden = false;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    touched.add('email'); touched.add('password'); render();
    if (submit.disabled) return;
    busy = true; message.hidden = true; render();
    let success = false;
    try {
      await actions.login({email:email.value.trim(), password:password.value});
      await actions.success(); success = true;
    } catch (error) {
      actions.failure(); rejected = true; showFailure(error);
    } finally { if (!success) { busy = false; render(); } }
  });
  google.addEventListener('click', async () => {
    if (busy) return;
    busy = true; message.hidden = true; render();
    let success = false;
    try { await actions.google(); success = true; }
    catch (error) { showFailure(error); }
    finally { if (!success) { busy = false; render(); } }
  });
  render();
  // Revisa valores que el navegador haya autocompletado al restaurar la página.
  window.addEventListener('pageshow', render);
}
export function bindGoogleRegistration(start: () => Promise<unknown>) {
  const button = document.getElementById('google-sso-btn') as HTMLButtonElement | null;
  const error = document.getElementById('google-error');
  if (!button || !error) return;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true; button.setAttribute('aria-busy', 'true'); error.hidden = true;
    try { await start(); }
    catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : 'No se pudo conectar con Google. Inténtalo de nuevo.';
      error.hidden = false; button.disabled = false; button.setAttribute('aria-busy', 'false');
    }
  });
}
