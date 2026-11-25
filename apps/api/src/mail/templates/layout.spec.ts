import { describe, expect, it } from 'vitest';
import { emailButton } from './html.js';
import { renderEmailLayout, renderPlainNotice } from './layout.js';

const origin = 'https://todo.reflexionia.com';

describe('email layout', () => {
  it('frames a notice with the app icon, inline CSS and a full plain-text copy', () => {
    const laid = renderEmailLayout({
      locale: 'es',
      documentTitle: 'Aviso',
      preheader: 'Texto de previsualización',
      bodyHtml: '<p class="ink">Cuerpo del aviso</p>',
      bodyText: 'Cuerpo del aviso',
      reason: 'Recibes este correo por tus avisos de TickTackDone.',
      origin,
    });
    expect(laid.html).toContain(
      `<img src="${origin}/apple-touch-icon.png" width="32" height="32" alt="" border="0" style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;">`,
    );
    expect(laid.html).toContain('bgcolor="#4772FA"');
    expect(laid.html).toContain('width:40px;height:40px;background-color:#4772FA;');
    expect(laid.html).toContain('>TickTackDone</td>');
    expect(laid.html).not.toContain('>ttd<');
    expect(laid.html).toContain('role="presentation"');
    expect(laid.html).toContain('prefers-color-scheme: dark');
    expect(laid.html).toContain('[data-ogsc]');
    expect(laid.html).toContain(`${origin}/settings/notifications`);
    expect(laid.html).toContain('Gestionar notificaciones');
    expect(laid.html).toContain('Abrir TickTackDone');
    expect(laid.html).not.toContain('var(--');
    expect(laid.text).toContain('Cuerpo del aviso');
    expect(laid.text).toContain(`Gestionar notificaciones: ${origin}/settings/notifications`);
    expect(laid.text).toContain(`Abrir TickTackDone: ${origin}/`);
    expect(laid.text).toContain('TickTackDone · todo.reflexionia.com');
    expect(laid.html).toMatchSnapshot();
  });

  it('uses a #3e60cd VML button for Outlook and a plain fallback', () => {
    const button = emailButton(`${origin}/today`, 'Abrir Hoy');
    expect(button).toContain('bgcolor="#3e60cd"');
    expect(button).toContain('fillcolor="#3e60cd"');
    expect(button).toContain('v:roundrect');
    expect(button).toContain('<!--[if !mso]><!-- -->');
    expect(button).not.toContain('#4772FA');
  });

  it('wraps a title and text when a notice has no view of its own', () => {
    const mail = renderPlainNotice({
      locale: 'en',
      title: 'Notice',
      body: 'Line one\n\nLine <two>',
      origin,
    });
    expect(mail.subject).toBe('Notice');
    expect(mail.html).toContain('&lt;two&gt;');
    expect(mail.html).not.toContain('<two>');
    expect(mail.text).toContain('Line one');
    expect(mail.text).toContain('Manage notifications');
    expect(mail.html).toContain('apple-touch-icon.png');
  });
});
