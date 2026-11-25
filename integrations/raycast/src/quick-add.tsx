import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Form,
  getPreferenceValues,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from '@raycast/api';
import { useRef, useState } from 'react';
import { createTask, type CreateTaskResult } from './create-task';

interface Preferences {
  token: string;
  baseUrl: string;
}

const PLACEHOLDER = 'Llamar a Juan mañana 10:00 #casa ^lista !alta';
const EMPTY_TASK = 'Escribe la tarea.';

export default function Command() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);

  async function handleSubmit(values: Form.Values) {
    const raw = readField(values.task) || text;
    if (raw.trim() === '') {
      setError(EMPTY_TASK);
      return;
    }
    if (pending.current) {
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      const preferences = getPreferenceValues<Preferences>();
      const result = await createTask({
        baseUrl: preferences.baseUrl,
        token: preferences.token,
        rawText: raw,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.ok) {
        await showHUD('✅ Añadida a TTD');
        await closeMainWindow();
        await popToRoot();
        return;
      }
      if (result.kind === 'validation') {
        setError(EMPTY_TASK);
        return;
      }
      await Clipboard.copy(raw);
      await showFailure(result);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={submitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Crear" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="task"
        title="Nueva tarea TTD"
        placeholder={PLACEHOLDER}
        autoFocus
        storeValue={false}
        value={text}
        error={error}
        onChange={(value) => {
          setText(value);
          if (error !== undefined) {
            setError(undefined);
          }
        }}
      />
    </Form>
  );
}

function readField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function showFailure(
  result: Exclude<CreateTaskResult, { ok: true } | { kind: 'validation' }>,
) {
  if (result.kind === 'offline') {
    await showToast({ style: Toast.Style.Failure, title: 'Sin conexión con TTD' });
    return;
  }
  if (result.kind === 'config') {
    await showToast({ style: Toast.Style.Failure, title: result.message });
    return;
  }
  const title =
    result.code === String(result.status) ? result.code : `${result.status} ${result.code}`;
  await showToast({
    style: Toast.Style.Failure,
    title,
    ...(result.message === '' ? {} : { message: result.message }),
  });
}
