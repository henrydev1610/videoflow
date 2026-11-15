import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  MoreHorizontal,
  RotateCcw,
  Square,
  FileVideo,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { listQuerySchema } from '@videoflow/shared';
import {
  detail,
  list,
  mutateJob,
  isActive,
  pollInterval,
  bytes,
  date,
  statusLabels,
  qualityLabels,
  type Job,
} from '../lib/api';
import { useSession } from '../lib/session';
import { usePreferences } from '../lib/preferences';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './ui/sheet';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
export function useVisible() {
  const [visible, set] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const change = () => set(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return visible;
}
export function useJobs(recent = false) {
  const { generation } = useSession();
  const { preferences } = usePreferences();
  const [params] = useSearchParams();
  const visible = useVisible();
  const candidate = Object.fromEntries(params);
  delete candidate.job;
  const parsed = listQuerySchema.safeParse(
    recent
      ? { page: 1, pageSize: 5 }
      : { ...candidate, pageSize: candidate.pageSize ?? preferences.pageSize },
  );
  const filters = parsed.success
    ? parsed.data
    : listQuerySchema.parse({ pageSize: preferences.pageSize });
  return useQuery({
    queryKey: ['jobs', generation, filters],
    queryFn: ({ signal }) => list(filters, signal),
    refetchInterval: (q) =>
      pollInterval(!!q.state.data?.summary.active, visible),
    refetchIntervalInBackground: false,
    staleTime: 1000,
    retry: false,
  });
}
export function Empty({
  filtered = false,
  onClear,
}: {
  filtered?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h2>
        {filtered
          ? 'Nenhuma solicitação encontrada'
          : 'Seu próximo arquivo começa aqui'}
      </h2>
      <p>
        {filtered
          ? 'Experimente outra pesquisa ou remova os filtros.'
          : 'Inspecione uma mídia autorizada e acompanhe cada etapa neste espaço.'}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear}>
          Limpar filtros
        </Button>
      ) : (
        <a className="primary" href="/new">
          Criar solicitação
        </a>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div
      aria-label="Carregando solicitações"
      role="status"
      className="loading-list"
    >
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
  stale = false,
}: {
  error: Error;
  retry: () => void;
  stale?: boolean;
}) {
  return (
    <div role="alert" className="error-box">
      <strong>
        {stale ? 'Dados desatualizados. ' : ''}
        {error.message}
      </strong>
      <Button variant="outline" onClick={retry}>
        Tentar novamente
      </Button>
    </div>
  );
}
export function JobStatus({ job }: { job: Job }) {
  return (
    <div className="job-status">
      <span
        role="status"
        aria-live="polite"
        className={`status status-${job.status.toLowerCase()}`}
      >
        <span aria-hidden="true" />
        {statusLabels[job.status]}
      </span>
      {isActive(job) && (
        <>
          <div
            className="progress"
            role="progressbar"
            aria-label={`Progresso de ${job.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progressIndeterminate ? undefined : job.progress}
          >
            <span
              style={{
                width: job.progressIndeterminate ? '30%' : `${job.progress}%`,
              }}
              className={job.progressIndeterminate ? 'indeterminate' : ''}
            />
          </div>
          <small className="block">
            {job.progressIndeterminate
              ? 'Aguardando estimativa'
              : `${job.progress}%`}
          </small>
        </>
      )}
    </div>
  );
}
export function JobsTable({
  items,
  onDetail,
}: {
  items: Job[];
  onDetail: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [cancel, setCancel] = useState<Job | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [retryKeys] = useState(() => new Map<string, string>());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const nextExpiry = Math.min(
      ...items
        .map((job) => Date.parse(job.fileExpiresAt ?? ''))
        .filter((time) => time > Date.now()),
    );
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(nextExpiry - Date.now() + 10, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [items, now]);
  const mutation = useMutation({
    mutationFn: ({ job, action }: { job: Job; action: 'cancel' | 'retry' }) => {
      let key = retryKeys.get(job.id);
      if (action === 'retry' && !key) {
        key = crypto.randomUUID();
        retryKeys.set(job.id, key);
      }
      return mutateJob(
        `/downloads/${job.id}/${action}`,
        {},
        action === 'retry' ? key : undefined,
      );
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === 'cancel'
          ? 'Solicitação cancelada.'
          : 'Nova tentativa agendada.',
      );
      retryKeys.delete(variables.job.id);
      setCancel(null);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => cache.invalidateQueries({ queryKey: ['jobs'] }),
  });
  const actionButton = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    disabled = false,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
          onClick={action}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mídia</th>
              <th className="secondary-col">Formato / qualidade</th>
              <th>Status</th>
              <th className="secondary-col">Criado em</th>
              <th className="secondary-col">Tamanho</th>
              <th className="actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id}>
                <td>
                  <button
                    className="title-cell"
                    onClick={() => onDetail(job.id)}
                  >
                    <span className="file-icon">
                      <FileVideo size={18} />
                    </span>
                    <span>
                      <strong title={job.title}>
                        {job.title || 'Mídia sem título'}
                      </strong>
                      <small>{job.source}</small>
                    </span>
                  </button>
                </td>
                <td className="secondary-col">
                  <strong>{job.format.toUpperCase()}</strong>
                  <small>{qualityLabels[job.quality]}</small>
                </td>
                <td>
                  <JobStatus job={job} />
                </td>
                <td className="secondary-col">
                  <time dateTime={job.createdAt}>{date(job.createdAt)}</time>
                </td>
                <td className="secondary-col tabular">
                  {bytes(job.fileSizeBytes)}
                </td>
                <td>
                  <div className="row-actions">
                    {isActive(job) &&
                      actionButton(
                        `Cancelar ${job.title}`,
                        <Square size={16} />,
                        () => {
                          setReturnFocus(document.activeElement as HTMLElement);
                          setCancel(job);
                        },
                        mutation.isPending,
                      )}
                    {job.status === 'FAILED' &&
                      job.canRetry &&
                      actionButton(
                        `Repetir ${job.title}`,
                        <RotateCcw size={16} />,
                        () => mutation.mutate({ job, action: 'retry' }),
                        mutation.isPending,
                      )}
                    {job.status === 'COMPLETED' &&
                      job.fileExpiresAt &&
                      Date.parse(job.fileExpiresAt) > now && (
                        <a
                          className="icon-link"
                          aria-label={`Baixar ${job.title}`}
                          href={`/api/downloads/${job.id}/file`}
                          download
                        >
                          <Download size={17} />
                        </a>
                      )}
                    {actionButton(
                      `Detalhes de ${job.title}`,
                      <MoreHorizontal size={18} />,
                      () => onDetail(job.id),
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={!!cancel}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setCancel(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus?.focus();
          }}
        >
          <DialogTitle>Cancelar esta solicitação?</DialogTitle>
          <DialogDescription>
            O processamento de “{cancel?.title}” será encerrado. Para começar
            novamente, será necessário criar outra solicitação.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancel(null)}
              disabled={mutation.isPending}
            >
              Continuar processamento
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                cancel && mutation.mutate({ job: cancel, action: 'cancel' })
              }
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function JobDetails({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { generation } = useSession();
  const visible = useVisible();
  const returnFocus = useRef<HTMLElement | null>(null);
  const query = useQuery({
    queryKey: ['jobs', generation, 'detail', id],
    queryFn: ({ signal }) => detail(id!, signal),
    enabled: !!id,
    retry: false,
    refetchInterval: (q) =>
      pollInterval(!!q.state.data && isActive(q.state.data), visible),
  });
  const job = query.data;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!id || !job?.fileExpiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [id, job?.fileExpiresAt]);
  const remaining = job?.fileExpiresAt
    ? Date.parse(job.fileExpiresAt) - now
    : null;
  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="details-sheet"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <SheetTitle>Detalhes da solicitação</SheetTitle>
        <SheetDescription>
          Estado, tentativas e validade dos arquivos deste navegador.
        </SheetDescription>
        {query.isPending ? (
          <Loading />
        ) : (
          <>
            {query.error && (
              <ErrorBox
                error={query.error}
                stale={!!job}
                retry={() => void query.refetch()}
              />
            )}
            {job && (
              <>
                <h2 className="wrap-anywhere">{job.title}</h2>
                <JobStatus job={job} />
                <dl className="detail-grid">
                  <dt>Formato e qualidade</dt>
                  <dd>
                    {job.format.toUpperCase()} · {qualityLabels[job.quality]}
                  </dd>
                  <dt>Criado em</dt>
                  <dd>{date(job.createdAt)}</dd>
                  <dt>Concluído em</dt>
                  <dd>{date(job.completedAt)}</dd>
                  <dt>Tamanho</dt>
                  <dd>{bytes(job.fileSizeBytes)}</dd>
                  <dt>Arquivo disponível até</dt>
                  <dd>
                    {date(job.fileExpiresAt)}
                    {remaining !== null && (
                      <small className="block">
                        {remaining > 0
                          ? `Disponível por mais ${Math.ceil(remaining / 60000)} min`
                          : 'Arquivo expirado. O download não está mais disponível.'}
                      </small>
                    )}
                  </dd>
                  <dt>Histórico disponível até</dt>
                  <dd>{date(job.historyExpiresAt)}</dd>
                </dl>
                {job.error && (
                  <p role="alert" className="error-box">
                    {job.error.message}
                  </p>
                )}
                <h3>Tentativas</h3>
                {job.attempts.length ? (
                  job.attempts.map((a) => (
                    <article className="attempt" key={a.id}>
                      <strong>
                        Tentativa {a.sequence} · ciclo {a.cycle}
                      </strong>
                      <p>
                        {date(a.startedAt)} —{' '}
                        {a.finishedAt ? date(a.finishedAt) : 'Em andamento'}
                      </p>
                      <p>{a.error?.message ?? a.outcome ?? 'Processando'}</p>
                    </article>
                  ))
                ) : (
                  <p>Nenhuma tentativa iniciada.</p>
                )}
                <p className="help">
                  Arquivos expiram em 24 horas. O histórico permanece por até 30
                  dias, limitado à validade deste espaço.
                </p>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
