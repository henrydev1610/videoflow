import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('/tmp/fixture', { recursive: true });
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=854x480:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=44100',
  '-t',
  '4',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-movflags',
  '+faststart',
  '-y',
  '/tmp/fixture/video.mp4',
]);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  '/tmp/fixture/video.mp4',
  '-an',
  '-c:v',
  'copy',
  '-y',
  '/tmp/fixture/silent.mp4',
]);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  '/tmp/fixture/video.mp4',
  '-vn',
  '-c:a',
  'libmp3lame',
  '-y',
  '/tmp/fixture/audio.mp3',
]);
const counts = new Map<string, number>();
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  '/tmp/fixture/audio.mp3',
  '-c:a',
  'libmp3lame',
  '-b:a',
  '64k',
  '-y',
  '/tmp/fixture/low-audio.mp3',
]);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-stream_loop',
  '14',
  '-i',
  '/tmp/fixture/video.mp4',
  '-c',
  'copy',
  '-movflags',
  '+faststart',
  '-y',
  '/tmp/fixture/long.mp4',
]);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  '/tmp/fixture/video.mp4',
  '-c',
  'copy',
  '-hls_time',
  '1',
  '-hls_list_size',
  '0',
  '-hls_segment_filename',
  '/tmp/fixture/segment%d.ts',
  '-y',
  '/tmp/fixture/stream.m3u8',
]);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=c=blue:s=64x64',
  '-frames:v',
  '1',
  '-threads',
  '1',
  '-y',
  '/tmp/fixture/image.png',
]);
createServer(async (req, res) => {
  if (req.url === '/invalid.mp4') {
    res.writeHead(200, { 'content-type': 'video/mp4' });
    res.end('not a video');
    return;
  }
  if (/^\/(stream\.m3u8|segment\d+\.ts)$/.test(req.url ?? '')) {
    res.writeHead(200, {
      'content-type': req.url!.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t',
    });
    createReadStream('/tmp/fixture' + req.url).pipe(res);
    return;
  }
  if (req.url === '/chunked.mp4') {
    res.writeHead(200, { 'content-type': 'video/mp4' });
    if (req.method === 'HEAD') res.end();
    else
      createReadStream('/tmp/fixture/video.mp4', { highWaterMark: 4096 }).pipe(
        res,
      );
    return;
  }
  if (req.url === '/drip.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<html>');
    const timer = setInterval(() => res.write(' '), 500);
    res.on('close', () => clearInterval(timer));
    return;
  }
  if (req.url === '/protected') {
    res.writeHead(401);
    res.end();
    return;
  }
  if (req.url === '/page') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<html><head><title>Synthetic</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","name":"Synthetic","description":"Authorized fixture","uploadDate":"2026-11-15","contentUrl":"http://fixture/video.mp4","thumbnailUrl":"http://fixture/image.png","duration":"PT4S"}</script></head><body><video poster="http://fixture/image.png" src="http://fixture/video.mp4"></video></body></html>`,
    );
    return;
  }
  if (req.url === '/image.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    createReadStream('/tmp/fixture/image.png').pipe(res);
    return;
  }
  if (req.url === '/evil.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end(
      '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttp://169.254.169.254/latest/meta-data/segment.ts\n#EXT-X-ENDLIST\n',
    );
    return;
  }
  if (/^\/recover\/[a-f0-9-]+\.mp4$/.test(req.url ?? '')) {
    const key = req.url!;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count === 1) {
      const timer = setTimeout(() => {
        res.writeHead(503);
        res.end();
      }, 60000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    req.url = '/video.mp4';
  }
  if (/^\/(switch|flaky)\/[a-f0-9-]+\.mp4$/.test(req.url ?? '')) {
    const key = req.url!;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count <= (key.startsWith('/flaky/') ? 2 : 1)) {
      res.writeHead(key.startsWith('/flaky/') ? 503 : 404);
      res.end();
      return;
    }
    req.url = '/video.mp4';
  }
  if (req.url === '/redirect') {
    res.writeHead(302, {
      location: 'http://169.254.169.254/latest/meta-data/',
    });
    res.end();
    return;
  }
  if (req.url === '/slow.mp4') {
    const timer = setTimeout(() => {
      res.writeHead(503);
      res.end();
    }, 60000);
    res.on('close', () => clearTimeout(timer));
    return;
  }
  if (
    ![
      '/video.mp4',
      '/silent.mp4',
      '/audio.mp3',
      '/long.mp4',
      '/low-audio.mp3',
    ].includes(req.url ?? '')
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = '/tmp/fixture' + req.url;
  const size = (await stat(file)).size;
  res.writeHead(200, {
    'content-type': file.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4',
    'content-length': size,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(80, '0.0.0.0');
