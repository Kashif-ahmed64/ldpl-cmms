import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ApiError, getApiBase, setApiBase } from '@/lib/api';
import { assetUrl, isDesktop } from '@/lib/desktop';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBase() || 'http://localhost:3001');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isDesktop()) {
        await setApiBase(serverUrl);
      }
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-ldpl-navy text-white flex-col justify-center px-16">
        <img src={assetUrl('ldpl-logo.svg')} alt="LDPL" className="h-16 mb-8" />
        <h1 className="text-3xl font-bold mb-4">LDPL CMMS</h1>
        <p className="text-white/70 text-lg leading-relaxed max-w-md">
          Desktop maintenance management system for Liberty Daharki Powers Ltd — 235 MW
          Power Plant, Daharki.
        </p>
        <div className="mt-12 space-y-3 text-sm text-white/50">
          <p>Equipment Registry · Work Orders · PM Scheduling</p>
          <p>Inventory · Purchasing · Reports & Analytics</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-ldpl-light">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <img src={assetUrl('ldpl-logo.svg')} alt="LDPL" className="h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ldpl-navy">LDPL CMMS</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Sign in</h2>
            <p className="text-sm text-gray-500 mb-6">LDPL CMMS Desktop Application</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isDesktop() && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowServer(!showServer)}
                    className="text-xs text-ldpl-accent hover:underline"
                  >
                    {showServer ? 'Hide server settings' : 'Configure API server address'}
                  </button>
                  {showServer && (
                    <input
                      type="url"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://192.168.1.100:3001"
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ldpl-accent focus:border-transparent"
                  placeholder="admin"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ldpl-accent focus:border-transparent"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-ldpl-accent text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-xs text-gray-400 text-center">
              Default: admin / Admin@123 — change after first login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
