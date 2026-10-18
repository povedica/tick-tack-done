/** RF-1002. A null limit means the column does not cap work in progress. */
export interface ColumnLoad {
  readonly count: number;
  readonly limit: number | null;
  readonly over: boolean;
}

export function columnLoad(count: number, limit: number | null): ColumnLoad {
  return {
    count,
    limit,
    over: limit !== null && count > limit,
  };
}

/** A card already in the column can stay. A new card is refused once the limit is full. */
export function acceptsColumnDrop(
  countInDestination: number,
  limit: number | null,
  alreadyThere: boolean,
): boolean {
  if (alreadyThere || limit === null) {
    return true;
  }
  return countInDestination < limit;
}
