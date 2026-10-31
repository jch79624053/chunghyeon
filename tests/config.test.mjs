import test from 'node:test';
import assert from 'node:assert/strict';
import {appConfig,validateConfig} from '../app-config.mjs';

test('개발 연결은 검증 가능하지만 현재 프로젝트의 운영 빌드는 차단',()=>{
  assert.equal(validateConfig(appConfig),appConfig);
  assert.throws(()=>validateConfig(appConfig,{release:true}),/운영 계정/);
  assert.throws(()=>validateConfig({...appConfig,environment:'production',operationalAccountVerified:true},{release:true}),/운영 계정/);
});
test('서로 다른 프로젝트 주소와 서버 전용 키는 거부',()=>{
  assert.throws(()=>validateConfig({...appConfig,url:'https://example.com'}),/일치/);
  assert.throws(()=>validateConfig({...appConfig,publishableKey:'sb_secret_example'}),/공개용/);
  assert.throws(()=>validateConfig({...appConfig,url:appConfig.url+'/?redirect=example'}),/일치/);
});
test('이전한 운영 프로젝트도 계정 확인 기록이 있어야 릴리스 허용',()=>{
  const target={...appConfig,projectRef:'abcdefghijklmnopqrst',url:'https://abcdefghijklmnopqrst.supabase.co',environment:'production'};
  assert.throws(()=>validateConfig(target,{release:true}),/운영 계정/);
  assert.equal(validateConfig({...target,operationalAccountVerified:true},{release:true}).projectRef,target.projectRef);
});
