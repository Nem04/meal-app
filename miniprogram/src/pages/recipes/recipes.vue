<template>
  <view>
    <scroll-view scroll-x class="chips">
      <view v-for="c in cats" :key="c" :class="['chip', c === category ? 'on' : '']" @tap="pick(c)">{{ c }}</view>
    </scroll-view>
    <view v-if="isChef" class="btn-primary" @tap="newRecipe">＋ 新建菜谱</view>
    <view v-for="r in recipes" :key="r.id" class="card row" @tap="openRecipe(r)">
      <view class="emoji">📖</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ r.name }}</view>
        <view class="muted">{{ r.category }} · {{ r.ingredient_count }} 种食材</view>
      </view>
      <view class="muted">›</view>
    </view>
    <view v-if="!recipes.length" class="muted" style="text-align:center;margin:40rpx;">还没有菜谱</view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';

export default {
  data() {
    return { cats: ['全部','荤','素','汤','主食','凉菜','其他'], category: '全部', recipes: [], member: null };
  },
  computed: { isChef() { return this.member && this.member.role === 'chef'; } },
  onShow() { this.member = getMember(); this.load(); },
  methods: {
    async load() {
      try {
        const q = this.category === '全部' ? '' : `?category=${this.category}`;
        this.recipes = await request(`/recipes${q}`);
      } catch (e) { toast(e.message); }
    },
    pick(c) { this.category = c; this.load(); },
    openRecipe(r) { uni.navigateTo({ url: `/pages/recipe/recipe?id=${r.id}` }); },
    async newRecipe() {
      uni.showModal({
        title: '新建菜谱', editable: true, placeholderText: '菜名',
        success: async (res) => {
          if (res.confirm && res.content) {
            try {
              const r = await request('/recipes', 'POST', { name: res.content, category: '其他', steps: '', specs: [] });
              toast('菜谱已保存');
              uni.navigateTo({ url: `/pages/recipe/recipe?id=${r.recipe_id}` });
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
  },
};
</script>

<style>
.chips { white-space:nowrap; margin:20rpx 24rpx; }
.chip { display:inline-block; background:#fff; border:1rpx solid #EFE7DC; border-radius:999rpx; padding:12rpx 26rpx; margin-right:12rpx; font-size:24rpx; }
.chip.on { background:#5B8C5A; border-color:#5B8C5A; color:#fff; font-weight:600; }
.row { display:flex; align-items:center; gap:20rpx; }
</style>
