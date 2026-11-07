'use strict';
const assert=require('node:assert/strict');
const {validStremioUrl}=require('../scripts/v2-subtitle-fallback.cjs');
assert.equal(validStremioUrl('https://subs.strem.io/en/download/123'),true);
assert.equal(validStremioUrl('https://evil.example/en/download/123'),false);
assert.equal(validStremioUrl('http://subs.strem.io/en/download/123'),false);
assert.equal(validStremioUrl('https://subs.strem.io/private/123'),false);
console.log('V2 external subtitle URL validation tests passed');
