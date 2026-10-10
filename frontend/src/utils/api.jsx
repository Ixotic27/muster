import { site } from '../config';

const BASE = process.env.REACT_APP_API_URL || '/api/v1';
export async function api(path, {
  body,
  ...options
} = {}) {
  const isFile = body instanceof FormData;
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(body && !isFile ? {
          'Content-Type': 'application/json'
        } : {}),
        ...options.headers
      },
      ...(body ? {
        body: isFile ? body : JSON.stringify(body)
      } : {})
    });
  } catch {
    throw new Error(`Unable to reach ${site.name}. Check your connection and try again.`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.details?.join(' · ') || data?.message || 'The service is temporarily unavailable. Please try again.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
