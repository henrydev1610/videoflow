/** Parse only our numeric marker; never persist downloader URLs or diagnostics. */
export function downloadProgress(
  report: (percent: number, indeterminate: boolean) => void,
  now = Date.now,
) {
  let buffer = '';
  let last = -Infinity;
  let maximum = 0;
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop()!.slice(-1024);
    for (const line of lines) {
      const match = /^VF_PROGRESS:(\d+)\/(\d+|NA)$/.exec(line);
      if (!match || now() - last < 1000) continue;
      last = now();
      const total = Number(match[2]);
      const known = Number.isFinite(total) && total > 0;
      if (known)
        maximum = Math.max(
          maximum,
          Math.min(69, Math.floor((Number(match[1]) / total) * 69)),
        );
      report(maximum, !known);
    }
  };
}
