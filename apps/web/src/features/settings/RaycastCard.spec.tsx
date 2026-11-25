// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useLocale } from '../../i18n/locale';
import { RaycastCard } from './RaycastCard';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../../../');

afterEach(() => {
  cleanup();
  useLocale.setState({ choice: 'es' });
});

function mount() {
  render(
    <MemoryRouter>
      <RaycastCard />
    </MemoryRouter>,
  );
}

describe('Raycast card', () => {
  it('CA-01: renders the download, the three steps and the token link', () => {
    useLocale.setState({ choice: 'es' });
    mount();
    const card = screen.getByRole('article', { name: 'Raycast (Mac)' });
    expect(card).toBeTruthy();
    expect(
      screen.getByText('Añade tareas desde cualquier app del Mac con Cmd+Shift+A'),
    ).toBeTruthy();
    expect(screen.getByText('Solo para Mac')).toBeTruthy();
    const download = screen.getByRole('link', { name: 'Descargar extensión' });
    expect(download.getAttribute('href')).toBe('/downloads/ttd-raycast.zip');
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(screen.getByText('npm install && npm run dev')).toBeTruthy();
    const token = screen.getByRole('link', { name: 'Tareas → Escribir' });
    expect(token.getAttribute('href')).toBe('/settings/tokens');
    expect(steps[2]?.textContent).toContain('Cmd+Shift+A');
    expect(steps[2]?.textContent).toContain('Nueva tarea TTD');
    expect(screen.getByRole('link', { name: 'Ver instrucciones' }).getAttribute('href')).toBe(
      '/downloads/ttd-raycast-README.html',
    );
  });

  it('CA-04: the same card is translated to English', () => {
    useLocale.setState({ choice: 'en' });
    mount();
    expect(screen.getByRole('article', { name: 'Raycast (Mac)' })).toBeTruthy();
    expect(screen.getByText('Add tasks from any Mac app with Cmd+Shift+A')).toBeTruthy();
    expect(screen.getByText('Mac only')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download extension' }).getAttribute('href')).toBe(
      '/downloads/ttd-raycast.zip',
    );
    expect(screen.getByRole('link', { name: 'Tasks → Write' }).getAttribute('href')).toBe(
      '/settings/tokens',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('raycast zip', () => {
  it('CA-02: packs the extension source without node_modules or secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttd-raycast-'));
    const zip = join(dir, 'ttd-raycast.zip');
    const readme = join(dir, 'readme.html');
    try {
      execFileSync(process.execPath, [join(repo, 'integrations/raycast/scripts/pack.mjs')], {
        env: { ...process.env, TTD_RAYCAST_ZIP: zip, TTD_RAYCAST_README: readme },
      });
      const listed = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { readFileSync } from 'node:fs';
           import { listZipNames } from ${JSON.stringify(join(repo, 'integrations/raycast/scripts/pack.mjs'))};
           process.stdout.write(JSON.stringify(listZipNames(readFileSync(${JSON.stringify(zip)}))));`,
        ],
        { encoding: 'utf8' },
      );
      const names = JSON.parse(listed) as string[];
      expect(names).toContain('ttd-raycast/package.json');
      expect(names).toContain('ttd-raycast/src/quick-add.tsx');
      expect(names).toContain('ttd-raycast/README.md');
      expect(names).toContain('ttd-raycast/assets/icon.png');
      expect(names.some((name) => name.includes('node_modules') || name.includes('.env'))).toBe(
        false,
      );
      const html = readFileSync(readme, 'utf8');
      expect(html).toContain('Cmd+Shift+A');
      expect(html).not.toContain('rfx_pat_');
      execFileSync(process.execPath, [
        '--experimental-strip-types',
        '--test',
        join(repo, 'integrations/raycast/test/create-task.test.ts'),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
