import { useEffect, useRef } from 'react';
import { TagChip } from '../../components/ui';
import { count, label, numeric, type GardenList } from './model';
import { useGardenText } from './text';

type Tag = Record<string, unknown>;
export function GardenLists({
  items,
  selected,
  detail = false,
  onSelect,
}: {
  items: GardenList[];
  selected?: string | null;
  detail?: boolean;
  onSelect: (id: string) => void;
}) {
  const { t, number } = useGardenText();
  const max = Math.max(1, ...items.map((item) => count(item.active)));
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <>
      <div className="garden-map-legend">
        <span>
          <i className="garden-legend-pending" />
          {t('pendingLabel')} <i className="garden-legend-overdue" /> {t('overdueLabel')}
        </span>
        <span>{t('listLegend')}</span>
      </div>
      <ul className="garden-bars">
        {items.map((item) => (
          <li
            key={item.id}
            ref={selected === item.id ? selectedRef : undefined}
            data-selected={selected === item.id}
          >
            <button
              type="button"
              onClick={() => {
                onSelect(item.id);
              }}
              aria-pressed={selected === item.id}
            >
              <span className="garden-bar-name">{item.name}</span>
              <span className="garden-bar-track" aria-hidden="true">
                <span
                  className="garden-bar-fill"
                  style={{ width: `${String((count(item.active) / max) * 100)}%` }}
                >
                  <span
                    className="garden-bar-overdue"
                    style={{
                      width: `${String(Math.min(100, (count(item.overdue) / Math.max(1, count(item.active))) * 100))}%`,
                    }}
                  />
                </span>
              </span>
              <span className="garden-bar-count">
                {item.active === null ? '—' : number(item.active)} <span>·</span>{' '}
                <b>{item.overdue === null ? '—' : number(item.overdue)}</b>
              </span>
            </button>
            {detail && selected === item.id ? (
              <div className="garden-list-detail">
                {item.needsReview ? <p>{t('review')}</p> : null}
                {Object.keys(item.age).length > 0 ? (
                  <table>
                    <caption>{t('age')}</caption>
                    <thead>
                      <tr>
                        <th>{t('under7')}</th>
                        <th>{t('days30')}</th>
                        <th>{t('over30')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {['under_7', 'days_7_30', 'over_30'].map((key) => (
                          <td key={key}>
                            {numeric(item.age[key]) === null ? '—' : count(item.age[key]) || '—'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
export function GardenTags({
  items,
  selected,
  onSelect,
  preview = false,
}: {
  items: Tag[];
  selected?: string | null;
  onSelect: (id: string) => void;
  preview?: boolean;
}) {
  const { t, number } = useGardenText();
  const sorted = [...items].sort(
    (a, b) => count(b.active) - count(a.active) || label(a.name).localeCompare(label(b.name)),
  );
  const max = Math.max(1, ...sorted.map((item) => count(item.active)));
  const inactive = sorted.filter((item) => item.recent_activity === false);
  const top = preview ? sorted.slice(0, 5) : sorted;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const chips = (tags: Tag[], dotted: boolean) => (
    <div className={`garden-tag-cloud${dotted ? ' is-unused' : ''}`}>
      {tags.map((tag) => (
        <button
          key={label(tag.id)}
          type="button"
          onClick={() => {
            onSelect(label(tag.id));
          }}
          aria-pressed={selected === tag.id}
          data-selected={selected === tag.id}
          style={{
            fontSize: `calc(var(--fs-sm) * ${String(1 + (0.3 * count(tag.active)) / max)})`,
          }}
        >
          <TagChip label={label(tag.name)} color={label(tag.color) || null} />
          <b>{numeric(tag.active) === null ? '—' : number(count(tag.active))}</b>
        </button>
      ))}
    </div>
  );
  return (
    <div ref={ref}>
      {chips(
        top.filter((tag) => tag.recent_activity !== false),
        false,
      )}
      {inactive.length > 0 ? (
        <>
          <h4>{t('unused')}</h4>
          {chips(preview ? inactive.slice(0, 5) : inactive, true)}
        </>
      ) : null}
      {items.some((tag) => tag.recent_activity === null || tag.recent_activity === undefined) ? (
        <p className="garden-hint">{t('unknownUsage')}</p>
      ) : null}
      <p className="garden-hint">{t('tagNote')}</p>
    </div>
  );
}
