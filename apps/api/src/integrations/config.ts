export function googleConfigured(): boolean {
  return present('GOOGLE_CLIENT_ID') && present('GOOGLE_CLIENT_SECRET');
}

export function telegramConfigured(): boolean {
  return present('TELEGRAM_BOT_TOKEN');
}

/** Drive as a backup destination. Without the folder id the API does not call Google. */
export function driveConfigured(): boolean {
  return googleConfigured() && present('GOOGLE_DRIVE_FOLDER_ID');
}

export function googleRefreshConfigured(): boolean {
  return googleConfigured() && present('GOOGLE_REFRESH_TOKEN');
}

function present(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}
