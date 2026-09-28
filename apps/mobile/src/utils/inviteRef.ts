let pendingInvite: string | undefined;

export const inviteRef = {
  get: () => pendingInvite,
  set: (code?: string | null) => {
    pendingInvite = code || undefined;
  },
  consume: () => {
    const value = pendingInvite;
    pendingInvite = undefined;
    return value;
  },
};
