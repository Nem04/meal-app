export function recipeVersionPayload(specs = [], steps = '') {
  return {
    specs: (specs || []).map((spec) => ({
      raw_name: spec.raw_name || spec.name,
      quantity: spec.quantity,
      unit: spec.unit || '',
    })),
    steps: steps == null ? '' : String(steps),
  };
}
