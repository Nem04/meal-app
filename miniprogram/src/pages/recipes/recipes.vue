<template>
  <view>
    <scroll-view scroll-x class="chips">
      <view v-for="c in cats" :key="c" :class="['chip', c === category ? 'on' : '']" @tap="pick(c)">{{ c }}</view>
    </scroll-view>
    <view class="search-box">
      <input
        v-model="search"
        class="search-input"
        placeholder="搜索菜谱名称"
        confirm-type="search"
        @input="onSearchInput"
      />
      <text v-if="search" class="search-clear" @tap="clearSearch">×</text>
    </view>
    <view v-if="isChef" class="btn-primary" @tap="newRecipe">＋ 新建菜谱</view>
    <view v-for="r in recipes" :key="r.id" class="card row" @tap="openRecipe(r)">
      <view class="emoji">📖</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ r.name }}</view>
        <view class="muted">{{ r.category }} · {{ r.ingredient_count }} 种食材</view>
      </view>
      <view class="muted">›</view>
    </view>
    <view v-if="!recipes.length" class="muted" style="text-align:center;margin:40rpx;">
      {{ search || category !== '全部' ? '没有找到符合条件的菜谱' : '还没有菜谱' }}
    </view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';
import { pickRecipeCategory, recipeListQuery } from '../../utils/recipe-actions.js';

export default {
  data() {
    return {
      cats: ['全部','荤','素','汤','主食','凉菜','饮品','其他'],
      category: '全部',
      search: '',
      recipes: [],
      member: null,
    };
  },
  computed: { isChef() { return this.member && this.member.role === 'chef'; } },
  onShow() { this.member = getMember(); this.load(); },
  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },
  methods: {
    async load() {
      try {
        this.recipes = await request(`/recipes${recipeListQuery(this.category, this.search)}`);
      } catch (e) { toast(e.message); }
    },
    pick(c) { this.category = c; this.load(); },
    onSearchInput() {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.load(), 250);
    },
    clearSearch() {
      this.search = '';
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.load();
    },
    openRecipe(r) { uni.navigateTo({ url: `/pages/recipe/recipe?id=${r.id}` }); },
    async newRecipe() {
      const name = await new Promise((resolve) => {
        uni.showModal({
          title: '新建菜谱',
          editable: true,
          placeholderText: '菜名',
          success: (res) => resolve(res.confirm ? (res.content || '').trim() : ''),
          fail: () => resolve(''),
        });
      });
      if (!name) return;
      const category = await pickRecipeCategory();
      if (!category) return;
      try {
        const r = await request('/recipes', 'POST', {
          name,
          category,
          steps: '',
          specs: [],
        });
        toast('菜谱已保存');
        uni.navigateTo({ url: `/pages/recipe/recipe?id=${r.recipe_id}` });
      } catch (e) { toast(e.message); }
    },
  },
};
</script>

<style>
.chips { white-space:nowrap; margin:20rpx 24rpx; }
.chip { display:inline-block; background:#fff; border:1rpx solid #EFE7DC; border-radius:999rpx; padding:12rpx 26rpx; margin-right:12rpx; font-size:24rpx; }
.chip.on { background:#5B8C5A; border-color:#5B8C5A; color:#fff; font-weight:600; }
.search-box { margin:0 24rpx 20rpx; display:flex; align-items:center; background:#fff; border:1rpx solid #EFE7DC; border-radius:18rpx; padding:0 20rpx; }
.search-input { flex:1; height:80rpx; font-size:26rpx; }
.search-clear { color:#8A8077; font-size:38rpx; padding:8rpx 4rpx 8rpx 16rpx; }
.row { display:flex; align-items:center; gap:20rpx; }
</style>
