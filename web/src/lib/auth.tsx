import { createContext, useContext } from 'react';

export interface AuthState {
  signOut: () => void;
}

export const AuthContext = createContext<AuthState>({ signOut: () => {} });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
