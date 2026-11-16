import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './client';

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function subscribeAuth(callback: (user: AuthUser | null) => void): Unsubscribe {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => callback(toAuthUser(user)));
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const mapped = toAuthUser(cred.user);
  if (!mapped) throw new Error('AUTH_NO_USER');
  return mapped;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}
