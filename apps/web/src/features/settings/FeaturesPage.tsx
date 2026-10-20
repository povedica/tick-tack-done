import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { moveNavigationModule, type NavigationModule } from '@reflexionia/domain';
import { api } from '../../api';
import { MODULES } from '../../shell/modules';
import { useStatisticsText } from '../statistics/text';
import { useMessages } from '../../i18n';
import { featureFlags, useFeatures, type FeatureFlags } from './feature-flags';

const KEYS = [
  'countdowns',
  'focus',
  'matrix',
  'when_deadline',
  'day_load',
  'day_closing',
  'day_replan',
] as const;

export function FeaturesPage() {
  const messages = useMessages();
  const { t } = useStatisticsText();
  const achievements = useQuery({ queryKey: ['achievements'], queryFn: () => api.achievements() });
  const queryClient = useQueryClient();
  const flags = useFeatures((state) => state.flags);
  const setFlags = useFeatures((state) => state.setFlags);
  const [dragged, setDragged] = useState<NavigationModule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const labels: Record<(typeof KEYS)[number], string> = {
    countdowns: messages.featureCountdowns,
    focus: messages.featureFocus,
    matrix: messages.featureMatrix,
    when_deadline: messages.flagWhen,
    day_load: messages.flagLoad,
    day_closing: messages.flagClosing,
    day_replan: messages.flagReplan,
  };
  const hints: Record<(typeof KEYS)[number], string> = {
    countdowns: messages.featureCountdownsHint,
    focus: messages.featureFocusHint,
    matrix: messages.featureMatrixHint,
    when_deadline: messages.flagWhenHelp,
    day_load: messages.flagLoadHelp,
    day_closing: messages.flagClosingHelp,
    day_replan: messages.flagReplanHelp,
  };

  function toggle(key: (typeof KEYS)[number]): void {
    const current = flags;
    const next: FeatureFlags = { ...current, [key]: !current[key] };
    persist(next);
  }

  function persist(next: FeatureFlags): void {
    if (saving || !me.isSuccess) return;
    const previous = flags;
    setSaving(true);
    setError(null);
    setFlags(next);
    void api
      .updateMe({ features: next })
      .then((saved) => {
        setFlags(featureFlags(saved.features));
        queryClient.setQueryData(['me'], saved);
      })
      .catch(() => {
        setFlags(previous);
        setError(messages.saveFailed);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function move(source: NavigationModule, target: NavigationModule): void {
    persist({
      ...flags,
      navigation_order: moveNavigationModule(flags.navigation_order, source, target),
    });
  }

  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsFeatures}</h1>
          <p className="lede">{messages.featuresHint}</p>
        </div>
      </header>
      <ul className="feature-list">
        {KEYS.map((key) => (
          <li key={key}>
            <label>
              <span>
                <strong>{labels[key]}</strong>
                <small>{hints[key]}</small>
              </span>
              <input
                disabled={saving || !me.isSuccess}
                type="checkbox"
                role="switch"
                checked={flags[key]}
                onChange={() => {
                  toggle(key);
                }}
              />
            </label>
          </li>
        ))}
        <li>
          <label>
            <span>
              <strong>{t('enable')}</strong>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={achievements.data?.enabled === true}
              onChange={(event) => {
                void api.setAchievements(event.target.checked).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['achievements'] });
                  void queryClient.invalidateQueries({ queryKey: ['stats'] });
                });
              }}
            />
          </label>
        </li>
      </ul>
      <h2>{messages.navigationOrderTitle}</h2>
      <p>{messages.navigationOrderHint}</p>
      {error !== null ? <p role="alert">{error}</p> : null}
      <ol className="module-order" aria-label={messages.navigationOrderTitle} aria-busy={saving}>
        {flags.navigation_order.map((key, index, order) => {
          const module = MODULES[key];
          const Icon = module.icon;
          return (
            <li
              key={key}
              draggable={!saving && me.isSuccess}
              data-module={key}
              className={dragged === key ? 'is-dragging' : undefined}
              onDragStart={(event) => {
                setDragged(key);
                event.dataTransfer.setData('text/navigation-module', key);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragged(null);
              }}
              onDragOver={(event) => {
                if (dragged !== null) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== null && dragged !== key) move(dragged, key);
                setDragged(null);
              }}
            >
              <GripVertical size={18} aria-hidden="true" />
              <Icon size={18} aria-hidden="true" />
              <span>{messages[module.label]}</span>
              <button
                type="button"
                disabled={saving || !me.isSuccess || index === 0}
                aria-label={`${messages.moveUp}: ${messages[module.label]}`}
                onClick={() => {
                  const target = order[index - 1];
                  if (target !== undefined) move(key, target);
                }}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={saving || !me.isSuccess || index === order.length - 1}
                aria-label={`${messages.moveDown}: ${messages[module.label]}`}
                onClick={() => {
                  const next = [...order];
                  const target = next[index + 1];
                  if (target !== undefined) {
                    next[index] = target;
                    next[index + 1] = key;
                    persist({ ...flags, navigation_order: next });
                  }
                }}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
