# 통합 구조와 릴리스 체크

## 구조

index.html과 core.mjs는 GitHub Pages에서 실행하는 정적 클라이언트다. 클라이언트에는 공개용 Supabase 키만 포함한다. 서버용 비밀 키는 Edge Function 환경에서만 사용한다.

공개 테이블은 모두 RLS를 적용한다. 원자재·레시피 쓰기 권한을 클라이언트에 직접 부여하지 않고 인증과 역할을 검사하는 RPC로 저장한다. SECURITY DEFINER 구현은 비공개 manager_private 스키마에 두고 빈 search_path와 최소 EXECUTE 권한을 적용했다. 클라이언트가 호출하는 public 함수는 SECURITY INVOKER 래퍼다.

management_snapshot은 관리용 원가와 배합을 한 시점에 조회한다. 비밀 접근이 없는 관리자는 제조 재료명·생산 단위·집계 원가만 볼 수 있고 배합은 볼 수 없다. staff_recipe_view는 직원용 재료명·사용량·조리 순서만 반환하며 비밀 배합은 별도 승인 시만 반환한다.

save_material은 원자재와 가격·포장 규격 이력을 같은 트랜잭션으로 저장한다. save_recipe는 본문과 재료 목록을 함께 저장하고 외래키·수량 검증 실패 시 전체 복구한다. updated_at 일치를 검사해 오래된 화면의 덮어쓰기를 막는다.

대표자 활성화 허용 이메일은 비공개 bootstrap에 별도 등록한다. 이메일 소유권 확인 전에는 대표자로 활성화하지 않는다. 사용자가 편집할 수 있는 Auth user_metadata로 권한을 결정하지 않는다.

직원 초대는 대표자만 예약할 수 있고, 서버가 Auth 초대 메일을 요청한다. 예약한 이메일의 Auth 계정이 생성되면 DB 트리거가 직원 프로필을 만든다. 처음부터 비밀 접근을 허용하지 않으며 기존 가입자를 덮어쓰지 않는다.

## 가격 조회

- 네이버 쇼핑 검색 API 종료 공지: https://developers.naver.com/notice/article/32564 (종료일 2026-07-31). 종료 API를 사용하지 않는다.
- 쿠팡 공식 문서: https://developers.coupang.com/ko . 확인한 Open API는 판매자용이며 일반 구매 링크의 결제 가격 조회와 구분된다. 파트너스 이용 자격·용도 확인이나 발급 키 없이 자동 조회를 제공한다고 주장하지 않는다.
- 그램원: https://www.gramwon.com/ . 공개 /product/ 경로의 단일 Product/Offer 원화 가격만 후보로 추출한다. robots 제한, 호스트·경로 허용목록, 리다이렉트 미추종, 타임아웃·최대 응답 크기, 서버 캐시·횟수 제한을 적용했다.
- 조회 결과는 price_checks에 별도 저장한다. 실제 구매가는 자동 변경하지 않는다. 후보로 수정 폼을 열면 같은 상품·포장·옵션·배송비 확인을 체크하고 저장해야 한다.
- 차단·오류·재고 불명·다중 가격·회원가·옵션 차이는 직접 확인으로 전환한다. 대량 크롤링·유료 서비스·예약 조회는 구성하지 않았다.

## 검증

npm test : 9개.
npm run check : 클라이언트 문법·프로젝트 설정 검사.
npm run build : 실제 클라이언트만 dist로 복사하고 QA 파일 제거.
Deno check 및 tests/edge.test.ts : 서버 TypeScript와 6개 비인증 요청 검증.
tests/database.integration.sql : 새 DB에 임시 검증 계정을 트랜잭션 안에서 만들고 RLS/RPC 검증 후 전부 rollback. 실제 메일을 발송하거나 실제 로그인을 수행하는 검증은 아니다.
브라우저 : tests/fixtures/qa-client.mjs를 사용한 격리 화면 검증. 실제 로그인과 혼동하지 않도록 QA 표시를 추가했으며 운영 빌드에서는 제외한다.

## 남은 릴리스 순서

1. 새 프로젝트 Auth의 Site URL과 정확한 Redirect URL을 승인된 앱 주소로 설정. 필요한 초대용 query URL도 허용.
2. 외부 직원 이메일 발송을 위한 SMTP 연결과 수신 확인. 기본 발송 서비스의 팀 수신자 제한을 직원에게 관리자 권한을 부여하는 방식으로 우회하지 않는다.
3. 2026-10-31 사용자 승인으로 GitHub 쓰기 권한을 확인했으며 개발 브랜치에 소스를 저장. 사용자 승인 없이 main으로 병합하거나 Pages를 교체하지 않는다.
4. 사용자 배포 승인 후 두 Edge Function과 정적 클라이언트 배포. verify_jwt=false 설정은 새 키 호환을 위해 사용하며 함수 본문에서 getUser와 활성 역할을 반드시 검증한다.
5. 사용자가 대표자 비밀번호를 직접 정하고 이메일을 인증. 로그인·비밀번호 복구·직원 이메일 초대·실제 가격 조회를 최종 확인.

Auth 복귀 URL 문서: https://supabase.com/docs/guides/auth/redirect-urls
SMTP 제한 문서: https://supabase.com/docs/guides/auth/auth-smtp
