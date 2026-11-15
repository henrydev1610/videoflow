import { it, expect } from 'vitest';
import { assertResources } from '../workers/media-worker/src/pipeline.js';
it('recusa falta de espaço, excesso acumulado, número de arquivos e prazo', () => {
  expect(() => assertResources(0, 1, 1024 ** 3, 10, 9)).not.toThrow();
  expect(() => assertResources(0, 1, 1024 ** 3 - 1, 10, 9)).toThrow(
    'DISK_LIMIT',
  );
  expect(() => assertResources(3 * 1024 ** 3 + 1, 1, 1024 ** 3, 10, 9)).toThrow(
    'INPUT_LIMIT',
  );
  expect(() => assertResources(0, 10001, 1024 ** 3, 10, 9)).toThrow(
    'INPUT_LIMIT',
  );
  expect(() => assertResources(0, 1, 1024 ** 3, 10, 10)).toThrow(
    'PROCESS_TIMEOUT',
  );
});
