import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Sun,
  Moon,
  AlertCircle,
} from 'lucide-react';
import { loginWithCredentials } from '../../services/auth.service';
import { useTheme } from '../../context/ThemeContext';

interface LoginViewProps {
  /** Error previo (p. ej. usuario sin perfil o desactivado) */
  initialError?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ initialError = null }) => {
  const { theme, toggleTheme } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Si el login es exitoso, App cambia de pantalla automáticamente
      const result = await loginWithCredentials(identifier, password);
      if (!result.success) {
        setError(result.error || 'Credenciales incorrectas');
      }
    } catch {
      setError('Ocurrió un error al procesar el inicio de sesión. Verifica tu conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      {/* Barra superior: marca a la izquierda y tema a la derecha, de borde a borde */}
      <header className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3 border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-[#0F141D]/70 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo-emblema-96.png"
            alt=""
            width={36}
            height={36}
            className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-700 object-contain shrink-0"
          />
          <div className="leading-tight min-w-0">
            <span className="block font-semibold text-xs tracking-tight text-slate-900 dark:text-white truncate">
              Colegio Centro América
            </span>
            <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">Cultura CCA</span>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>
      </header>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-auto px-4 sm:px-0 py-8">
        <div className="bg-white dark:bg-[#131924] rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="space-y-1 text-center">
            {/* Logo completo; en modo oscuro va sobre una placa blanca para que el azul se vea */}
            <div className="mx-auto mb-4 max-w-[260px] dark:bg-white dark:rounded-xl dark:px-4 dark:py-3">
              <img
                src="/logo-cca.png"
                alt="Colegio Centro América · Nicaragua"
                width={720}
                height={354}
                className="w-full h-auto"
              />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Cultura CCA
            </h1>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Usuario o Correo Institucional
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="usuario o correo@cca.edu.ni"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-700 dark:text-slate-300">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 dark:bg-[#1A222D] border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <p className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center text-[11px] text-slate-400 dark:text-slate-500">
            ¿Olvidaste tu contraseña? Solicita a la Jefatura de Área que la restablezca.
          </p>


        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full text-center text-[11px] text-slate-400 dark:text-slate-500 px-4 sm:px-6 lg:px-8 py-4">
        <span>© {new Date().getFullYear()} Colegio Centro América · Todos los derechos reservados</span>
      </footer>
    </div>
  );
};
