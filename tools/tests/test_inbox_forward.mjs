import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {forward} from '../inbox/forward.mjs';

const batch = (id, count = 1) => ({id, created: id, count, k: `k-${id}`, iv: `iv-${id}`, ct: `ct-${id}`});
const inbox = (...bs) => ({batches: bs});

test('forwards a batch that is new on main', () => {
  const r = forward(inbox(batch('a')), inbox(batch('a'), batch('b', 45)), inbox());
  assert.deepEqual(r.added.map(b => b.id), ['b']);
  assert.deepEqual(r.live.batches.map(b => b.id), ['b']);
});

test('never resurrects a batch the book already reviewed and removed', () => {
  // 'a' was on main before this push and is gone from gh-pages because it was reviewed.
  const r = forward(inbox(batch('a')), inbox(batch('a'), batch('b')), inbox());
  assert.ok(!r.live.batches.some(b => b.id === 'a'));
});

test('skips a batch already in the live inbox', () => {
  const r = forward(inbox(), inbox(batch('b')), inbox(batch('b'), batch('x')));
  assert.equal(r.added.length, 0);
  assert.deepEqual(r.live.batches.map(b => b.id), ['b', 'x']);
});

test('keeps live batches first and in order, and copies batches untouched', () => {
  const b = batch('b', 3);
  const r = forward(inbox(), inbox(b), inbox(batch('x'), batch('y')));
  assert.deepEqual(r.live.batches.map(x => x.id), ['x', 'y', 'b']);
  assert.deepEqual(r.live.batches[2], b);
});

test('ignores duplicates within one push and anything that is not a sealed batch', () => {
  const r = forward(inbox(), inbox(batch('b'), batch('b'), {id: 'plain', items: []}, null, {}), inbox());
  assert.deepEqual(r.added.map(b => b.id), ['b']);
});

test('a re-run never resends a batch that was forwarded once and then reviewed', () => {
  const first = forward(inbox(), inbox(batch('b')), inbox());
  assert.deepEqual(first.ledger, ['b']);
  // The owner reviews 'b', so the book removes it from gh-pages. Then someone re-runs the same workflow run.
  const rerun = forward(inbox(), inbox(batch('b')), inbox(), first.ledger);
  assert.equal(rerun.added.length, 0);
});

test('does nothing when the push removes batches from main', () => {
  const r = forward(inbox(batch('a'), batch('b')), inbox(batch('a')), inbox());
  assert.equal(r.added.length, 0);
});

test('CLI against real git history: forwards only the new batch, and does nothing on an all-zero before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-fwd-'));
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], {encoding: 'utf8'}).trim();
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'inbox.json'), JSON.stringify(inbox(batch('old'))));
  git('add', '.'); git('commit', '-qm', 'one'); const before = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'inbox.json'), JSON.stringify(inbox(batch('old'), batch('new', 45))));
  git('commit', '-qam', 'two'); const after = git('rev-parse', 'HEAD');
  const live = path.join(dir, 'live.json'); fs.writeFileSync(live, JSON.stringify(inbox()));
  const script = new URL('../inbox/forward.mjs', import.meta.url).pathname;
  const out = execFileSync('node', [script, '--before', before, '--after', after, '--repo', dir, '--live', live], {encoding: 'utf8'});
  assert.match(out, /added=1 items=45 ids=new/);
  assert.deepEqual(JSON.parse(fs.readFileSync(live, 'utf8')).batches.map(b => b.id), ['new']);
  const ledger = path.join(dir, 'ledger.json');
  const rerunLive = path.join(dir, 'reviewed.json'); fs.writeFileSync(rerunLive, JSON.stringify(inbox()));
  execFileSync('node', [script, '--before', before, '--after', after, '--repo', dir, '--live', rerunLive, '--ledger', ledger]);
  assert.deepEqual(JSON.parse(fs.readFileSync(ledger, 'utf8')).forwarded, ['new']);
  fs.writeFileSync(rerunLive, JSON.stringify(inbox()));   // reviewed and removed by the book
  const again = execFileSync('node', [script, '--before', before, '--after', after, '--repo', dir, '--live', rerunLive, '--ledger', ledger], {encoding: 'utf8'});
  assert.match(again, /added=0/);
  const zero = execFileSync('node', [script, '--before', '0'.repeat(40), '--after', after, '--repo', dir, '--live', live], {encoding: 'utf8'});
  assert.match(zero, /added=0/);
  assert.equal(JSON.parse(fs.readFileSync(live, 'utf8')).batches.length, 1);
});
