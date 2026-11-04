// 自动适配：
// - 微信开发者工具「模拟器」：用 localhost（模拟器就在本机）
// - 手机「真机预览」：用局域网 IP（手机和电脑连同一 WiFi）
const LAN_IP = '192.168.5.2';

function resolveBaseUrl() {
  try {
    const info = uni.getSystemInfoSync();
    if (info && info.platform === 'devtools') {
      return 'http://localhost:8080';
    }
  } catch (e) {
    // 忽略，走局域网 IP
  }
  return `http://${LAN_IP}:8080`;
}
export const BASE_URL = resolveBaseUrl();

const MEMBER_KEY = 'family-meal-member';

export function getMemberId() {
  return uni.getStorageSync(MEMBER_KEY) || '';
}

export function getMember() {
  const raw = uni.getStorageSync(MEMBER_KEY + ':info');
  return raw ? JSON.parse(raw) : null;
}

export function saveMember(m) {
  uni.setStorageSync(MEMBER_KEY, m.id || '');
  uni.setStorageSync(MEMBER_KEY + ':info', JSON.stringify(m));
}

export function clearMember() {
  uni.removeStorageSync(MEMBER_KEY);
  uni.removeStorageSync(MEMBER_KEY + ':info');
}

export function isChefNow() {
  const m = getMember();
  return m && m.role === 'chef';
}

export function request(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    const mid = getMemberId();
    if (mid) headers['x-member-id'] = mid;
    const url = BASE_URL + (path.startsWith("/api") ? path : "/api" + path);
    uni.request({
      url,
      method,
      data: body,
      header: headers,
      success(res) {
        const j = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && j && j.ok) {
          resolve(j.data);
        } else {
          const msg = (j && j.data && j.data.error) || `请求失败(${res.statusCode})`;
          console.error('[request] 非成功返回', url, res.statusCode, msg);
          reject(new Error(msg));
        }
      },
      fail(err) {
        console.error('[request] 网络失败', url, err.errMsg || err);
        reject(new Error(err.errMsg || '网络错误'));
      },
    });
  });
}

export function toast(title) {
  uni.showToast({ title, icon: 'none', duration: 1800 });
}
