"use client";

import { createContext, useContext } from "react";

export type BackupLinks = {
  messengerUrl: string | null;
  viberUrl: string | null;
};

const BackupLinksContext = createContext<BackupLinks>({ messengerUrl: null, viberUrl: null });

// The public layout puts the Messenger and Viber links here. Client components (the error page,
// the contact form) read them with useBackupLinks, so they never need to read the database.
export function BackupLinksProvider({
  links,
  children,
}: {
  links: BackupLinks;
  children: React.ReactNode;
}) {
  return <BackupLinksContext.Provider value={links}>{children}</BackupLinksContext.Provider>;
}

export function useBackupLinks(): BackupLinks {
  return useContext(BackupLinksContext);
}
