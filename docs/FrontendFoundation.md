# Frontend Foundation

## Architecture

`frontend` is a feature-oriented React + TypeScript application. Vite provides development/build tooling, Tailwind CSS v4 provides utility styling, React Router handles routes, Axios handles HTTP, and TanStack Query owns server cache. Authentication state is held in a small React Context; React Hook Form and Zod validate login and password changes. Lucide supplies icons and Sonner displays notifications.

```text
src/
  app/providers/       Query and notification providers
  app/router/          Auth and role route guards
  components/          Layout, shared form and feedback components
  features/auth/       Login, password change, schemas and API
  features/{admin,teacher,student}/  Dashboard shells
  features/shared/     Profile and placeholder/status pages
  lib/api/             Axios clients, refresh coordination and error normalization
  styles/              Tailwind theme and global styles
```

## Installation and configuration

From `frontend`, copy `.env.example` to `.env` and run `npm install`. For local API development the Vite server proxies `/api` to `http://localhost:5169`, which matches the backend's `http` launch profile. Override `VITE_DEV_API_TARGET` if needed. `VITE_API_BASE_URL` can point to a public API origin for deployment; Vite variables are public and must never contain secrets.

Commands: `npm run dev`, `npm run build`, `npm run lint`, `npm run test -- --run`, and `npm audit --omit=dev`.

## Authentication and routing

The actual contracts are:

- `POST /api/auth/login`: `{ username, password }`, returns `{ accessToken, accessTokenExpiresAt, user }` and sets the HttpOnly refresh cookie.
- `POST /api/auth/refresh`: no JSON body; cookie-authenticated, returns a rotated access token and profile.
- `POST /api/auth/logout`: cookie-authenticated, returns `204`.
- `GET /api/auth/me`: returns `{ id, username, fullName, role, gradeId, mustChangePassword }`.
- `PUT /api/auth/change-password`: `{ currentPassword, newPassword }`; backend requires 12+ characters, revokes refresh tokens and clears the cookie.

The access token stays in memory only. Refresh tokens are never read or persisted by frontend code. On app initialization one refresh request restores the session; successful restoration is followed by `/me`. An Axios single-flight promise coordinates concurrent `401` responses and retries each request once. Login, refresh and logout failures are excluded from interceptor retry. Logout always clears the in-memory token and all TanStack Query cache.

All protected routes wait for initialization. Routes are separated for `ADMIN`, `TEACHER` and `STUDENT`; `/change-password` is shared. Forced password changes block other protected routes. Return paths are limited to internal absolute paths. `/403` and `/404` are public.

## Layout and API errors

The shell includes responsive sidebar/mobile navigation, header, page layouts, buttons, accessible fields, loading and empty states. Dashboards show actual user profile information and navigation. Statistics and future business modules are visibly marked as placeholders; no fake records are shown.

The backend's normal error contract is `{ error: { code, message } }`. Axios maps this to a friendly message and status; unexpected server details are not surfaced. TanStack Query avoids retries on `401` and `403`, disables mutation retries, and does not persist sensitive cache.

## Cookie, CORS and deployment limitations

Backend inspection found the refresh cookie configured `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, and `Secure` outside Development. The API currently has no CORS policy. Local Vite proxy keeps browser requests same-origin and works with these settings.

For deployment, serve the frontend and API under a compatible same-site setup or add an explicit trusted-origin CORS policy and suitable cookie settings on the backend. Cross-site deployment will not work reliably with the current `SameSite=Lax` cookie. Backend refresh/logout actions do not validate an Origin/Referer header or CSRF token; `SameSite=Lax` is the current browser mitigation. A production cross-site arrangement requires backend security review and explicit origin/CSRF protection.

## Testing and next phases

Vitest + React Testing Library are configured. Schema tests cover required login fields, backend password length and confirmation. The backend was not started for this frontend task, so live login, browser refresh-cookie behavior, CORS and role navigation against a running server remain to be manually checked.

Next phases can implement Admin and Teacher management screens, chapter/question workflows, student learning/practice, and exam-taking/results screens using the documented backend contracts.
