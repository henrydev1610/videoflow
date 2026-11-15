import { lookup } from 'node:dns/promises';
import {
  gateway,
  publicPolicy,
} from '../../workers/media-worker/src/gateway.js';
const ordinary = publicPolicy();
gateway(async (input) => {
  const url = new URL(input);
  if (
    url.hostname === 'fixture' &&
    url.protocol === 'http:' &&
    (!url.port || url.port === '80') &&
    !url.username &&
    !url.password
  ) {
    const address = await lookup('fixture');
    return { host: address.address, port: 80, hostname: 'fixture' };
  }
  return ordinary(input);
}).listen(3128, '0.0.0.0');
