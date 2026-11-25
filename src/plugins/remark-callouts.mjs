import { visit } from 'unist-util-visit';

const KNOWN = new Set([
  'note', 'info', 'tip', 'hint', 'important', 'success', 'check', 'done',
  'question', 'help', 'faq', 'warning', 'caution', 'attention', 'failure',
  'fail', 'missing', 'error', 'bug', 'danger', 'quote', 'cite', 'abstract',
  'summary', 'tldr', 'example', 'examples', 'todo',
]);

const ICONS = {
  note: '✎', info: 'ℹ', tip: '✦', hint: '✦', important: '❗',
  success: '✓', check: '✓', done: '✓', question: '?', help: '?', faq: '?',
  warning: '⚠', caution: '⚠', attention: '⚠', failure: '✕', fail: '✕',
  missing: '✕', error: '✕', bug: '🐞', danger: '☠', quote: '❝', cite: '❝',
  abstract: '≡', summary: '≡', tldr: '≡', example: '◈', examples: '◈', todo: '☐',
};

/** Obsidian-каллауты `> [!note] Заголовок` -> стилизованный div. */
export default function remarkCallouts() {
  return (tree) => {
    visit(tree, 'blockquote', (node, index, parent) => {
      if (!parent || index === null) return;
      const first = node.children?.[0];
      if (!first || first.type !== 'paragraph') return;
      const firstText = first.children?.[0];
      if (!firstText || firstText.type !== 'text') return;

      const match = /^\s*\[!([A-Za-z]+)\]([+-])?[ \t]*([^\n]*)/.exec(firstText.value ?? '');
      if (!match) return;

      const type = match[1].toLowerCase();
      if (!KNOWN.has(type)) return;

      const title = match[3] || type.charAt(0).toUpperCase() + type.slice(1);
      const icon = ICONS[type] || '✦';
      const fold = match[2] === '-';

      firstText.value = firstText.value.slice(match[0].length);
      if (!firstText.value.trim() && first.children.length === 1) {
        node.children.shift();
      }

      const titleNode = {
        type: 'paragraph',
        data: {
          hName: 'div',
          hProperties: {
            className: ['callout-title'],
            ...(fold ? { 'data-fold': '' } : {}),
          },
        },
        children: [
          { type: 'text', value: icon + '\u00a0\u00a0' },
          { type: 'strong', children: [{ type: 'text', value: title }] },
        ],
      };

      node.children.unshift(titleNode);
      node.data = {
        ...(node.data || {}),
        hName: 'div',
        hProperties: { className: ['callout', `callout-${type}`] },
      };
    });
  };
}
