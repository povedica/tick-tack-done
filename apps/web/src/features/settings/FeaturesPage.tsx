import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { featureFlags, useFeatures, type FeatureFlags } from './feature-flags';

const KEYS = ['countdowns', 'focus', 'matrix'] as const;

export function FeaturesPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const flags = useFeatures((state) => state.flags);
  const setFlags = useFeatures((state) => state.setFlags);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const labels: Record<(typeof KEYS)[number], string> = {
    countdowns: messages.featureCountdowns,
    focus: messages.featureFocus,
    matrix: messages.featureMatrix,
  };
  const hints: Record<(typeof KEYS)[number], string> = {
    countdowns: messages.featureCountdownsHint,
    focus: messages.featureFocusHint,
    matrix: messages.featureMatrixHint,
  };

  function toggle(key: (typeof KEYS)[number]): void {
    const current = featureFlags(me.data?.features ?? flags);
    const next: FeatureFlags = { ...current, [key]: !current[key] };
    setFlags(next);
    void api.updateMe({ features: next }).then((saved) => {
      setFlags(featureFlags(saved.features));
      void queryClient.invalidateQueries({ queryKey: ['me'] });
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
      </ul>
    </section>
  );
}
