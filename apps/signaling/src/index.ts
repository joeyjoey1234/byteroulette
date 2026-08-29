import { parseSignalingEnv } from './env.js';
import { buildServer } from './server.js';
const env = parseSignalingEnv(process.env);
const app = await buildServer(env);
const shutdown = async () => {
  await app.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
await app.listen({ host: env.SIGNAL_HOST, port: env.SIGNAL_PORT });
