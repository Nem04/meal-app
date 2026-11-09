<template>
  <view>
    <view class="card">
      <view style="font-size:36rpx;font-weight:700">{{ recipe.name }}</view>
      <view class="muted">{{ recipe.category }} · {{ recipe.source }}</view>
      <view class="section-title" style="margin:20rpx 0 8rpx;">食材</view>
      <view v-for="s in specs" :key="s.id" class="ing-row">
        <text>{{ s.raw_name }}</text>
        <text class="qty">{{ s.quantity }} {{ s.unit }}</text>
      </view>
      <view v-if="current && current.steps" class="section-title" style="margin:20rpx 0 8rpx;">步骤</view>
      <view v-if="current && current.steps" class="muted" style="white-space:pre-line">{{ current.steps }}</view>
    </view>

    <view v-if="isChef" class="btn-primary" @tap="fork">另存为我家版 ✨</view>
    <view v-if="canEdit" class="btn-primary" @tap="editIngredients">编辑我家版</view>
    <view v-if="isChef" class="btn-primary btn-danger" @tap="del">删除这份菜谱</view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';
import { parseIngredientLines } from '../../utils/ingredient-actions.js';

export default {
  data() { return { id: '', recipe: {}, current: null, specs: [], member: null }; },
  computed: {
    isChef() { return this.member && this.member.role === 'chef'; },
    canEdit() { return this.isChef && this.current && !this.current.is_base; },
  },
  onLoad(options) { this.id = options.id || ''; },
  onShow() { this.member = getMember(); this.load(); },
  methods: {
    async load() {
      try {
        const r = await request(`/recipes/${this.id}`);
        this.recipe = r;
        this.current = r.current_version;
        this.specs = r.specs || [];
      } catch (e) { toast(e.message); }
    },
    async fork() {
      if (!this.current) return toast('菜谱没有可用版本');
      try {
        await request(`/recipes/x/versions/${this.current.id}/fork`, 'POST', {});
        toast('已另存为我家版 ✨');
        this.load();
      } catch (e) { toast(e.message); }
    },
    editIngredients() {
      const texts = this.specs.map((s) => `${s.raw_name} ${s.quantity} ${s.unit}`).join('\n');
      uni.showModal({
        title: '编辑食材（每行：名称+数量+单位）',
        editable: true,
        placeholderText: '鸡蛋三个 或 鸡蛋3个',
        content: texts,
        success: async (res) => {
          if (res.confirm) {
            try {
              const specs = await parseIngredientLines(res.content || '');
              if (!specs.length) return toast('没有识别到食材');
              await request(`/recipes/x/versions/${this.current.id}`, 'PUT', { specs, steps: this.current.steps || '' });
              toast('改好啦 ✅（原版不受影响）');
              this.load();
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
    del() {
      uni.showModal({
        title: '删除菜谱', content: `确定删除「${this.recipe.name}」吗？如果已被饭局用过，会被保护。`,
        success: async (res) => {
          if (res.confirm) {
            try {
              await request(`/recipes/${this.id}`, 'DELETE', {});
              toast('菜谱已删除 🗑');
              uni.navigateBack();
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
  },
};
</script>

<style>
.ing-row { display:flex; justify-content:space-between; padding:10rpx 0; border-bottom:1rpx dashed #EFE7DC; }
.ing-row .qty { color:#4F7A4E; font-weight:600; }
</style>
