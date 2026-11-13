import { main } from '../apps/api/src/perf/seed-perf.js';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'seed-perf failed';
  process.stderr.write(`${message.replace(/postgresql:\/\/\S+/g, 'postgresql://***')}\n`);
  process.exit(1);
});
