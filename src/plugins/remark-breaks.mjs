import { visit } from 'unist-util-visit';

/** Obsidian shows a single newline as a new line. Keep that in rendered notes. */
export default function remarkBreaks() {
  return (tree) => {
    visit(tree, 'paragraph', (node) => {
      const children = [];
      for (const child of node.children || []) {
        if (child.type !== 'text' || !child.value.includes('\n')) {
          children.push(child);
          continue;
        }
        child.value.split('\n').forEach((piece, index) => {
          if (index > 0) children.push({ type: 'break' });
          if (piece) children.push({ ...child, value: piece });
        });
      }
      node.children = children;
    });
  };
}
