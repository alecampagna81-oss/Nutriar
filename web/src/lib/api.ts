export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message);
  }
}

async function handle(r: Response) {
  const type = r.headers.get('content-type') ?? '';
  const body = type.includes('application/json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    if (r.status === 401 && !location.pathname.startsWith('/ingresar')) window.dispatchEvent(new Event('nutriar:unauthorized'));
    throw new ApiError(r.status, body?.error ?? `Error ${r.status}. Volvé a intentar.`, body?.details);
  }
  return body;
}

async function request<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body instanceof FormData ? { 'x-nutriar': '1' } : { 'content-type': 'application/json', 'x-nutriar': '1' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisá tu conexión: tus datos no se guardaron todavía.');
  }
  return handle(r);
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T = any>(url: string, body?: unknown) => request<T>('DELETE', url, body ?? {}),
};

/** Mensaje legible de un error, incluyendo los campos inválidos. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = Array.isArray(e.details) ? e.details.map((x: any) => x.mensaje).filter(Boolean) : [];
    return d.length ? `${e.message}: ${[...new Set(d)].join('; ')}` : e.message;
  }
  return 'Ocurrió un error inesperado. Volvé a intentar.';
}

/** Descarga un archivo autenticado (PDF, ZIP) mediante un enlace temporal en memoria. */
export async function download(url: string, filename: string) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    const b = await r.json().catch(() => null);
    throw new ApiError(r.status, b?.error ?? 'No se pudo descargar el archivo');
  }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
