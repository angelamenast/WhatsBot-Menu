# CI/CD — WhatsBot Menú (Tremia)

Nadie sube código directo a `develop` ni a `master`: todo entra por pull request, GitHub Actions lo prueba
y, al unirlo a `master`, Railway (backend) y Vercel (frontend) despliegan solos.

## Ramas

| Rama | Para qué | Cómo se escribe en ella |
| --- | --- | --- |
| `master` | Producción | Solo PR desde `develop`, CI en verde y 1 aprobación |
| `develop` | Integración | Solo PR desde una rama de trabajo, CI en verde y 1 aprobación |
| `feature/TREMIA-123-…`, `fix/TREMIA-123-…` | Una tarea de Jira | Su responsable |

## Flujo de cada cambio

1. `git checkout develop && git pull`
2. `git checkout -b feature/TREMIA-123-descripcion`
3. Trabajar, y antes de subir correr `npm run lint`, `npm test` y `npm run build`.
4. `git push -u origin feature/TREMIA-123-descripcion` y abrir un PR hacia `develop`.
5. Esperar el CI en verde y una aprobación; luego unir.
6. Para liberar: PR de `develop` a `master` (aquí también corren las pruebas de integración).

## Qué revisa el CI (`.github/workflows/ci.yml`)

| Trabajo | Qué corre | Cuándo |
| --- | --- | --- |
| Backend | `npm ci`, `lint`, `build`, `test` (Node de `Backend/.node-version`) | Todo PR y push a develop/master |
| Frontend | `npm ci`, `test`, `astro check`, `build` (Node 22) | Todo PR y push a develop/master |
| Integración | `npm run test:int` contra Supabase de pruebas y Wompi sandbox | Solo PR hacia `master` |

Los secretos del CI (solo de pruebas) se guardan en GitHub → Settings → Secrets and variables → Actions:
`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `WOMPI_TEST_BASE_URL`, `WOMPI_TEST_PUBLIC_KEY`,
`WOMPI_TEST_PRIVATE_KEY`, `WOMPI_TEST_EVENTS_SECRET`. Nunca las de producción.

## Despliegue (CD)

- **Railway** despliega `master` y espera a que el CI pase (opción *Wait for CI*).
- **Vercel** despliega `master` a producción y crea una vista previa por cada PR.
- Después de cada despliegue: `…/api/health` y `…/api/health/db` deben responder `{"ok":true}`.

## Si algo se rompe en producción

1. Railway → Deployments → despliegue anterior → **Redeploy**.
2. Vercel → Deployments → anterior → **Promote to Production**.
3. Arreglar con calma: PR con `git revert` del cambio que falló.
