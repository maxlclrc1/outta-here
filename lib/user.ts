// The app identifies each browser with an id it keeps in localStorage and sends
// on every request. This is enough for running on your own computer or Wi-Fi;
// real accounts (Supabase) replace it before the app goes on the internet.
export function userOf(req: Request) {
  const u = req.headers.get('x-outta-user') || '';
  return /^[A-Za-z0-9_\-]{4,64}$/.test(u) ? u : 'anonymous';
}
