import API_URL from './api'
import type { CurrentUser } from '../types/auth'

type AuthPayload = {
  name?: string
  email: string
  password: string
}

type AuthResponse = {
  user?: CurrentUser
}

type ErrorResponse = {
  detail?: string
}

async function readApiError(response: Response) {
  let detail = `Request failed with status ${response.status}.`

  try {
    const error = (await response.json()) as ErrorResponse
    detail = error.detail ?? detail
  } catch {
    detail = response.statusText || detail
  }

  return detail
}

function normalizeUser(data: unknown): CurrentUser {
  const user = data as Partial<CurrentUser>

  if (
    typeof user.id !== 'number' ||
    typeof user.email !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.created_at !== 'string'
  ) {
    throw new Error('Unexpected user response from the auth API.')
  }

  return user as CurrentUser
}

async function authRequest(path: string, payload: AuthPayload): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as AuthResponse | CurrentUser

  return normalizeUser('user' in data ? data.user : data)
}

export function signup(payload: AuthPayload) {
  return authRequest('/auth/signup', payload)
}

export function login(payload: AuthPayload) {
  return authRequest('/auth/login', payload)
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_URL}/auth/me`, {
    credentials: 'include',
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as AuthResponse | CurrentUser

  return normalizeUser('user' in data ? data.user : data)
}

export async function saveCustomInstructions(value: string): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/auth/me/instructions`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_instructions: value }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  return normalizeUser(await response.json())
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}
