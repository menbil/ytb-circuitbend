import { app } from './app.js';

const PORT = process.env.PORT || 3001;

process.on('uncaughtException', (err) => {
  console.error('[Backend Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Backend Unhandled Rejection]:', reason);
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  CIRCUIT BENDING RELAY BACKEND ONLINE         `);
  console.log(`  Port: ${PORT}                                `);
  console.log(`  Endpoints:                                   `);
  console.log(`    POST /api/playlist                         `);
  console.log(`    GET  /api/stream?id=...                    `);
  console.log(`===============================================`);
});
