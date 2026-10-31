// Public client settings only. Never put service_role or secret keys here.
export const appConfig = Object.freeze({
  projectRef: 'yafmlyemkvlsjplcurah',
  url: 'https://yafmlyemkvlsjplcurah.supabase.co',
  publishableKey: 'sb_publishable_tBGL5v9jQv81vMpQQOr8UA_WwHAhP8O',
  environment: 'development',
  operationalAccountVerified: false,
});

export function validateConfig(config, {release = false} = {}) {
  if (!/^[a-z]{20}$/.test(config.projectRef || '') ||
      config.url !== `https://${config.projectRef}.supabase.co`) {
    throw new Error('Supabase 프로젝트 ID와 주소가 일치하지 않습니다.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || '')) {
    throw new Error('클라이언트에는 공개용 publishable 키만 사용할 수 있습니다.');
  }
  if (!['development', 'production'].includes(config.environment)) {
    throw new Error('개발·운영 환경 구분이 필요합니다.');
  }
  if (release && (config.environment !== 'production' ||
      config.operationalAccountVerified !== true ||
      config.projectRef === 'yafmlyemkvlsjplcurah')) {
    throw new Error('운영 계정 프로젝트 연결·이전 확인 전에는 공개 배포용 빌드를 만들 수 없습니다.');
  }
  return config;
}
