import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../server/database.ts';
import {createApp} from '../server/app.ts';
import {addCoverage,coverageMeta,coverageTile,ensureCoverageSchema} from '../server/coverage.ts';

test('coverage keeps only grid counts and rejects implausible samples',()=>{
  const db=openDatabase(':memory:');ensureCoverageSchema(db);
  const ok={lat:52.4192,lng:21.3044,mcc:'260',mnc:'01',tech:'LTE',band:'1800',rsrp:-105};
  const accepted=addCoverage(db,{samples:[ok,{...ok,rsrp:-100},{...ok,lat:40},{...ok,mnc:'99'},{...ok,rsrp:5},{...ok,band:'foo'},{...ok,tech:'NR',band:'3500'}]});
  assert.equal(accepted,3);
  const rows=db.prepare('SELECT operator,tech,band,samples,rsrp_best FROM coverage ORDER BY tech').all();
  assert.deepEqual(rows.map(r=>({...r})),[{operator:'Plus',tech:'5G',band:'3500',samples:1,rsrp_best:-105},{operator:'Plus',tech:'LTE',band:'1800',samples:2,rsrp_best:-100}]);
  assert.equal(coverageMeta(db).layers.length,2);
  assert.throws(()=>addCoverage(db,{samples:new Array(501).fill(ok)}));
  db.close();
});

test('coverage tile is a png that is empty where nothing was measured',()=>{
  const db=openDatabase(':memory:');ensureCoverageSchema(db);
  addCoverage(db,{samples:[{lat:52.4192,lng:21.3044,mcc:'260',mnc:'06',tech:'LTE',band:'800',rsrp:-95}]});
  // z14 tile containing the point, and a far-away tile.
  const z=14,n=2**z,x=Math.floor((21.3044+180)/360*n),r=52.4192*Math.PI/180,y=Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n);
  const hit=coverageTile(db,z,x,y,{operator:'Play'}),miss=coverageTile(db,z,x+5,y,{operator:'Play'});
  assert.equal(hit.subarray(1,4).toString(),'PNG');
  assert.ok(hit.length>miss.length);
  assert.equal(coverageTile(db,z,x,y,{operator:'Play',band:'1800'}).length,miss.length);
  assert.throws(()=>coverageTile(db,z,x,y,{operator:'Nope'}));
  db.close();
});

test('coverage api accepts samples and serves tiles',async()=>{
  const db=openDatabase(':memory:');const server=createApp(db).listen(0);await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post=await fetch(`${base}/api/coverage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({samples:[{lat:52.2,lng:21,mcc:'260',mnc:'02',tech:'LTE',band:'2600',rsrp:-90}]})});
  assert.deepEqual(await post.json(),{accepted:1});
  const meta=await (await fetch(`${base}/api/coverage/meta`)).json();
  assert.equal(meta.layers[0].operator,'T-Mobile');
  const tile=await fetch(`${base}/api/coverage/tiles/10/571/336.png?operator=T-Mobile`);
  assert.equal(tile.headers.get('content-type'),'image/png');
  assert.equal((await fetch(`${base}/api/coverage/tiles/10/99999/1.png?operator=T-Mobile`)).status,400);
  server.close();db.close();
});
