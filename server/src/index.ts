import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM_CONFIG } from '@rcoi/shared';
import { createRcoiServer } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from server/src (tsx) and server/dist (built): both are two levels below the repo root.
const staticDir = path.resolve(here, '../../client/dist');
// Port: --port <n> (used by `npm run dev`), else $PORT (hosting platforms), else the default.
const argPort = process.argv.indexOf('--port');
const port = Number(argPort > 0 ? process.argv[argPort + 1] : (process.env.PORT ?? ROOM_CONFIG.defaultPort));

const server = createRcoiServer({ staticDir });
const actual = await server.listen(port, process.env.HOST ?? '0.0.0.0');

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i!.address}:${actual}`);

console.log(`RCOI server listening on port ${actual}`);
console.log(`  This machine:  http://localhost:${actual}`);
for (const url of lan) console.log(`  Local network: ${url}`);

const shutdown = () => {
  server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
