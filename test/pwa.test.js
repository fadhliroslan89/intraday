import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
const dir=join(process.cwd(),'public');
const manifest=JSON.parse(fs.readFileSync(join(dir,'manifest.webmanifest'),'utf8'));
test('PWA manifest includes Android install requirements',()=>{
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'&&i.type==='image/png'));
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.type==='image/png'));
  assert.notEqual(manifest.prefer_related_applications,true);
});
test('manifest icon files are real PNGs',()=>{
  for(const icon of manifest.icons){
    const buffer=fs.readFileSync(join(dir,icon.src.slice(1)));
    assert.equal(buffer.subarray(1,4).toString(),'PNG');
    const wh=Number(icon.sizes.split('x')[0]);
    assert.equal(buffer.readUInt32BE(16),wh);
    assert.equal(buffer.readUInt32BE(20),wh);
  }
});
test('offline service worker never caches market prices or API',()=>{
  const sw=fs.readFileSync(join(dir,'sw.js'),'utf8');
  assert.match(sw,/event.request.mode!==['"]navigate['"]/);
  assert.doesNotMatch(sw,/cache\.put\(/);
  assert.match(fs.readFileSync(join(dir,'index.html'),'utf8'),/rel="manifest"/);
  assert.ok(fs.existsSync(join(dir,'pwa-install.js')));
});
