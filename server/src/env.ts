import path from 'path';
import dotenv from 'dotenv';

// Imported first by index.ts so every module sees the variables at load time.
// Looks for .env in the server directory, then the repository root.
dotenv.config({ quiet: true } as any);
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env'), quiet: true } as any);
