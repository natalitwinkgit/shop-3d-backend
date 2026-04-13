import { Router } from "express";

import {
  getProductAttributeDictionaries,
  getProductCollectionAttributes,
  getProductRoomAttributes,
  getProductStyleAttributes,
} from "../controllers/referenceDictionaryController.js";

const router = Router();

router.get("/", getProductAttributeDictionaries);
router.get("/rooms", getProductRoomAttributes);
router.get("/styles", getProductStyleAttributes);
router.get("/collections", getProductCollectionAttributes);

export default router;
