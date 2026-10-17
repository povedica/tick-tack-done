import { useEffect, useRef, useState } from 'react';
import { appendTranscript } from './draft';

interface SpeechAlternative {
  readonly transcript: string;
}

interface SpeechResultEvent {
  readonly results: ArrayLike<ArrayLike<SpeechAlternative>>;
}

interface SpeechSession {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechCtor = new () => SpeechSession;

function speechConstructor(): SpeechCtor | null {
  const host = globalThis as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return speechConstructor() !== null;
}

/** RF-104. Dictation appends text; the same parser highlights it. */
export function useSpeech(
  language: 'es' | 'en',
  onTranscript: (next: string) => void,
): { supported: boolean; listening: boolean; toggle: (current: string) => void } {
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<SpeechSession | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const supported = speechSupported();

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
    };
  }, []);

  function toggle(current: string): void {
    const active = sessionRef.current;
    if (active !== null) {
      active.stop();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    const Ctor = speechConstructor();
    if (Ctor === null) {
      return;
    }
    const next = new Ctor();
    next.lang = language === 'en' ? 'en-US' : 'es-ES';
    next.interimResults = false;
    next.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript ?? '';
      onTranscriptRef.current(appendTranscript(current, spoken));
    };
    next.onerror = () => {
      sessionRef.current = null;
      setListening(false);
    };
    next.onend = () => {
      sessionRef.current = null;
      setListening(false);
    };
    next.start();
    sessionRef.current = next;
    setListening(true);
  }

  return { supported, listening, toggle };
}
