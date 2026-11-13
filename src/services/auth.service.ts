import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Perfil } from '../types/attendance';
import { supabase } from './supabase.client';
import { storageService } from './storage.service';

// ---------------------------------------------------------------------------
// Firebase: SOLO para obtener el token OAuth de Google (Gmail / Calendar).
// No define la identidad ni el rol del usuario: eso lo hace Supabase Auth.
// ---------------------------------------------------------------------------
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/gmail.send');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// ---------------------------------------------------------------------------
// Estado de sesión
// ---------------------------------------------------------------------------
export type AuthStatus = 'loading' | 'signed_out' | 'hydrating' | 'ready' | 'error';

export interface AuthState {
  status: AuthStatus;
  user: FirebaseUser | null;
  profile: Perfil | null;
  accessToken: string | null;
  isGoogleAuthenticated: boolean;
  error: string | null;
}

let status: AuthStatus = 'loading';
let activeProfile: Perfil | null = null;
let lastError: string | null = null;
const authListeners = new Set<(state: AuthState) => void>();

function currentState(): AuthState {
  return {
    status,
    user: auth.currentUser,
    profile: activeProfile,
    accessToken: cachedAccessToken,
    isGoogleAuthenticated: !!cachedAccessToken,
    error: lastError,
  };
}

function notifyAuthChange() {
  const state = currentState();
  authListeners.forEach((listener) => listener(state));
}

export const subscribeToAuth = (listener: (state: AuthState) => void) => {
  authListeners.add(listener);
  listener(currentState());
  return () => {
    authListeners.delete(listener);
  };
};

export const getActiveProfile = (): Perfil | null => activeProfile;

async function fetchPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  if (!data) return null;
  const perfil: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== null) perfil[k] = v;
  return perfil as unknown as Perfil;
}

/**
 * Carga el perfil del usuario autenticado y descarga los datos de la app.
 * Devuelve un mensaje de error si el usuario no tiene acceso.
 */
async function startSession(userId: string): Promise<string | null> {
  status = 'hydrating';
  lastError = null;
  notifyAuthChange();

  try {
    const perfil = await fetchPerfil(userId);
    const accessError = !perfil
      ? 'Tu cuenta no tiene un perfil asignado en Cultura CCA. Contacta a la Dirección.'
      : perfil.activo === false
      ? 'Tu usuario está desactivado. Contacta a la Dirección.'
      : null;
    if (!perfil || accessError) {
      lastError = accessError;
      status = 'signed_out'; // evita que el evento SIGNED_OUT vuelva a cerrar la sesión
      await supabase.auth.signOut();
      endSession();
      return accessError;
    }

    activeProfile = perfil;
    await storageService.hydrate();
    status = 'ready';
    notifyAuthChange();
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error al cargar los datos.';
    activeProfile = null;
    status = 'error';
    lastError = message;
    notifyAuthChange();
    return message;
  }
}

function endSession() {
  activeProfile = null;
  cachedAccessToken = null;
  storageService.reset();
  status = 'signed_out';
  notifyAuthChange();
}

// Restaurar sesión al cargar la app
void (async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await startSession(data.session.user.id);
  } else {
    status = 'signed_out';
    notifyAuthChange();
  }
})();

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && status !== 'signed_out') {
    endSession();
  }
});

/** Reintenta la carga de datos tras un error (p. ej. sin conexión) */
export const retrySession = async (): Promise<void> => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await startSession(data.session.user.id);
  } else {
    endSession();
  }
};

/**
 * Inicia sesión con correo o nombre de usuario y contraseña (Supabase Auth)
 */
export const loginWithCredentials = async (
  identifier: string,
  password: string
): Promise<{ success: boolean; error?: string; profile?: Perfil }> => {
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId || !password) {
    return { success: false, error: 'Por favor ingresa tu usuario y contraseña.' };
  }

  let email = cleanId;
  if (!cleanId.includes('@')) {
    const { data, error } = await supabase.rpc('email_por_usuario', { p_username: cleanId });
    if (error) {
      return { success: false, error: `No se pudo verificar el usuario: ${error.message}` };
    }
    if (!data) {
      return { success: false, error: 'Usuario o contraseña incorrectos.' };
    }
    email = String(data);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { success: false, error: 'Usuario o contraseña incorrectos.' };
  }

  const sessionError = await startSession(data.user.id);
  if (sessionError) {
    return { success: false, error: sessionError };
  }
  return { success: true, profile: activeProfile ?? undefined };
};

/**
 * Cierra la sesión (Supabase y, si existe, Google)
 */
export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch {
    // ignorar
  }
  await supabase.auth.signOut().catch(() => undefined);
  lastError = null;
  endSession();
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Conecta la cuenta de Google para enviar correos (Gmail) y crear eventos (Calendar).
 * NO cambia el usuario ni el rol activo de la app.
 */
export const signInWithGoogle = async (): Promise<{ user: FirebaseUser; accessToken: string }> => {
  if (isSigningIn) throw new Error('Ya hay un proceso de inicio de sesión en curso.');
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google');
    }

    cachedAccessToken = credential.accessToken;
    notifyAuthChange();
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch {
    // ignorar
  }
  cachedAccessToken = null;
  notifyAuthChange();
};

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedAccessToken = null;
  }
  notifyAuthChange();
});
