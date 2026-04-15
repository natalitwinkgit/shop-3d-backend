import { Router } from "express";

import {
  createColor,
  createManufacturer,
  createMaterial,
  createProductCollectionAttribute,
  createProductRoomAttribute,
  createProductStyleAttribute,
  deleteColor,
  deleteManufacturer,
  deleteMaterial,
  deleteProductAttribute,
  getAdminColors,
  getAdminProductAttributeDictionaries,
  getAdminProductCollectionAttributes,
  getAdminProductRoomAttributes,
  getAdminProductStyleAttributes,
  getManufacturers,
  getMaterials,
  updateColor,
  updateManufacturer,
  updateMaterial,
  updateProductAttribute,
} from "../../controllers/referenceDictionaryController.js";

const router = Router();

router.get("/colors", getAdminColors);
router.post("/colors", createColor);
router.patch("/colors/:id", updateColor);
router.delete("/colors/:id", deleteColor);

router.get("/materials", getMaterials);
router.post("/materials", createMaterial);
router.patch("/materials/:id", updateMaterial);
router.delete("/materials/:id", deleteMaterial);

router.get("/manufacturers", getManufacturers);
router.post("/manufacturers", createManufacturer);
router.patch("/manufacturers/:id", updateManufacturer);
router.delete("/manufacturers/:id", deleteManufacturer);

router.get("/product-attributes", getAdminProductAttributeDictionaries);
router.get("/product-attributes/rooms", getAdminProductRoomAttributes);
router.post("/product-attributes/rooms", createProductRoomAttribute);
router.get("/product-attributes/styles", getAdminProductStyleAttributes);
router.post("/product-attributes/styles", createProductStyleAttribute);
router.get("/product-attributes/collections", getAdminProductCollectionAttributes);
router.post("/product-attributes/collections", createProductCollectionAttribute);
router.patch("/product-attributes/:id", updateProductAttribute);
router.delete("/product-attributes/:id", deleteProductAttribute);

export default router;
