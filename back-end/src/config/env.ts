import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let envLoaded = false;

export function loadBackendEnv() {
  if (envLoaded) return;

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const localEnvPath = resolve(packageRoot, '.env.local');
  const defaultEnvPath = resolve(packageRoot, '.env');

  if (existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  if (existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath });
  }

  envLoaded = true;
}

export function getBackendEnv(...names: string[]) {
  loadBackendEnv();

  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }

  return undefined;
}
