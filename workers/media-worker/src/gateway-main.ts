import { gateway, publicPolicy } from './gateway.js';
const server = gateway(
  publicPolicy(
    (process.env.MEDIA_HOST_ALLOWLIST ?? '').split(',').filter(Boolean),
  ),
);
server.listen(3128, '0.0.0.0');
process.on('SIGTERM', () => server.close());
