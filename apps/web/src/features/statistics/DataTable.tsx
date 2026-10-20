import { useStatisticsText } from './text';
export function DataTable({
  caption,
  headers,
  rows,
}: {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}) {
  const { t } = useStatisticsText();
  return (
    <details className="stats-table">
      <summary>
        {t('table')} · {caption}
      </summary>
      <div className="stats-table-scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th scope="col" key={index}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
