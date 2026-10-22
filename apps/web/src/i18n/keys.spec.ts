import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

describe('i18n', () => {
  it('P2-16: Spanish and English expose the same keys', () => {
    const english = Object.keys(en).sort();
    const spanish = Object.keys(es).sort();
    expect(spanish).toEqual(english);
  });

  it('TTD-AUD-27: Ticky JSX keeps visible text in the locale dictionaries', () => {
    const literals: string[] = [];
    for (const name of ['TickyPage', 'TickySettings', 'TickyRoutines', 'ProposalReview']) {
      const source = readFileSync(
        new URL(`../features/ticky/${name}.tsx`, import.meta.url),
        'utf8',
      );
      const tree = ts.createSourceFile(
        `${name}.tsx`,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (ts.isJsxText(node) && /\p{L}/u.test(node.text))
          literals.push(`${name}: ${node.text.trim()}`);
        if (
          ts.isJsxAttribute(node) &&
          ['aria-label', 'title', 'placeholder', 'alt'].includes(node.name.getText(tree)) &&
          node.initializer !== undefined &&
          ts.isStringLiteral(node.initializer)
        )
          literals.push(`${name}: ${node.initializer.text}`);
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    expect(literals).toEqual([]);
  });
});
