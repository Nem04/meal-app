// 后端地址：开发阶段默认本机；真机预览请改成局域网 IP，例如 http://192.168.5.2:8080
export const BASE_URL = 'http://localhost:8080';

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

export function isChefNow() {
  const m = getMember();
  return m && m.role === 'chef';
}

export function request(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    const mid = getMemberId();
    if (mid) headers['x-member-id'] = mid;
    uni.request({
      url: BASE_URL + path,
      method,
      data: body,
      header: headers,
      success(res) {
        const j = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300 && j && j.ok) {
          resolve(j.data);
        } else {
          const msg = (j && j.data && j.data.error) || '请求失败';
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'));
      },
    });
  });
}

export function toast(title) {
  uni.showToast({ title, icon: 'none', duration: 1800 });
}
