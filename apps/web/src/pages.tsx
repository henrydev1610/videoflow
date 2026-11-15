import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Link2, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createDownloadSchema } from '@videoflow/shared';
import {
  inspect,
  mutateJob,
  validMediaUrl,
  qualityLabels,
  statusLabels,
  ApiError,
  type Inspection,
} from './lib/api';
import { usePreferences } from './lib/preferences';
import { useSession } from './lib/session';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Empty,
  ErrorBox,
  JobDetails,
  JobsTable,
  Loading,
  useJobs,
} from './components/jobs';
export function Dashboard() {
  const query = useJobs(true);
  const [id, setId] = useState<string | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Visão geral</h1>
          <p>Suas mídias, do primeiro link ao arquivo pronto.</p>
        </div>
        <span className="context-label">
          <ShieldCheck size={15} /> Somente este navegador
        </span>
      </div>
      {query.isPending ? (
        <Loading />
      ) : (
        <>
          {query.error && (
            <ErrorBox
              error={query.error}
              stale={!!query.data}
              retry={() => void query.refetch()}
            />
          )}{' '}
          {query.data && (
            <>
              <div className="metrics">
                {(
                  [
                    ['total', 'Total de downloads'],
                    ['completed', 'Concluídos'],
                    ['active', 'Em processamento'],
                    ['failed', 'Com falha'],
                    ['cancelled', 'Cancelados'],
                  ] as const
                ).map(([key, label]) => (
                  <article key={key}>
                    <span>{label}</span>
                    <strong>
                      {query.data.summary[key].toLocaleString('pt-BR')}
                    </strong>
                    <span className={`metric-mark metric-${key}`} />
                  </article>
                ))}
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Atividades recentes</h2>
                    <p>As últimas solicitações do seu espaço.</p>
                  </div>
                  <a href="/downloads" className="text-link">
                    Ver todas <ArrowRight size={16} />
                  </a>
                </div>
                {query.data.items.length ? (
                  <JobsTable items={query.data.items} onDetail={setId} />
                ) : (
                  <Empty />
                )}
              </section>
            </>
          )}
        </>
      )}
      <div className="retention-note">
        <ShieldCheck size={19} />
        <p>
          Seu histórico pertence a este navegador. Limpar os cookies encerra o
          acesso aos trabalhos anteriores.
        </p>
      </div>
      <JobDetails id={id} onClose={() => setId(null)} />
    </>
  );
}
export function Manager({ history = false }: { history?: boolean }) {
  const query = useJobs();
  const [params, setParams] = useSearchParams();
  const { preferences } = usePreferences();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const id = params.get('job');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const urlSearch = params.get('q') ?? '';
  useEffect(() => {
    setSearch(urlSearch);
    clearTimeout(searchTimer.current);
  }, [urlSearch]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const searchFor = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => change('q', value), 300);
  };
  const change = (key: string, value: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page' && key !== 'job') next.set('page', '1');
      return next;
    });
  const filtered = !!(
    params.get('q') ||
    params.get('status') ||
    params.get('format')
  );
  const clear = () => {
    clearTimeout(searchTimer.current);
    setSearch('');
    setParams({});
  };
  const page = Number(params.get('page') || 1);
  const size = Number(params.get('pageSize') || preferences.pageSize);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{history ? 'Histórico' : 'Gerenciador'}</h1>
          <p>
            {history
              ? 'Encontre arquivos, reveja tentativas e consulte a validade.'
              : 'Acompanhe o processamento e escolha a próxima ação.'}
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="filters">
          <label className="search-field">
            <Search size={17} />
            <Input
              aria-label="Pesquisar solicitações"
              placeholder="Pesquisar por título…"
              maxLength={100}
              value={search}
              onChange={(e) => searchFor(e.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={params.get('status') ?? ''}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Formato
            <select
              value={params.get('format') ?? ''}
              onChange={(e) => change('format', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="mp4">MP4</option>
              <option value="mp3">MP3</option>
            </select>
          </label>
          <label>
            Ordenação
            <select
              value={params.get('sort') ?? 'createdAt:desc'}
              onChange={(e) => change('sort', e.target.value)}
            >
              <option value="createdAt:desc">Mais recentes</option>
              <option value="createdAt:asc">Mais antigos</option>
              <option value="title:asc">Título A–Z</option>
            </select>
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : (
          <>
            {query.error && (
              <ErrorBox
                error={query.error}
                stale={!!query.data}
                retry={() => void query.refetch()}
              />
            )}{' '}
            {query.data &&
              (query.data.items.length ? (
                <JobsTable
                  items={query.data.items}
                  onDetail={(id) => change('job', id)}
                />
              ) : (
                <Empty filtered={filtered} onClear={clear} />
              ))}
          </>
        )}
        <div className="pagination">
          <span>{query.data ? `${query.data.total} solicitações` : '—'}</span>
          <label>
            Por página
            <select
              value={size}
              onChange={(e) => change('pageSize', e.target.value)}
            >
              {[10, 20, 50].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span>Página {page}</span>
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => change('page', String(page - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={
              !query.data || page * size >= query.data.total || query.isFetching
            }
            onClick={() => change('page', String(page + 1))}
          >
            Próxima
          </Button>
        </div>
      </section>
      <p className="help">
        Arquivos disponíveis por 24 horas após a conclusão. Histórico por até 30
        dias, enquanto o contexto deste navegador for válido.
      </p>
      <JobDetails id={id} onClose={() => change('job', '')} />
    </>
  );
}
const urlSchema = z.object({
  url: z
    .string()
    .trim()
    .refine(
      validMediaUrl,
      'Informe uma URL HTTP ou HTTPS válida, sem credenciais, nas portas 80 ou 443.',
    ),
});
export function NewDownload() {
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const form = useForm<{ url: string }>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: '' },
  });
  const url = form.watch('url');
  const [metadata, setMetadata] = useState<Inspection | null>(null);
  const [format, setFormat] = useState<'mp4' | 'mp3'>(preferences.format);
  const [quality, setQuality] = useState(preferences.quality);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const active = useRef<AbortController | null>(null);
  const lastUrl = useRef(url);
  const operation = useRef<{ body: string; key: string } | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (lastUrl.current !== url) {
      active.current?.abort();
      setMetadata(null);
      setRights(false);
      setError(null);
      operation.current = null;
      lastUrl.current = url;
    }
  }, [url]);
  useEffect(() => () => active.current?.abort(), []);
  const consult = form.handleSubmit(async ({ url }) => {
    active.current?.abort();
    const control = new AbortController();
    active.current = control;
    setBusy(true);
    setError(null);
    setMetadata(null);
    try {
      const result = await inspect(url, control.signal);
      if (control.signal.aborted) return;
      setMetadata(result);
      setFormat(
        result.availableFormats.includes(preferences.format)
          ? preferences.format
          : (result.availableFormats[0] ?? 'mp4'),
      );
    } catch (error) {
      if (!control.signal.aborted) setError(error as Error);
    } finally {
      if (active.current === control) setBusy(false);
    }
  });
  async function create() {
    if (!metadata || sending.current) return;
    if (Date.parse(metadata.expiresAt) <= Date.now()) {
      setMetadata(null);
      setError(new Error('A inspeção expirou. Consulte a mídia novamente.'));
      return;
    }
    const parsed = createDownloadSchema.safeParse({
      inspectionId: metadata.inspectionId,
      format,
      quality,
      rightsConfirmed: rights,
    });
    if (!parsed.success) {
      setError(new Error('Confirme que possui autorização para esta mídia.'));
      return;
    }
    const body = JSON.stringify(parsed.data);
    if (operation.current?.body !== body)
      operation.current = { body, key: crypto.randomUUID() };
    sending.current = true;
    setCreating(true);
    setError(null);
    try {
      const job = await mutateJob(
        '/downloads',
        parsed.data,
        operation.current.key,
      );
      await cache.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Solicitação criada. Acompanhe o processamento.');
      navigate(`/downloads?job=${job.id}`);
    } catch (error) {
      setError(error as Error);
      if (error instanceof ApiError && error.code === 'INSPECTION_EXPIRED')
        setMetadata(null);
    } finally {
      sending.current = false;
      setCreating(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Novo download</h1>
          <p>Um link autorizado. O formato certo. Seu arquivo pronto.</p>
        </div>
      </div>
      <div className="creation-layout">
        <section className="panel creation-panel">
          <h2>Qual mídia você quer processar?</h2>
          <p className="help">
            Cole o endereço público de uma mídia própria ou autorizada.
          </p>
          <form onSubmit={consult} noValidate>
            <label htmlFor="media-url">URL da mídia</label>
            <div className="url-row">
              <Input
                id="media-url"
                placeholder="https://exemplo.com/video.mp4"
                {...form.register('url')}
                aria-invalid={!!form.formState.errors.url}
                aria-describedby="url-error"
                disabled={creating}
              />
              <Button type="submit" disabled={busy || creating}>
                {busy ? 'Consultando…' : 'Consultar mídia'}
                <ArrowRight size={16} />
              </Button>
            </div>
            <p id="url-error" role="alert" className="field-error">
              {form.formState.errors.url?.message}
            </p>
          </form>
          {busy && <Loading />}
          {error && (
            <div className="error-box" role="alert">
              {error.message}
            </div>
          )}
          {metadata && (
            <div className="inspection">
              <div className="media-preview">
                {metadata.thumbnailUrl &&
                /^\/api\/media\/inspections\/[a-f0-9-]+\/thumbnail$/.test(
                  metadata.thumbnailUrl,
                ) ? (
                  <img
                    src={metadata.thumbnailUrl}
                    alt="Miniatura da mídia selecionada"
                  />
                ) : (
                  <div className="thumbnail-placeholder">
                    <Link2 size={28} />
                  </div>
                )}
                <div>
                  <h3>{metadata.title ?? 'Título não informado'}</h3>
                  <p>{metadata.source ?? 'Origem não informada'}</p>
                  <small>
                    {metadata.durationSeconds === null
                      ? 'Duração não informada'
                      : `${Math.floor(metadata.durationSeconds / 60)} min ${Math.floor(metadata.durationSeconds % 60)} s`}
                  </small>
                </div>
              </div>
              <div className="options-grid">
                <fieldset>
                  <legend>Formato</legend>
                  {(['mp4', 'mp3'] as const).map((value) => (
                    <label className="choice" key={value}>
                      <input
                        type="radio"
                        name="format"
                        value={value}
                        checked={format === value}
                        disabled={
                          !metadata.availableFormats.includes(value) || creating
                        }
                        onChange={() => setFormat(value)}
                      />
                      <span>
                        <strong>{value.toUpperCase()}</strong>
                        <small>
                          {metadata.availableFormats.includes(value)
                            ? value === 'mp4'
                              ? 'Vídeo e áudio, quando disponível'
                              : 'Somente áudio'
                            : 'Indisponível nesta fonte'}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Qualidade</legend>
                  {(['low', 'medium', 'high'] as const).map((value) => (
                    <label className="choice" key={value}>
                      <input
                        type="radio"
                        name="quality"
                        checked={quality === value}
                        disabled={creating}
                        onChange={() => setQuality(value)}
                      />
                      <span>
                        <strong>{qualityLabels[value]}</strong>
                        <small>
                          {format === 'mp4'
                            ? {
                                low: 'Até 360p',
                                medium: 'Até 720p',
                                high: 'Até 1080p',
                              }[value]
                            : {
                                low: '96 kbps',
                                medium: '192 kbps',
                                high: '320 kbps',
                              }[value]}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
              <p className="help">
                A qualidade é limitada pela fonte. Aumentar o bitrate-alvo não
                recupera detalhes nem melhora o áudio original.
              </p>
              {metadata.warnings.includes('NO_AUDIO') && (
                <p className="help">
                  Esta mídia não possui áudio. O MP4 será silencioso.
                </p>
              )}
              <label className="rights">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                  disabled={creating}
                />
                Confirmo que sou proprietário ou tenho autorização para baixar e
                processar esta mídia.
              </label>
              <Button
                onClick={() => void create()}
                disabled={
                  !rights ||
                  creating ||
                  !metadata.availableFormats.includes(format)
                }
              >
                {creating ? 'Criando solicitação…' : 'Iniciar processamento'}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </section>
        <aside className="creation-help">
          <ShieldCheck size={24} />
          <h2>Controle do início ao fim</h2>
          <p>
            A consulta confirma as opções disponíveis antes de criar uma
            solicitação.
          </p>
          <ol>
            <li>Consulte uma URL pública.</li>
            <li>Escolha formato e qualidade.</li>
            <li>Confirme sua autorização.</li>
            <li>Acompanhe no gerenciador.</li>
          </ol>
          <p>
            Inspeções valem por 10 minutos. Arquivos ficam disponíveis por 24
            horas após a conclusão.
          </p>
          <p>
            Playlists, transmissões ao vivo, DRM e fontes que exigem login não
            são aceitos.
          </p>
        </aside>
      </div>
    </>
  );
}
export function Settings() {
  const { preferences, set, temporary } = usePreferences();
  const { expiresAt } = useSession();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Configurações</h1>
          <p>Seu jeito de trabalhar, salvo apenas neste navegador.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>Aparência e padrões</h2>
        {temporary && (
          <p role="status" className="error-box">
            O armazenamento local está indisponível. As preferências valem
            somente nesta sessão.
          </p>
        )}
        {(
          [
            {
              key: 'theme',
              label: 'Tema',
              description: 'A opção Sistema acompanha o dispositivo.',
              options: [
                ['system', 'Sistema'],
                ['light', 'Claro'],
                ['dark', 'Escuro'],
              ],
            },
            {
              key: 'format',
              label: 'Formato padrão',
              description: 'Usado em novas solicitações, quando disponível.',
              options: [
                ['mp4', 'MP4'],
                ['mp3', 'MP3'],
              ],
            },
            {
              key: 'quality',
              label: 'Qualidade padrão',
              description: 'Não altera trabalhos já criados.',
              options: [
                ['low', 'Baixa'],
                ['medium', 'Média'],
                ['high', 'Alta'],
              ],
            },
            {
              key: 'density',
              label: 'Densidade da tabela',
              description: 'Ajuste o espaço entre as linhas.',
              options: [
                ['comfortable', 'Confortável'],
                ['compact', 'Compacta'],
              ],
            },
          ] as const
        ).map((setting) => (
          <div className="setting-row" key={setting.key}>
            <div>
              <label htmlFor={setting.key}>{setting.label}</label>
              <p>{setting.description}</p>
            </div>
            <select
              id={setting.key}
              value={preferences[setting.key]}
              onChange={(e) => {
                set({ [setting.key]: e.target.value });
                toast.success('Preferência salva neste navegador.');
              }}
            >
              {setting.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="setting-row">
          <label htmlFor="page-size">Solicitações por página</label>
          <select
            id="page-size"
            value={preferences.pageSize}
            onChange={(e) =>
              set({ pageSize: Number(e.target.value) as 10 | 20 | 50 })
            }
          >
            {[10, 20, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      </section>
      <section className="privacy-note">
        <ShieldCheck size={24} />
        <div>
          <h2>Um espaço sem conta</h2>
          <p>
            As preferências são locais. Seu histórico é acessível pela
            capacidade protegida deste navegador, válida até{' '}
            {new Date(expiresAt).toLocaleDateString('pt-BR')}. Limpar cookies
            encerra o acesso anterior; não há recuperação por conta.
          </p>
        </div>
      </section>
    </>
  );
}
