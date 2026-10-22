import { expect, it } from 'vitest';
import { messagesFor } from './index';
import { pluralMessage } from './plural';
for (const locale of ['es', 'en'])
  it(`TTD-AUD-96.2: plural rules for 0, 1 and 2 in ${locale}`, () => {
    const messages = messagesFor(locale);
    const texts = [0, 1, 2].map((count) =>
      pluralMessage(locale, count, {
        one: messages.todayUnestimated_one,
        other: messages.todayUnestimated_other,
      }),
    );
    expect(texts).toEqual(
      locale === 'es'
        ? ['0 tareas sin duración', '1 tarea sin duración', '2 tareas sin duración']
        : ['0 tasks without duration', '1 task without duration', '2 tasks without duration'],
    );
  });
