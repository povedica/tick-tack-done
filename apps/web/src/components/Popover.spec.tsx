import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Popover } from './Popover';
it('RF-1101: optional sheet slots preserve the desktop DOM', () => {
  const props = { open: true, label: 'Calendar', onClose: () => {} };
  const base = renderToStaticMarkup(
    <Popover {...props}>
      <p>Body</p>
    </Popover>,
  );
  expect(
    renderToStaticMarkup(
      <Popover {...props} sheetHeader={<h2>Header</h2>}>
        <p>Body</p>
      </Popover>,
    ),
  ).toBe(base);
  expect(base).toContain('<p>Body</p>');
});
it('RF-1101: closed popovers render no sheet slots', () =>
  expect(
    renderToStaticMarkup(
      <Popover open={false} label="Calendar" onClose={() => {}}>
        Body
      </Popover>,
    ),
  ).toBe(''));
