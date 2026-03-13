import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DistillJobStore } from './distill-job-store';

describe('DistillJobStore', () => {
  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-distill-jobs-'));
  }

  afterEach(async () => {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-distill-jobs-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('creates a pending job and transitions it to running', async () => {
    const root = await createTempRoot();
    const store = new DistillJobStore(root);
    await store.init();

    const created = await store.createPending({
      sourceCapsuleIds: ['cap-1', 'cap-2'],
      fingerprint: 'caps:cap-1,cap-2'
    });

    expect(created.jobId).toMatch(/^distill_/);
    expect(created.status).toBe('pending');

    const running = await store.markRunning(created.jobId);
    expect(running.status).toBe('running');
    expect(running.startedAt).toBeTruthy();
  });

  test('deduplicates a pending job by fingerprint', async () => {
    const root = await createTempRoot();
    const store = new DistillJobStore(root);
    await store.init();

    const first = await store.createPending({
      sourceCapsuleIds: ['cap-1', 'cap-2'],
      fingerprint: 'caps:cap-1,cap-2'
    });

    const second = await store.createPending({
      sourceCapsuleIds: ['cap-2', 'cap-1'],
      fingerprint: 'caps:cap-1,cap-2'
    });

    expect(second.jobId).toBe(first.jobId);

    const allJobs = await store.getAll();
    expect(allJobs).toHaveLength(1);
  });
});
