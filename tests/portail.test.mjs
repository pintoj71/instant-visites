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
