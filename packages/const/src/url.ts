import urlJoin from 'url-join';

// 商业化白标:lobehub 上游站点链接已清空(死链接,不崩)。待用户提供自有域名后统一替换。
export const OFFICIAL_URL = '';
export const OFFICIAL_SITE = '';
export const OFFICIAL_DOMAIN = '';

export const OG_URL = '/og/og.webp?v=1';

export const LobeHubPath = {
  webapi: {
    modelConfig: '/webapi/lobehub-model-config',
  },
} as const;

// GitHub 引流链接已按商业化白标要求移除（置空）。引用处按 falsy 处理即隐藏。
export const GITHUB = '';
export const GITHUB_ISSUES = '';
export const CHANGELOG = '';

export const DOCUMENTS = urlJoin(OFFICIAL_SITE, '/docs');
export const USAGE_DOCUMENTS = urlJoin(DOCUMENTS, '/usage');
export const SELF_HOSTING_DOCUMENTS = urlJoin(DOCUMENTS, '/self-hosting');
export const DATABASE_SELF_HOSTING_URL = urlJoin(SELF_HOSTING_DOCUMENTS, '/server-database');

// use this for the link
export const DOCUMENTS_REFER_URL = `${DOCUMENTS}?utm_source=chat_preview`;

export const WIKI_PLUGIN_GUIDE = urlJoin(USAGE_DOCUMENTS, '/plugins/development');
export const MANUAL_UPGRADE_URL = urlJoin(SELF_HOSTING_DOCUMENTS, '/advanced/upstream-sync');

export const BLOG = urlJoin(OFFICIAL_SITE, 'blog');

export const ABOUT = OFFICIAL_SITE;
export const FEEDBACK = '';
export const PRIVACY_URL = urlJoin(OFFICIAL_SITE, '/privacy');
export const TERMS_URL = urlJoin(OFFICIAL_SITE, '/terms');

export const PLUGINS_INDEX_URL = '';

export const MORE_MODEL_PROVIDER_REQUEST_URL = '';

export const MORE_FILE_PREVIEW_REQUEST_URL = '';

export const AGENTS_INDEX_GITHUB = '';
export const AGENTS_INDEX_GITHUB_ISSUE = '';
export const AGENTS_OFFICIAL_URL = '';

export const AGENT_CHAT_URL = (agentId: string, mobile?: boolean) => {
  if (mobile) return `/agent/${agentId}`;
  return `/agent/${agentId}`;
};

export const AGENT_CHAT_TOPIC_URL = (agentId: string, topicId: string, mobile?: boolean) => {
  if (mobile) return urlJoin('/agent', agentId, topicId);
  return urlJoin('/agent', agentId, topicId);
};

export const AGENT_CHAT_TOPIC_PAGE_URL = (agentId: string, topicId: string, mobile?: boolean) => {
  if (mobile) return urlJoin('/agent', agentId, topicId, 'page');
  return urlJoin('/agent', agentId, topicId, 'page');
};

export const AGENT_PROFILE_URL = (agentId: string) => `/agent/${agentId}/profile`;

export const GROUP_CHAT_URL = (groupId: string) => `/group/${groupId}`;

export const GROUP_CHAT_TOPIC_URL = (groupId: string, topicId: string) =>
  urlJoin('/group', groupId, topicId);

export const LIBRARY_URL = (id: string) => urlJoin('/resource/library', id);

export const imageUrl = (filename: string) => `/images/${filename}`;

export const LOBE_URL_IMPORT_NAME = 'settings';

export const RELEASES_URL = '';

export const mailTo = (email: string) => `mailto:${email}`;

export const AES_GCM_URL = 'https://datatracker.ietf.org/doc/html/draft-ietf-avt-srtp-aes-gcm-01';
export const BASE_PROVIDER_DOC_URL = '';
export const CHANGELOG_URL = urlJoin(OFFICIAL_SITE, 'changelog');

export const DOWNLOAD_URL = {
  android: '',
  default: '',
  mobile: '',
  ios: '',
} as const;

