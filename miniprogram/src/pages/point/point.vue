<template>
  <view>
    <view class="muted" style="margin:20rpx 24rpx;">加一道菜，食材会自动合并去重</view>
    <view v-for="r in recipes" :key="r.id" class="card row" @tap="pickDish(r)">
      <view class="emoji">🍽</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ r.name }}</view>
        <view class="muted">{{ r.category }} · {{ r.ingredient_count }} 种食材</view>
      </view>
      <view class="add-btn">+</view>
    </view>
    <view v-if="!recipes.length" class="muted" style="text-align:center;margin:40rpx;">还没有菜谱，先去「菜谱」建一道吧</view>
  </view>
</template>

<script>
import { request, toast } from '../../utils/index.js';

export default {
  data() {
    return { mealId: '', recipes: [] };
  },
  onLoad(options) {
    this.mealId = options.mealId || '';
  },
  onShow() { this.load(); },
  methods: {
    async load() {
      try { this.recipes = await request('/recipes'); } catch (e) { toast(e.message); }
    },
    async pickDish(r) {
      try {
        await request(`/meals/${this.mealId}/items`, 'POST', { recipe_version_id: r.current_version_id, quantity: 1, note: '' });
        toast('已点上这道菜 ✅');
      } catch (e) { toast(e.message); }
    },
  },
};
</script>

<style>
.row { display:flex; align-items:center; gap:20rpx; }
.add-btn { width:56rpx; height:56rpx; border-radius:50%; background:#5B8C5A; color:#fff; text-align:center; line-height:52rpx; font-size:36rpx; }
</style>
