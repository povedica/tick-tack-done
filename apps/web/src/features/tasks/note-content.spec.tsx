/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { normalizeStoredNewlines } from '@reflexionia/domain';
import Markdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

describe('BKL-054 note render', () => {
  it('shows real breaks and a list instead of literal \\n', () => {
    const text = normalizeStoredNewlines('Quedar por la tarde.\\n\\n- Comprar la tarta');
    render(<Markdown>{text}</Markdown>);
    expect(screen.getByText('Quedar por la tarde.')).toBeTruthy();
    expect(screen.getByRole('listitem').textContent).toBe('Comprar la tarta');
    expect(document.body.textContent ?? '').not.toContain('\\n');
  });

  it('keeps a literal backslash-n when the note already has real breaks', () => {
    const text = normalizeStoredNewlines('Primera línea\nLiteral: \\n');
    render(<Markdown>{text}</Markdown>);
    expect(document.body.textContent ?? '').toContain('Literal: \\n');
  });
});
