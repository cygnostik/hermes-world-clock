// Pure-logic tests: load plugin.js with the SDK and React stubbed out.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8');
const stubbed = src
  .replace(/import \{[\s\S]*?\} from "@hermes\/plugin-sdk";/, `
    const atom=(v)=>{let x=v;return{get:()=>x,set:(n)=>{x=n}}};
    const DropdownMenu=0,DropdownMenuContent=0,DropdownMenuItem=0,DropdownMenuSeparator=0,DropdownMenuTrigger=0;
    const STATUSBAR_AREAS={right:'statusBar.right'};const useValue=(a)=>a.get();`)
  .replace(/import \{[^}]*\} from "react";/, 'const useEffect=()=>{},useState=(v)=>[v,()=>{}];')
  .replace(/import \{[^}]*\} from "react\/jsx-runtime";/, 'const jsx=(t,p)=>({t,p}),jsxs=jsx;');
const mod = await import('data:text/javascript;base64,' + Buffer.from(stubbed).toString('base64'));

test('every curated zone is a valid IANA zone, no duplicates', () => {
  for (const tz of mod.ZONES) assert.ok(mod.isValidZone(tz), tz);
  assert.equal(new Set(mod.ZONES).size, mod.ZONES.length);
});

test('city labels come from the IANA id', () => {
  assert.equal(mod.cityOf('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(mod.cityOf('Australia/Brisbane'), 'Brisbane');
  assert.equal(mod.cityOf('UTC'), 'UTC');
});

test('offsets: whole, half-hour, negative, zero', () => {
  const d = new Date('2026-01-15T12:00:00Z');
  assert.equal(mod.offsetOf('Australia/Brisbane', d), 'UTC+10');
  assert.equal(mod.offsetOf('Asia/Kolkata', d), 'UTC+5:30');
  assert.equal(mod.offsetOf('America/Guatemala', d), 'UTC\u22126');
  assert.equal(mod.offsetOf('UTC', d), 'UTC');
});

test('legacy prototype ids migrate to IANA', () => {
  const store = {get:(k)=>({enabled:['guatemala','brisbane'],selected:'brisbane'})[k]};
  assert.deepEqual(mod.loadState(store, 'America/Los_Angeles'),
    {enabled:['America/Guatemala','Australia/Brisbane'], selected:'Australia/Brisbane'});
});

test('fresh install: local zone plus UTC, local selected', () => {
  const store = {get:(k,f)=>f};
  assert.deepEqual(mod.loadState(store, 'Europe/Berlin'), {enabled:['Europe/Berlin','UTC'], selected:'Europe/Berlin'});
  assert.deepEqual(mod.loadState(store, 'UTC'), {enabled:['UTC'], selected:'UTC'});
});

test('junk storage falls back cleanly', () => {
  const store = {get:(k)=>({enabled:['Not/AZone', 42, null], selected:'nope'})[k]};
  assert.deepEqual(mod.loadState(store, 'Asia/Tokyo'), {enabled:['Asia/Tokyo','UTC'], selected:'Asia/Tokyo'});
});

test('uncurated local zone is added to the menu list', () => {
  assert.equal(mod.zoneList('Europe/Dublin')[0], 'Europe/Dublin');
  assert.equal(mod.zoneList('Asia/Tokyo'), mod.ZONES);
});

test('registers one status-bar item with a toggle label', () => {
  const regs = [];
  const store = new Map();
  mod.default.register({register:(c)=>regs.push(c), storage:{get:(k,f)=>store.has(k)?store.get(k):f,set:(k,v)=>store.set(k,v)}});
  assert.equal(regs.length, 1);
  assert.equal(regs[0].area, 'statusBar.right');
  assert.equal(regs[0].data.toggleLabel, 'World clock');
  assert.equal(typeof regs[0].data.render, 'function');
});
