import Category from "../models/Category.js";
import Product from "../models/Product.js";
import SubCategory from "../models/SubCategory.js";
import { createHttpError } from "./productPayloadService.js";

const pickStr = (value) => String(value || "").trim();

const findCategoryByKey = async (categoryKey) =>
  Category.findOne({ category: pickStr(categoryKey) }).select("category children").lean();

const subCategoryExistsInCategory = (categoryDoc, subCategoryKey) => {
  const key = pickStr(subCategoryKey);
  if (!key) return true;
  return (categoryDoc?.children || []).some((child) => pickStr(child.key) === key);
};

export const assertProductCategoryReferences = async ({
  category,
  subCategory = null,
} = {}) => {
  const categoryKey = pickStr(category);
  const subCategoryKey = pickStr(subCategory);

  if (!categoryKey) {
    throw createHttpError(400, "category is required");
  }

  const categoryDoc = await findCategoryByKey(categoryKey);
  if (!categoryDoc) {
    throw createHttpError(400, `Category does not exist: ${categoryKey}`);
  }

  if (!subCategoryKey) return;

  if (subCategoryExistsInCategory(categoryDoc, subCategoryKey)) return;

  const flatSubCategory = await SubCategory.findOne({
    categoryKey,
    key: subCategoryKey,
    isActive: { $ne: false },
  })
    .select("_id")
    .lean();

  if (!flatSubCategory) {
    throw createHttpError(
      400,
      `Subcategory does not exist for ${categoryKey}: ${subCategoryKey}`
    );
  }
};

export const assertCategoryKeyCanChange = async ({
  currentCategory,
  nextCategory,
} = {}) => {
  const currentKey = pickStr(currentCategory);
  const nextKey = pickStr(nextCategory);
  if (!currentKey || !nextKey || currentKey === nextKey) return;

  const productsCount = await Product.countDocuments({ category: currentKey });
  if (productsCount > 0) {
    throw createHttpError(
      409,
      `Cannot rename category ${currentKey}; ${productsCount} products still use it`
    );
  }
};

export const assertCategoryCanDelete = async (category) => {
  const categoryKey = pickStr(category);
  const productsCount = await Product.countDocuments({ category: categoryKey });
  if (productsCount > 0) {
    throw createHttpError(
      409,
      `Cannot delete category ${categoryKey}; ${productsCount} products still use it`
    );
  }
};

export const assertSubCategoryCanDelete = async ({ category, subCategory } = {}) => {
  const categoryKey = pickStr(category);
  const subCategoryKey = pickStr(subCategory);
  const productsCount = await Product.countDocuments({
    category: categoryKey,
    subCategory: subCategoryKey,
  });

  if (productsCount > 0) {
    throw createHttpError(
      409,
      `Cannot delete subcategory ${categoryKey}/${subCategoryKey}; ${productsCount} products still use it`
    );
  }
};
