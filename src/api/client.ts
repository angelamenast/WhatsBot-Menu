const BASE_URL =
  import.meta.env.PUBLIC_NEST_API_URL || "http://localhost:3000/auth";

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetcher<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, headers, ...restOptions } = options;

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: defaultHeaders,
    ...restOptions,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // NestJS puede devolver 'message' como un string o un array de errores de validación
    let errorMessage = "Error en la petición";
    if (Array.isArray(errorData.message)) {
      errorMessage = errorData.message.join(", ");
    } else if (errorData.message) {
      errorMessage = errorData.message;
    } else if (response.status === 429) {
      errorMessage = "Demasiados intentos. Por favor espera un minuto.";
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}
