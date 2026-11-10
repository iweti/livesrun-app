import { it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
it('does not render raw text as a native View child', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const files = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : entry.name.endsWith('.tsx')
          ? [join(directory, entry.name)]
          : [],
    );
  const invalid: string[] = [];
  for (const path of files(root)) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      const literal = ts.isJsxText(node)
        ? node.text.trim()
        : ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)
          ? node.expression.text
          : null;
      if (literal) {
        let parent = node.parent;
        while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
        if (
          parent &&
          ts.isJsxElement(parent) &&
          parent.openingElement.tagName.getText(source) !== 'Text'
        )
          invalid.push(
            `${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}: ${JSON.stringify(literal)}`,
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(invalid).toEqual([]);
});
