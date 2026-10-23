export interface CurrentMembership {
  id: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
}

/** Refresh security claims on every Auth.js session read, never from client updates. */
export async function refreshMembership<T extends Record<string, unknown>>(
  token: T,
  subjectId: unknown,
  findUser: (id: string) => Promise<CurrentMembership | null>,
) {
  if (typeof subjectId !== 'string' || !subjectId) return null

  // Let DB failures reject the request instead of trusting stale JWT privileges.
  const user = await findUser(subjectId)
  if (!user || !user.isActive || !['ADMIN', 'USER'].includes(user.role)) return null

  return {
    ...token,
    id: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}
