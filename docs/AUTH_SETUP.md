# 인증 설정에 입력할 값

대상: 새 프로젝트 yafmlyemkvlsjplcurah. 이 문서는 입력할 값을 준비한 것이며 실제 관리 설정 적용 완료를 뜻하지 않는다.

## URL Configuration

Site URL:
https://jch79624053.github.io/chunghyeon/

Redirect URLs (정확한 주소 2개):
https://jch79624053.github.io/chunghyeon/
https://jch79624053.github.io/chunghyeon/?type=invite

원본 사이트를 공개 배포하기 전까지 새 인증 링크의 로그인 화면과 정적 클라이언트는 일치하지 않을 수 있다. 설정 후 메일을 바로 발송하지 않고 공개 배포 승인과 실제 클라이언트 배포를 기다린다.

## 이메일 발송

직원 초대와 비밀번호 재설정용 사용자 지정 SMTP가 필요하다. 기본 Supabase 메일 발송을 일반 직원용으로 쓸 수 있다고 가정하지 않는다.

이미 사용자 지정 SMTP가 있다면 해당 발신자와 설정을 먼저 확인하고 보존한다. 없는 경우 발신자 이메일과 사용할 서비스를 사용자와 결정한다. 현재 로그인용 이메일이 발신 계정 사용 승인까지 의미하지는 않는다.

Gmail을 선택하는 경우 서버 후보 값:
- Host: smtp.gmail.com
- Port: 587 (TLS/STARTTLS 지원 여부를 실제 설정과 공식 안내에서 확인)
- Username: 사용자가 승인한 Gmail 발신 주소
- Password: Gmail 일반 비밀번호가 아닌 사용자가 직접 발급한 앱 비밀번호. 채팅·GitHub·정적 클라이언트에 입력하지 않고 Supabase SMTP 보안 입력란에만 사용.
- Sender email: 사용자가 승인한 Gmail 발신 주소
- Sender name: 충현 Manager

Gmail 앱 비밀번호는 Google 2단계 인증 및 계정 정책에 따라 사용할 수 없을 수 있다. 이 경우 다른 SMTP 발송 서비스를 검토하며 새 계정이나 유료 서비스를 임의로 만들지 않는다.

## 적용 후 검증

1. 이메일 인증을 활성화한 상태인지 확인.
2. 사용자가 대표자 비밀번호를 직접 정하고 본인 인증메일 수신·확인.
3. 지정 이메일의 대표자 활성화, 로그인·비밀번호 재설정·초대 메일 복귀 확인.
4. 대표자 이메일·SMTP 비밀번호·인증 링크 토큰을 공개 소스 또는 검증 로그에 포함하지 않는다.

공식 참고:
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
- https://support.google.com/accounts/answer/185833
- https://support.google.com/a/answer/176600
