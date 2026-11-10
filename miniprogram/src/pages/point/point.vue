<template>
  <view>
    <view class="toolbar">
      <view class="muted">加一道菜，食材会自动合并去重</view>
      <view v-if="isChef" class="finish-btn" @tap="finishMeal">结束点菜</view>
    </view>
    <view v-for="r in recipes" :key="r.id" class="card row" @tap="pickDish(r)">
      <view class="emoji">🍽</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ r.name }}</view>
        <view class="muted">{{ r.category }} · {{ r.ingredient_count }} 种食材</view>
      </view>
      <view
        :class="['add-btn', isOrdered(r) ? 'added' : '']"
        @tap.stop="pickDish(r)"
      >{{ isOrdered(r) ? '已点' : '+' }}</view>
    </view>
    <view v-if="!recipes.length" class="muted" style="text-align:center;margin:40rpx;">还没有菜谱，先去「菜谱」建一道吧</view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';
import { closeMeal, getMealDetail } from '../../utils/meal-actions.js';
import { isRecipeOrdered, orderedRecipeIds } from '../../utils/point-actions.js';

export default {
  data() {
    return { mealId: '', recipes: [], orderedRecipeIds: [], member: getMember() };
  },
  computed: {
    isChef() { return this.member && this.member.role === 'chef'; },
  },
  onLoad(options) {
    this.mealId = options.mealId || '';
  },
  onShow() { this.member = getMember(); this.load(); },
  methods: {
    async load() {
      try {
        const [recipes, meal] = await Promise.all([
          request('/recipes'),
          getMealDetail(this.mealId),
        ]);
        this.recipes = recipes;
        this.orderedRecipeIds = orderedRecipeIds(meal?.items || []);
      } catch (e) { toast(e.message); }
    },
    isOrdered(recipe) {
      return isRecipeOrdered(recipe, this.orderedRecipeIds);
    },
    async pickDish(r) {
      if (this.isOrdered(r)) return;
      try {
        await request(`/meals/${this.mealId}/items`, 'POST', { recipe_version_id: r.current_version_id, quantity: 1, note: '' });
        if (!this.orderedRecipeIds.includes(r.id)) this.orderedRecipeIds.push(r.id);
        toast('已点上这道菜 ✅');
      } catch (e) { toast(e.message); }
    },
    async finishMeal() {
      const result = await new Promise((resolve) => {
        uni.showModal({
          title: '结束点菜',
          content: '结束后家人将不能再添加菜，确定吗？',
          confirmText: '结束',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        });
      });
      if (!result.confirm) return;
      try {
        await closeMeal(this.mealId);
        toast('点菜已结束');
        setTimeout(() => uni.navigateBack(), 400);
      } catch (error) {
        toast(error.message);
      }
    },
  },
};
</script>

<style>
.row { display:flex; align-items:center; gap:20rpx; }
.add-btn { width:56rpx; height:56rpx; border-radius:50%; background:#5B8C5A; color:#fff; text-align:center; line-height:52rpx; font-size:36rpx; }
.add-btn.added { width:auto; min-width:76rpx; height:48rpx; line-height:48rpx; padding:0 16rpx; border-radius:999rpx; background:#E5DCCD; color:#8A8077; font-size:22rpx; }
.toolbar { display:flex; align-items:center; justify-content:space-between; gap:16rpx; margin:20rpx 24rpx; }
.finish-btn { color:#C94F3D; font-size:24rpx; font-weight:600; padding:10rpx 16rpx; border:1rpx solid #E8B7AB; border-radius:999rpx; }
</style>
