<template>
  <view>
    <!-- 身份 -->
    <view class="identity" v-if="!member">
      <view class="card">
        <view class="section-title">你是谁？</view>
        <view class="muted" style="margin:0 24rpx 16rpx;">选择身份后，点餐和编辑都会记录是谁操作的。</view>
        <view v-for="m in members" :key="m.id" class="member-row" @tap="pickMember(m)">
          <view class="emoji">{{ m.role === 'chef' ? '👨‍🍳' : '👤' }}</view>
          <view style="flex:1">
            <view style="font-weight:600">{{ m.name }}</view>
            <view class="muted">{{ m.role === 'chef' ? '主厨（可编辑）' : '家人（可点餐）' }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 主内容 -->
    <view v-else>
      <view class="hello">{{ greetingLine }}<text class="role-chip">{{ member.role === 'chef' ? '主厨' : '家人' }}</text></view>

      <!-- 进行中的饭 -->
      <view v-if="openMeal" class="hero">
        <view class="hero-tag">🔥 进行中</view>
        <view class="hero-title">{{ openMeal.title }}</view>
        <view class="hero-sub">{{ openMeal.meal_date }} · {{ openMeal.item_count }} 道菜</view>
        <view class="hero-actions">
          <view class="hero-btn" @tap="goPoint(openMeal.id)">去点菜</view>
          <view class="hero-btn ghost" @tap="goPrep(openMeal.id)">看备菜清单</view>
        </view>
      </view>
      <view v-else class="hero">
        <view class="hero-tag">🍳 没有进行中的饭</view>
        <view class="hero-title">今晚吃什么？</view>
        <view class="hero-sub">开一顿饭，让家人一起来点。</view>
        <view class="hero-actions">
          <view class="hero-btn" @tap="openMealForm" v-if="isChef">开一顿饭</view>
          <view class="muted" v-else>等主厨开饭吧</view>
        </view>
      </view>

      <!-- 最近吃过的 -->
      <view class="section-title">最近吃过的</view>
      <view v-for="m in closedMeals" :key="m.id" class="card row">
        <view class="emoji">🍲</view>
        <view style="flex:1">
          <view style="font-weight:600">{{ m.title }}</view>
          <view class="muted">{{ m.meal_date }} · {{ m.item_count }} 道菜</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { request, toast, getMember, saveMember } from '../../utils/index.js';
import { getGreeting } from '../../utils/greeting.js';

export default {
  data() {
    return {
      member: null,
      greeting: getGreeting(),
      members: [],
      meals: [],
    };
  },
  computed: {
    isChef() { return this.member && this.member.role === 'chef'; },
    greetingLine() {
      if (!this.member) return this.greeting;
      const separator = this.greeting.endsWith('～') ? ' ' : '，';
      return `${this.greeting}${separator}${this.member.name}`;
    },
    openMeal() { return this.meals.find((m) => m.status === 'open'); },
    closedMeals() { return this.meals.filter((m) => m.status !== 'open').slice(0, 8); },
  },
  onShow() {
    this.scheduleGreetingRefresh();
    this.member = getMember();
    this.init();
  },
  onHide() {
    this.stopGreetingRefresh();
  },
  onUnload() {
    this.stopGreetingRefresh();
  },
  methods: {
    scheduleGreetingRefresh() {
      this.stopGreetingRefresh();
      this.greeting = getGreeting();
      const delay = 60000 - (Date.now() % 60000) + 50;
      this.greetingTimer = setTimeout(() => this.scheduleGreetingRefresh(), delay);
    },
    stopGreetingRefresh() {
      if (this.greetingTimer) {
        clearTimeout(this.greetingTimer);
        this.greetingTimer = null;
      }
    },
    async init() {
      try {
        this.members = await request('/members');
        this.meals = await request('/meals');
      } catch (e) { toast(e.message); }
    },
    async pickMember(m) {
      saveMember(m);
      this.member = m;
      await this.init();
    },
    async openMealForm() {
      const title = await this.prompt('开一顿饭', '饭名（默认「今晚这顿饭」）');
      if (title !== null && title !== undefined) {
        try {
          await request('/meals', 'POST', { title: title || '今晚这顿饭' });
          toast('这顿饭开好啦 🍳');
          this.meals = await request('/meals');
        } catch (e) { toast(e.message); }
      }
    },
    prompt(title, placeholder) {
      return new Promise((resolve) => {
        uni.showModal({
          title,
          editable: true,
          placeholderText: placeholder,
          success(res) {
            if (res.confirm) resolve(res.content);
            else resolve(null);
          },
          fail() { resolve(null); },
        });
      });
    },
    goPoint(id) { uni.navigateTo({ url: `/pages/point/point?mealId=${id}` }); },
    goPrep(id) { uni.navigateTo({ url: `/pages/prep/prep?mealId=${id}` }); },
  },
};
</script>

<style>
.identity { padding-top: 20rpx; }
.member-row {
  display: flex; align-items: center; gap: 20rpx;
  padding: 20rpx; border-bottom: 1rpx solid #EFE7DC;
}
.hello { margin: 20rpx 24rpx 0; font-size: 26rpx; color: #8A8077; display: flex; align-items: center; gap: 12rpx; }
.role-chip {
  background: #EAF2E7; color: #4F7A4E; font-size: 22rpx;
  padding: 2rpx 16rpx; border-radius: 999rpx;
}
.hero {
  background: linear-gradient(135deg, #5B8C5A, #72A06D);
  color: #fff; border-radius: 26rpx; padding: 32rpx; margin: 20rpx 24rpx;
}
.hero-tag { display:inline-block; background: rgba(255,255,255,.22); border-radius: 999rpx; padding: 4rpx 20rpx; font-size: 22rpx; }
.hero-title { font-size: 40rpx; font-weight: 700; margin: 14rpx 0 6rpx; }
.hero-sub { font-size: 24rpx; opacity: .92; }
.hero-actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
.hero-btn { flex:1; text-align:center; border-radius: 20rpx; padding: 20rpx 0; font-size: 28rpx; font-weight:600; background:#fff; color:#4F7A4E; }
.hero-btn.ghost { background: rgba(255,255,255,.18); color:#fff; }
.row { display:flex; align-items:center; gap:20rpx; }
</style>
