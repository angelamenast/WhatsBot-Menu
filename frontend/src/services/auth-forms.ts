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
export interface RegisterData { nombre:string; email:string; telefono:string; password:string; confirm:string }
interface RegisterActions {
  register(data: {email:string; password:string; nombre:string; telefono?:string}): Promise<unknown>;
  login(credentials: {email:string; password:string}): Promise<unknown>;
  success(): Promise<void>;
  failure(): void;
}
export function registerErrors(data: RegisterData) {
  return {
    nombre: !data.nombre.trim() ? 'Escribe tu nombre.' : '',
    email: loginErrors(data.email, 'x').email,
    password: !data.password ? 'Escribe una contraseña.' : data.password.length < 8 ? 'La contraseña debe tener al menos 8 caracteres.' : '',
    confirm: !data.confirm ? 'Confirma tu contraseña.' : data.confirm !== data.password ? 'Las contraseñas no coinciden.' : '',
  };
}
export function registerFailureMessage(error: unknown) {
  if ((error as {status?:number} | null)?.status === 409) return 'Ya existe una cuenta con este correo. Inicia sesión o continúa con Google.';
  return error instanceof Error && error.message ? error.message : 'No se pudo crear la cuenta. Inténtalo de nuevo.';
}
export function bindRegisterForm(actions: RegisterActions) {
  const element = document.getElementById('registerForm') as HTMLFormElement | null;
  if (!element) return;
  const form = element;
  const fields = {
    nombre: document.getElementById('reg-nombre') as HTMLInputElement,
    email: document.getElementById('reg-email') as HTMLInputElement,
    telefono: document.getElementById('reg-telefono') as HTMLInputElement,
    password: document.getElementById('reg-password') as HTMLInputElement,
    confirm: document.getElementById('reg-confirm') as HTMLInputElement,
  };
  const submit = document.getElementById('btnRegister') as HTMLButtonElement;
  const label = document.getElementById('btnRegisterText')!;
  const message = document.getElementById('register-error')!;
  const touched = new Set<string>();
  let busy = false;
  // Si el registro ya se hizo y solo falló el login, reintentar no debe registrar de nuevo.
  let registered = false;
  form.noValidate = true;
  const values = (): RegisterData => ({ nombre:fields.nombre.value, email:fields.email.value, telefono:fields.telefono.value, password:fields.password.value, confirm:fields.confirm.value });
  function render() {
    const errors = registerErrors(values());
    for (const key of ['nombre', 'email', 'password', 'confirm'] as const) {
      const error = touched.has(key) ? errors[key] : '';
      const hint = document.getElementById('reg-' + key + '-error')!;
      hint.textContent = error;
      hint.hidden = !error;
      fields[key].setAttribute('aria-invalid', String(Boolean(error)));
    }
    submit.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
    label.textContent = busy ? 'Creando cuenta…' : 'Crear cuenta';
  }
  for (const [key, field] of Object.entries(fields)) {
    field.addEventListener('input', () => {
      if (key === 'email') registered = false;
      message.hidden = true; render();
    });
    field.addEventListener('blur', () => { touched.add(key); render(); });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    for (const key of ['nombre', 'email', 'password', 'confirm']) touched.add(key);
    render();
    const errors = registerErrors(values());
    if (Object.values(errors).some(Boolean)) return;
    busy = true; message.hidden = true; render();
    const email = fields.email.value.trim();
    const password = fields.password.value;
    let success = false;
    try {
      if (!registered) {
        await actions.register({ email, password, nombre:fields.nombre.value.trim(), telefono:fields.telefono.value.trim() || undefined });
        registered = true;
      }
      try { await actions.login({ email, password }); }
      catch { throw new Error('Tu cuenta se creó, pero no pudimos iniciar sesión. Inténtalo de nuevo o entra desde Iniciar Sesión.'); }
      await actions.success(); success = true;
    } catch (error) {
      actions.failure();
      message.textContent = registerFailureMessage(error);
      message.hidden = false;
    } finally { if (!success) { busy = false; render(); } }
  });
  render();
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
