import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invitationLink} from '../src/network/invite.js';
test('device-local addresses cannot be offered as friend invitations',()=>{
  for(const origin of ['http://localhost:7470','http://localhost.:7470','http://court.localhost:7470','http://127.0.0.1:7470','http://127.2.3.4:7470','http://[::1]:7470','http://0.0.0.0:7470'])assert.equal(invitationLink(origin,'123456'),null,origin);
});
test('LAN and hosted invitations retain their actual origin and only the room code',()=>{
  assert.equal(invitationLink('http://100.81.1.29:7470','123456'),'http://100.81.1.29:7470/?room=123456');
  assert.equal(invitationLink('https://court.example/path?token=private#section','654321'),'https://court.example/?room=654321');
});
test('invalid room IDs and non-web URLs cannot produce invitations',()=>{
  assert.equal(invitationLink('https://court.example','undefined'),null);
  assert.equal(invitationLink('file:///game','123456'),null);
});
