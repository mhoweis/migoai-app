let pendingInvite: string | undefined;
let pendingTransfer: string | undefined;

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
  getTransfer: () => pendingTransfer,
  setTransfer: (code?: string | null) => {
    pendingTransfer = code || undefined;
  },
  consumeTransfer: () => {
    const value = pendingTransfer;
    pendingTransfer = undefined;
    return value;
  },
};
