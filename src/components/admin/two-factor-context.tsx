"use client";

import { createContext, useContext } from "react";

// True when admins must use 2FA (the normal, safe setting). The admin layout sets it from the server.
// When it is false, forms do not ask for the 6-digit code.
const TwoFactorContext = createContext(true);

export const TwoFactorProvider = TwoFactorContext.Provider;
export const useTwoFactorRequired = () => useContext(TwoFactorContext);
