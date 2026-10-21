import { $, $$, setVar, calcTextWidth } from './util.js';

const snippetNode = $('#snippet');

const setupLines = (node, config) => {
  $$(':scope > br', node).forEach((row) => (row.outerHTML = '<div>&nbsp;</div>'));

  const rows = $$(':scope > div', node);
  setVar('line-number-width', calcTextWidth(rows.length + config.startLine));

  rows.forEach((row, idx) => {
    const newRow = document.createElement('div');
    newRow.classList.add('line');
    row.replaceWith(newRow);

    if (config.showLineNumbers) {
      const lineNum = document.createElement('div');
      lineNum.classList.add('line-number');
      lineNum.textContent = idx + 1 + config.startLine;
      newRow.appendChild(lineNum);
    }

    row.appendChild(document.createTextNode(' '));

    const lineCodeDiv = document.createElement('div');
    lineCodeDiv.classList.add('line-code');
    const lineCode = document.createElement('span');
    lineCode.innerHTML = row.innerHTML;
    lineCodeDiv.appendChild(lineCode);

    newRow.appendChild(lineCodeDiv);
  });
};

const stripInitialIndent = (node) => {
  const regIndent = /^\s+/u;
  const initialSpans = $$(':scope > div > span:first-child', node);
  if (initialSpans.some((span) => !regIndent.test(span.textContent))) return;
  const minIndent = Math.min(
    ...initialSpans.map((span) => span.textContent.match(regIndent)[0].length)
  );
  initialSpans.forEach((span) => (span.textContent = span.textContent.slice(minIndent)));
};

export const readClipboardHtml = (clip) => {
  const html = clip.getData('text/html');
  if (html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    // Only code structure and styles are needed, never active pasted content.
    parsed.body.querySelectorAll('*').forEach((node) => {
      if (!['DIV', 'SPAN', 'BR'].includes(node.tagName)) {
        node.remove();
      } else {
        Array.from(node.attributes).forEach((attribute) => {
          if (attribute.name !== 'style') node.removeAttribute(attribute.name);
        });
      }
    });
    return parsed.body.innerHTML;
  }
  const plain = clip.getData('text/plain');
  if (!plain) return '';
  const text = plain
    .split('\n')
    .map((line) => {
      const node = document.createElement('div');
      node.textContent = line || '\u00a0';
      return node.outerHTML;
    })
    .join('');
  return `<div>${text}</div>`;
};

export const renderCode = (config, html) => {
  snippetNode.innerHTML = html;
  const code = $('div', snippetNode);
  if (!code) throw new Error('The clipboard does not contain supported code HTML.');
  snippetNode.style.fontSize = code.style.fontSize;
  snippetNode.style.lineHeight = code.style.lineHeight;
  snippetNode.innerHTML = code.innerHTML;
  stripInitialIndent(snippetNode);
  setupLines(snippetNode, config);
};
