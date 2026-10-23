/** Case/accent-insensitive list lookup without changing the stored display name. */
export function listNameKey(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
}
