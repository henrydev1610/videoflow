// Dependency compatibility probe, not an application or a UI implementation.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { compile } from 'tailwindcss';
import { QueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MemoryRouter } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { chromium } from '@playwright/test';
assert.equal(
  renderToString(React.createElement('span', null, 'dependency check')),
  '<span>dependency check</span>',
);
assert.ok(new QueryClient());
assert.ok(zodResolver(z.object({ value: z.string() })));
assert.equal(typeof MemoryRouter, 'function');
assert.equal(typeof useForm, 'function');
assert.ok(chromium.executablePath());
assert.ok(
  (await compile('@tailwind utilities;'))
    .build(['flex'])
    .includes('display: flex'),
);
await build({
  configFile: false,
  plugins: [react()],
  build: {
    write: false,
    lib: {
      entry: fileURLToPath(new URL('./dependency-entry.ts', import.meta.url)),
      formats: ['es'],
    },
  },
});
console.log(
  'Dependency imports, React render, Tailwind compile and Vite build passed; browser execution not tested here.',
);
