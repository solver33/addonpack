'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCharacters, realmSlug } = require('../extension/lib/parser.js');

const brief = (text) => parseCharacters(text).map((c) => `${c.name}-${c.realm ?? '?'}`);

test('Name-Realm in one token, any case', () => {
  assert.deepEqual(brief('Kragar-silvermoon'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('kragar-SILVERMOON'), ['Kragar-Silvermoon']);
});

test('Name-Realm inside a sentence', () => {
  assert.deepEqual(brief('позовите Kragar-Silvermoon в рейд'), ['Kragar-Silvermoon']);
});

test('realms with spaces, hyphens and apostrophes', () => {
  assert.deepEqual(brief('Arthas-Twisting Nether'), ['Arthas-Twisting Nether']);
  assert.deepEqual(brief('Arthas-TwistingNether'), ['Arthas-Twisting Nether']);
  assert.deepEqual(brief('Thrall-Azjol-Nerub'), ['Thrall-Azjol-Nerub']);
  assert.deepEqual(brief("Jaina-Kil'jaeden"), ["Jaina-Kil'jaeden"]);
  assert.deepEqual(brief('Jaina-Kiljaeden'), ["Jaina-Kil'jaeden"]);
});

test('separators with spaces and @', () => {
  assert.deepEqual(brief('Kragar - Silvermoon'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('Kragar @ Silvermoon'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('Kragar (Silvermoon)'), ['Kragar-Silvermoon']);
});

test('Cyrillic names and Russian realms', () => {
  assert.deepEqual(brief('Крагар-Гордунни'), ['Крагар-Гордунни']);
  assert.deepEqual(brief('Крагар-Король-лич'), ['Крагар-Король-лич']);
  assert.deepEqual(brief('Крагар-Gordunni'), ['Крагар-Гордунни']);
});

test('a realm name alone is not a character', () => {
  assert.deepEqual(brief('Король-лич'), []);
  assert.deepEqual(brief('Azjol-Nerub'), []);
});

test('name and realm given separately (the example from the brief)', () => {
  assert.deepEqual(brief('ник Kragar\nу него сервер silvermoon'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('nick: Kragar, realm: Silvermoon'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('Kragar с сервера Гордунни'), ['Kragar-Гордунни']);
});

test('several characters in one selection', () => {
  assert.deepEqual(
    brief('Kragar-Silvermoon, Thrall-Draenor и Крагар-Гордунни'),
    ['Kragar-Silvermoon', 'Thrall-Draenor', 'Крагар-Гордунни'],
  );
  assert.deepEqual(
    brief('Kragar-Silvermoon\nThrall-Draenor\nKragar-Silvermoon'),
    ['Kragar-Silvermoon', 'Thrall-Draenor'],
  );
});

test('several names sharing one realm', () => {
  assert.deepEqual(brief('Kragar, Anduin и Jaina с Silvermoon'), ['Kragar-Silvermoon', 'Anduin-Silvermoon', 'Jaina-Silvermoon']);
});

test('mixed joined and separate forms', () => {
  assert.deepEqual(
    brief('Thrall-Draenor и ещё ник Kragar сервер Silvermoon'),
    ['Thrall-Draenor', 'Kragar-Silvermoon'],
  );
});

test('names without a realm', () => {
  const [c] = parseCharacters('Kragar');
  assert.equal(c.name, 'Kragar');
  assert.equal(c.realm, null);
  assert.equal(c.kind, 'name-only');
  assert.deepEqual(brief('Kragar, Anduin'), ['Kragar-?', 'Anduin-?']);
  // A bare word that is also a realm name (Thrall is a US realm) is read as the realm.
  assert.deepEqual(brief('Kragar, Thrall'), ['Kragar-Thrall']);
  assert.deepEqual(brief('ник Kragar'), ['Kragar-?']);
});

test('unknown but plausible realm is kept', () => {
  const [c] = parseCharacters('Kragar-Newrealmname');
  assert.equal(c.realm, 'Newrealmname');
  assert.equal(c.knownRealm, false);
});

test('ordinary text does not produce characters', () => {
  assert.deepEqual(brief('well-known fact'), []);
  assert.deepEqual(brief('Это обычное предложение без ников.'), []);
  assert.deepEqual(brief('Hello there, how are you doing today?'), []);
  assert.deepEqual(brief('42-15'), []);
  assert.deepEqual(brief(''), []);
});

test('names longer than 12 letters are rejected', () => {
  assert.deepEqual(brief('Abcdefghijklmn-Silvermoon'), []);
});

test('raider.io realm slugs', () => {
  assert.equal(realmSlug('Twisting Nether'), 'twisting-nether');
  assert.equal(realmSlug("Kil'jaeden"), 'kiljaeden');
  assert.equal(realmSlug('Гордунни'), 'gordunni');
  assert.equal(realmSlug('Король-лич'), 'lich-king');
});

test('region written next to the character', () => {
  assert.deepEqual(parseCharacters('Kragar-Silvermoon-EU').map((c) => [c.name, c.realm, c.region]), [['Kragar', 'Silvermoon', 'EU']]);
  assert.deepEqual(parseCharacters('Kragar-Silvermoon (us)').map((c) => [c.name, c.realm, c.region]), [['Kragar', 'Silvermoon', 'US']]);
  assert.equal(parseCharacters('Kragar-Silvermoon')[0].region, null);
});

test('chat-style lines', () => {
  assert.deepEqual(brief('[Kragar-Silvermoon]: LF tank'), ['Kragar-Silvermoon']);
  assert.deepEqual(brief('1. Kragar-Silvermoon 2. Anduin-Draenor'), ['Kragar-Silvermoon', 'Anduin-Draenor']);
  assert.deepEqual(brief('ищу хила, пишите Крагар Гордунни'), ['Крагар-Гордунни']);
});

test('result carries regions for known realms', () => {
  const [c] = parseCharacters('Kragar-Silvermoon');
  assert.deepEqual(c.regions, ['EU', 'US']);
  assert.equal(c.kind, 'joined');
});
