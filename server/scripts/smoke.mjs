// End-to-end API check: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://localhost:4000';
const day = new Date().toISOString().slice(0, 10);
let token = '';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Local-Day': day, ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  console.log(`✓ ${method} ${path}`);
  return json;
}

const email = `smoke${Date.now()}@solace.test`;
({ token } = await call('POST', '/auth/signup', { name: 'Smoke Test', email, password: 'password123' }));
await call('POST', '/auth/login', { email, password: 'password123' });
await call('PATCH', '/me', { goals: ['Manage stress'], companionTone: 'gentle', onboarded: true });
await call('POST', '/assessments', { answers: [3, 2, 3, 2, 4] });
await call('POST', '/moods', { mood: 'low', tags: ['work'], note: 'deadline stress' });
const home = await call('GET', '/home');
console.log('  affirmation:', home.daily.affirmation, '| streak:', home.streak);
const { conversation } = await call('POST', '/conversations');
const r1 = await call('POST', `/conversations/${conversation._id}/messages`, { content: 'I am so anxious about my exam tomorrow' });
console.log('  Sol:', r1.message.content, r1.message.suggestions);
const r2 = await call('POST', `/conversations/${conversation._id}/messages`, { content: 'It is my organic chemistry final, my sister Priya says I will be fine' });
console.log('  Sol:', r2.message.content);
const list = await call('GET', '/conversations');
console.log('  conversations:', list.conversations.length, '-', list.conversations[0].title);
await call('GET', `/conversations/${conversation._id}`);
await call('GET', '/memories');
await call('POST', '/activities', { kind: 'breathing', minutes: 2 });
await call('GET', '/moods/insights');
await call('DELETE', `/conversations/${conversation._id}`);
await call('DELETE', '/me');
console.log('All good.');
