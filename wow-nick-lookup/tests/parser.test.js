// Запуск: node tests/parser.test.js
'use strict';
require('../src/realms.js');
const WNL = require('../src/parser.js');
const assert = require('assert');

const pairs = (t) => WNL.parse(t).map((c) => `${c.name}-${c.realmSlugs[0] || '?'}${c.region ? '@' + c.region : ''}:${c.confidence}`);
let failed = 0;
function check(text, expected) {
  const got = pairs(text);
  try { assert.deepStrictEqual(got, expected); console.log('ok   ', JSON.stringify(text)); }
  catch (e) { failed++; console.log('FAIL ', JSON.stringify(text), '\n      got     ', got, '\n      expected', expected); }
}

check('Kragar-Silvermoon', ['Kragar-silvermoon:high']);
check('Kragar-silvermoon', ['Kragar-silvermoon:high']);
check('ник Kragar\nу него сервер silvermoon', ['Kragar-silvermoon:high']);
check('Kragar - Tarren Mill', ['Kragar-tarren-mill:high']);
check('Kragar-TarrenMill и Thrall-TwistingNether', ['Kragar-tarren-mill:high', 'Thrall-twisting-nether:high']);
check('Ищем в рейд: Kragar-Silvermoon, Ловкач-Гордунни, Jaina-Draenor', ['Kragar-silvermoon:high', 'Ловкач-gordunni:high', 'Jaina-draenor:high']);
check('ники Kragar, Thrall и Jaina — все с silvermoon', ['Kragar-silvermoon:high', 'Thrall-silvermoon:high', 'Jaina-silvermoon:high']);
check('Kragar silvermoon', ['Kragar-silvermoon:high']);
check('Kragar из Ревущий фьорд', ['Kragar-howling-fjord:high']);
check('omali kazzak\nscapasoa kazzak', ['Omali-kazzak:high', 'Scapasoa-kazzak:high']);
check('- omali kazzak', ['Omali-kazzak:high']);
check('вчера omali kazzak звал в ключ', ['Omali-kazzak:medium']);
check('Kragar (Silvermoon)', ['Kragar-silvermoon:high']);
check('Thrall Draenor', ['Thrall-draenor:high']);
check('ник: kragar, сервер: Twisting Nether', ['Kragar-twisting-nether:high']);
check('ник Kragar сервер Silvermoon\nник Thrall сервер Draenor', ['Kragar-silvermoon:high', 'Thrall-draenor:high']);
check('https://raider.io/characters/eu/silvermoon/Kragar', ['Kragar-silvermoon@eu:high']);
check('Kragar-Moon Guard US', ['Kragar-moon-guard@us:high']);
check('Kragar-Azjol-Nerub', ['Kragar-azjolnerub:high']);
check('Kragar-Newrealm', ['Kragar-newrealm:high']);
check('Kragar', ['Kragar-?:medium']);
check('Kragar\nу него сервер silvermoon', ['Kragar-silvermoon:high']);
check('вчера в рейде был Kragar\nу него сервер silvermoon вроде', ['Kragar-silvermoon:medium']);
check('ник Kragar, Silvermoon', ['Kragar-silvermoon:high']);
check('ник у него Kragar', ['Kragar-?:high']);
check('привет как дела что-то из-за чего-нибудь', []);
check('гром гремит за окном', []);
check('Azjol-Nerub', []);
check('Король-лич', []);
check("Kragar-Mal'Ganis", ['Kragar-malganis:high']);
check('Написать @НаКеМ', []);
check('Спасибо @Вася', []);
check('Kragar @ Silvermoon', ['Kragar-silvermoon:high']);
check('Kragar@Newrealm', ['Kragar-newrealm:high']);
check('Kragar#1234', []); // battletag — не персонаж

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
