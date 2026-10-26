// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { messagesFor } from '../../i18n';
import { DetailMenu } from './DetailMenu';
vi.mock('../../components/Popover', () => ({
  Popover: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
afterEach(cleanup);
function mount(disabled = false) {
  const upload = vi.fn();
  const close = vi.fn();
  const action = vi.fn();
  render(
    <DetailMenu
      open
      pinned={false}
      messages={messagesFor('es')}
      onClose={close}
      onUpload={upload}
      uploadDisabled={disabled}
      uploadDisabledReason="Google Drive debe estar activo"
      onAddSubtask={action}
      onLinkParent={action}
      onPin={action}
      onDiscard={action}
      onTags={action}
      onFocus={action}
      onActivity={action}
      onTemplate={action}
      onDuplicate={action}
      onCopy={action}
      onConvert={action}
      onExport={action}
      onPrint={action}
      onWontDo={action}
      onDelete={action}
    />,
  );
  return { upload, close };
}
it('TTD-AUD-127 RF-203/2005: disabled attachment remains visible with an accessible reason and cannot run', () => {
  const { upload, close } = mount(true);
  const item = screen.getByRole<HTMLButtonElement>('menuitem', { name: /Adjuntar/ });
  expect(item.disabled).toBe(true);
  expect(item.title).toBe('Google Drive debe estar activo');
  expect(item.getAttribute('aria-describedby')).toBe('detail-menu-upload-reason');
  expect(screen.getByText('Google Drive debe estar activo')).toBeTruthy();
  fireEvent.click(item);
  expect(upload).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it('TTD-AUD-127 RF-203: attachment stays enabled by default for existing callers', () => {
  const { upload, close } = mount();
  const item = screen.getByRole<HTMLButtonElement>('menuitem', { name: /Adjuntar/ });
  expect(item.disabled).toBe(false);
  fireEvent.click(item);
  expect(upload).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
