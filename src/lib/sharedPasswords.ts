export function getSharedPasswords(): string[] {
  return [process.env.PASSWORD, process.env.PASSWORD2].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}
