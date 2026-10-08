export function validOrigin(request: Request): boolean {
  const expected = process.env.WEB_ORIGIN;
  return Boolean(expected && request.headers.get("origin") === expected);
}
