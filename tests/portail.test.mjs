import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_SECRET = process.env.APP_SECRET || 'x'.repeat(40);
const { technicienDuPrenom, portailActif, handler } = await import('../netlify/functions/portail.js');

test('Portail : le prénom retrouve son technicien, accents et nom de famille compris', () => {
  const noms = ['Jonathan Pinto', 'Mickaël', 'Tanguy Durand'];
  assert.equal(technicienDuPrenom(noms, 'Mickael'), 'Mickaël');
  assert.equal(technicienDuPrenom(noms, 'jonathan'), 'Jonathan Pinto');
  assert.equal(technicienDuPrenom(noms, 'Tanguy'), 'Tanguy Durand');
  assert.equal(technicienDuPrenom(noms, 'Solène'), null);
  assert.equal(technicienDuPrenom(noms, ''), null);
});

test('Portail : deux techniciens du même prénom → on ne devine pas', () => {
  assert.equal(technicienDuPrenom(['Paul Martin', 'Paul Durand'], 'Paul'), null);
  assert.equal(technicienDuPrenom(['Paul', 'Paul Durand'], 'Paul'), 'Paul');
});

test('Portail : inactif sans la variable PORTAIL_MODULE_CLE, refus des tickets mal formés', async () => {
  assert.equal(portailActif({}), false);
  assert.equal(portailActif({ PORTAIL_MODULE_CLE: 'court' }), false);
  assert.equal(portailActif({ PORTAIL_MODULE_CLE: 'a'.repeat(48) }), true);
  delete process.env.PORTAIL_MODULE_CLE;
  const off = await handler({ httpMethod: 'POST', body: '{"ticket":"' + 'a'.repeat(48) + '"}', headers: {} });
  assert.equal(off.statusCode, 503);
  process.env.PORTAIL_MODULE_CLE = 'a'.repeat(48);
  const bad = await handler({ httpMethod: 'POST', body: '{"ticket":"pas-un-ticket"}', headers: {} });
  assert.equal(bad.statusCode, 401);
  const get = await handler({ httpMethod: 'GET', headers: {} });
  assert.equal(get.statusCode, 400);
  delete process.env.PORTAIL_MODULE_CLE;
});

test('Écritures : panne bloquante, révocation bloquante et reprise après validation', async (t) => {
  const { signToken } = await import('../netlify/functions/_lib.js');
  const { handler: me } = await import('../netlify/functions/me.js');
  const { handler: visits } = await import('../netlify/functions/visites.js');
  const { handler: uploadPdf } = await import('../netlify/functions/upload-pdf.js');
  const { verifierAcces } = await import('../netlify/functions/portail.js');
  const oldKey = process.env.PORTAIL_MODULE_CLE;
  process.env.PORTAIL_MODULE_CLE = 'a'.repeat(48);
  t.after(() => {
    if (oldKey === undefined) delete process.env.PORTAIL_MODULE_CLE;
    else process.env.PORTAIL_MODULE_CLE = oldKey;
  });

  const event = {
    httpMethod: 'POST', path: '/api/visites', body: '{}',
    headers: { cookie: 'session=' + signToken({ sub: 'Test', via: 'portail', jeton: 'b'.repeat(64) }) }
  };
  const read = { ...event, httpMethod: 'GET', path: '/api/me' };
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  assert.equal(JSON.parse((await me(read)).body).portailIndisponible, true);
  for (const handler of [visits, uploadPdf]) {
    const response = await handler(event);
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).code, 'PORTAIL_INDISPONIBLE');
  }

  mock.mock.mockImplementation(async () => new Response('{"ok":false}'));
  assert.equal((await visits(event)).statusCode, 401);
  assert.equal((await me(read)).statusCode, 401);

  mock.mock.mockImplementation(async () => new Response('{"ok":true}'));
  assert.equal(JSON.parse((await me(read)).body).portailIndisponible, false);
  assert.equal((await visits(event)).statusCode, 400); // atteint la validation métier

  mock.mock.mockImplementation(async () => { throw new Error('Le PIN ne contacte pas le portail'); });
  const calls = mock.mock.callCount();
  const pin = { ...event, headers: { cookie: 'session=' + signToken({ sub: 'Test' }) } };
  assert.equal((await verifierAcces(pin)).user.sub, 'Test');
  assert.equal(mock.mock.callCount(), calls);
});
