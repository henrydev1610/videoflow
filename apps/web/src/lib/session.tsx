import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contextLost, initialize } from './api';
let bootstrap: ReturnType<typeof initialize> | undefined;
const Session = createContext({ generation: 0, expiresAt: '' });
export const useSession = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [expiresAt, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'lost' | 'error'>(
    'loading',
  );
  async function start() {
    setState('loading');
    try {
      const run = () => initialize();
      bootstrap ??= (async () =>
        navigator.locks
          ? await navigator.locks.request('videoflow-context-bootstrap', run)
          : await run())();
      const result = await bootstrap;
      setExpiry(result.data.expiresAt);
      setState('ready');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Verifique sua conexão e tente novamente.',
      );
      setState('error');
    } finally {
      bootstrap = undefined;
    }
  }
  useEffect(() => {
    void start();
    const lost = () => {
      void cache.cancelQueries();
      cache.clear();
      setGeneration((n) => n + 1);
      setState('lost');
    };
    contextLost.addEventListener('lost', lost);
    return () => contextLost.removeEventListener('lost', lost);
  }, [cache]);
  if (state !== 'ready')
    return (
      <main className="session-screen">
        <div className="brand">
          VideoFlow<span>Gestão de mídia</span>
        </div>
        {state === 'loading' ? (
          <p role="status">Preparando seu espaço neste navegador…</p>
        ) : (
          <>
            <h1>
              {state === 'lost'
                ? 'Seu acesso anterior expirou'
                : 'Não foi possível abrir seu espaço'}
            </h1>
            <p>
              {state === 'lost'
                ? 'Os dados anteriores foram removidos desta tela. Limpar cookies ou expirar o contexto encerra o acesso ao histórico. Iniciar um novo espaço não recupera os arquivos anteriores.'
                : `${error} Nenhuma solicitação será criada automaticamente.`}
            </p>
            <button className="primary" onClick={() => void start()}>
              {state === 'lost' ? 'Iniciar novo espaço' : 'Tentar novamente'}
            </button>
          </>
        )}
      </main>
    );
  return (
    <Session.Provider value={{ generation, expiresAt }}>
      {children}
    </Session.Provider>
  );
}
