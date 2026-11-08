"use client";

import { createContext, useContext } from "react";

// What the admin layout tells the forms, from the server:
//   required: true when 2-step login is required (the normal, safe setting)
//   mode:     which fresh confirm a risky form asks for. "code" = a 6-digit code from the person's own
//             authenticator app. "password" = their own account password (only when they have no
//             authenticator yet, which can happen only while the server setting for 2-step login is switched off).
export type TwoFactorInfo = { required: boolean; mode: "code" | "password" };

const TwoFactorContext = createContext<TwoFactorInfo>({ required: true, mode: "code" });

export const TwoFactorProvider = TwoFactorContext.Provider;
export const useTwoFactorInfo = () => useContext(TwoFactorContext);
export const useTwoFactorRequired = () => useContext(TwoFactorContext).required;
