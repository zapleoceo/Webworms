import ThinkWorker from './BotThinkWorker?worker';
import ThinkWorker2 from '../../ai2/worker/AI2ThinkWorker?worker';

export type PlanWorkerMessage = {
  kind?: string;
  jobId?: string;
};

export function createPlanWorker(mode: string): Worker {
  return (mode === 'aivai2') ? new ThinkWorker2() : new ThinkWorker();
}

export function attachPlanWorkerHandlers(
  worker: Worker,
  params: {
    getJobId: () => string | null;
    onProgress: (msg: any) => void;
    onResult: (msg: any) => void;
    onError?: (message: string) => void;
  }
): void {
  worker.onerror = (evt: any) => {
    try {
      const msg = typeof evt?.message === 'string' ? evt.message : 'worker_error';
      params.onError?.(msg);
    } catch {}
  };
  worker.onmessage = (evt: MessageEvent<any>) => {
    const msg = evt.data as PlanWorkerMessage;
    if (!msg) return;
    const jobId = params.getJobId();
    if (msg.kind === 'planProgress') {
      if (!jobId || msg.jobId !== jobId) return;
      params.onProgress(msg);
      return;
    }
    if (msg.kind !== 'planResult') return;
    if (!jobId || msg.jobId !== jobId) return;
    params.onResult(msg);
  };
}

