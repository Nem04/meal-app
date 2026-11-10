export function orderedRecipeIds(items = []) {
  return [...new Set(
    (items || [])
      .map((item) => item.recipe_id)
      .filter(Boolean),
  )];
}

export function isRecipeOrdered(recipe, orderedIds = []) {
  return Boolean(recipe?.id) && (orderedIds || []).includes(recipe.id);
}
