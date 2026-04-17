import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
  buildProductQuestionListFilter,
  createProductQuestion,
  listProductQuestions,
  replyToProductQuestion,
  updateProductQuestionStatus,
} from "../services/productQuestionService.js";

const objectId = () => new mongoose.Types.ObjectId();

const makeLeanSelectQuery = (doc) => ({
  select() {
    return this;
  },
  lean() {
    return Promise.resolve(doc);
  },
});

const makeListQuery = (items, capture) => ({
  sort(value) {
    capture.sort = value;
    return this;
  },
  skip(value) {
    capture.skip = value;
    return this;
  },
  limit(value) {
    capture.limit = value;
    return this;
  },
  lean() {
    return Promise.resolve(items);
  },
});

const makeUpdateQuery = (doc) => ({
  populate() {
    return this;
  },
  lean() {
    return Promise.resolve(doc);
  },
});

test("createProductQuestion builds backend product snapshot and stores user id", async () => {
  const productId = objectId();
  const userId = objectId();
  const createdDocs = [];

  const productModel = {
    findById(id) {
      assert.equal(String(id), String(productId));
      return makeLeanSelectQuery({
        _id: productId,
        name: { ua: "Крісло", en: "Armchair" },
        sku: "CHAIR-001",
        slug: "green-chair",
        category: "chairs",
        subCategory: "armchair",
      });
    },
  };

  const questionModel = {
    async create(doc) {
      createdDocs.push(doc);
      return { _id: objectId(), ...doc };
    },
  };

  const question = await createProductQuestion(
    {
      productId: String(productId),
      customer: {
        name: "  Ivan <b>Petrenko</b> ",
        email: " IVAN@EXAMPLE.COM ",
        phone: "+38 (050) 111-22-33 ext",
      },
      message: " Чи є <script>alert(1)</script> інший колір? ",
      source: "product_page",
    },
    { currentUser: { _id: userId }, productModel, questionModel }
  );

  assert.equal(createdDocs.length, 1);
  assert.equal(String(question.productId), String(productId));
  assert.equal(String(question.userId), String(userId));
  assert.deepEqual(question.productSnapshot.name, { ua: "Крісло", en: "Armchair" });
  assert.equal(question.productSnapshot.sku, "CHAIR-001");
  assert.equal(question.productSnapshot.slug, "green-chair");
  assert.equal(
    question.productSnapshot.pageUrl.endsWith(`/catalog/chairs/armchair/${productId}`),
    true
  );
  assert.equal(question.customer.name, "Ivan Petrenko");
  assert.equal(question.customer.email, "ivan@example.com");
  assert.equal(question.message.includes("<script>"), false);
  assert.equal(question.status, "new");
  assert.equal(question.isRead, false);
});

test("createProductQuestion accepts frontend flat payload and hyphen source", async () => {
  const productId = objectId();
  const createdDocs = [];

  const productModel = {
    findById(id) {
      assert.equal(String(id), String(productId));
      return makeLeanSelectQuery({
        _id: productId,
        name: { ua: "Ліжко", en: "Bed" },
        sku: "BED-001",
        slug: "kids-bed",
      });
    },
  };

  const questionModel = {
    async create(doc) {
      createdDocs.push(doc);
      return { _id: objectId(), ...doc };
    },
  };

  const question = await createProductQuestion(
    {
      productId: String(productId),
      productName: "Ліжко Soft",
      sku: "FRONTEND-SKU",
      pageUrl: "http://localhost:5173/catalog/beds/kids/kids-bed",
      name: "AI Support",
      email: "ai-support@shop3d.local",
      phone: "99822176771",
      message: "Чи є в наявності?",
      locale: "ua",
      source: "product-page",
    },
    { productModel, questionModel }
  );

  assert.equal(createdDocs.length, 1);
  assert.equal(question.customer.name, "AI Support");
  assert.equal(question.customer.email, "ai-support@shop3d.local");
  assert.equal(question.customer.phone, "99822176771");
  assert.equal(question.message, "Чи є в наявності?");
  assert.equal(question.source, "product_page");
  assert.equal(question.productSnapshot.sku, "BED-001");
  assert.equal(question.productSnapshot.slug, "kids-bed");
});

test("createProductQuestion accepts phone-only contact", async () => {
  const productId = objectId();
  const productModel = {
    findById() {
      return makeLeanSelectQuery({
        _id: productId,
        name: { ua: "Стіл", en: "Table" },
        sku: "TABLE-001",
        slug: "table",
      });
    },
  };

  const question = await createProductQuestion(
    {
      productId: String(productId),
      name: "Ivan",
      phone: "+380501112233",
      message: "Передзвоніть щодо товару",
    },
    {
      productModel,
      questionModel: {
        async create(doc) {
          return { _id: objectId(), ...doc };
        },
      },
    }
  );

  assert.equal(question.customer.email, "");
  assert.equal(question.customer.phone, "+380501112233");
});

test("createProductQuestion rejects non-existing product", async () => {
  const productModel = {
    findById() {
      return makeLeanSelectQuery(null);
    },
  };

  await assert.rejects(
    () =>
      createProductQuestion(
        {
          productId: String(objectId()),
          customer: { name: "Ivan", email: "ivan@example.com" },
          message: "Question text",
        },
        { productModel, questionModel: { create: async () => ({}) } }
      ),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.message, "Product not found");
      return true;
    }
  );
});

test("createProductQuestion rejects invalid payload", async () => {
  await assert.rejects(
    () =>
      createProductQuestion({
        productId: "not-an-id",
        customer: { name: "", email: "bad" },
        message: "",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "VALIDATION_ERROR");
      return true;
    }
  );

  await assert.rejects(
    () =>
      createProductQuestion({
        productId: String(objectId()),
        customer: { name: "Ivan", email: "bad" },
        message: "Question text",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, "customer.email is invalid");
      return true;
    }
  );
});

test("listProductQuestions paginates, filters by status, searches customer and sku", async () => {
  const capture = {};
  const items = [{ _id: objectId(), status: "answered" }];
  const questionModel = {
    find(filter) {
      capture.filter = filter;
      return makeListQuery(items, capture);
    },
    countDocuments(filter) {
      capture.countFilter = filter;
      return Promise.resolve(1);
    },
  };

  const result = await listProductQuestions(
    { page: "2", limit: "10", status: "answered", q: "ivan@example.com" },
    { questionModel }
  );

  assert.equal(result.total, 1);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 10);
  assert.deepEqual(capture.sort, { createdAt: -1 });
  assert.equal(capture.skip, 10);
  assert.equal(capture.limit, 10);
  assert.equal(capture.filter.status, "answered");
  assert.equal(capture.filter.$or.length, 3);
  assert.deepEqual(capture.countFilter, capture.filter);
});

test("buildProductQuestionListFilter rejects invalid status", () => {
  assert.throws(
    () => buildProductQuestionListFilter({ status: "unknown" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("replyToProductQuestion saves reply, sends email, and marks emailSent", async () => {
  const questionId = objectId();
  const adminId = objectId();
  const updates = [];
  const docs = [
    {
      _id: questionId,
      customer: { email: "ivan@example.com" },
      message: "Original question",
      productSnapshot: { name: { ua: "Крісло" }, sku: "CHAIR-001" },
      adminReply: { message: "Answer", emailSent: false },
      status: "answered",
    },
    {
      _id: questionId,
      customer: { email: "ivan@example.com" },
      message: "Original question",
      productSnapshot: { name: { ua: "Крісло" }, sku: "CHAIR-001" },
      adminReply: { message: "Answer", emailSent: true },
      status: "answered",
    },
  ];

  const questionModel = {
    findByIdAndUpdate(id, update, options) {
      assert.equal(String(id), String(questionId));
      assert.deepEqual(options, { new: true });
      updates.push(update);
      return makeUpdateQuery(docs.shift());
    },
  };

  let emailPayload = null;
  const result = await replyToProductQuestion(
    {
      questionId: String(questionId),
      message: " Answer ",
      adminUser: { _id: adminId },
    },
    {
      questionModel,
      sendReplyEmail: async (payload) => {
        emailPayload = payload;
        return { sent: true, skipped: false, messageId: "m1" };
      },
    }
  );

  assert.equal(updates.length, 2);
  assert.equal(updates[0].$set.status, "answered");
  assert.equal(updates[0].$set["adminReply.message"], "Answer");
  assert.equal(String(updates[0].$set["adminReply.repliedBy"]), String(adminId));
  assert.equal(updates[0].$set["adminReply.emailSent"], false);
  assert.equal(updates[0].$set.isRead, true);
  assert.deepEqual(updates[1], { $set: { "adminReply.emailSent": true } });
  assert.equal(emailPayload.replyMessage, "Answer");
  assert.equal(result.email.sent, true);
  assert.equal(result.question.adminReply.emailSent, true);
});

test("replyToProductQuestion refreshes legacy product url before email", async () => {
  const questionId = objectId();
  const productId = objectId();
  const questionModel = {
    findByIdAndUpdate(id, update) {
      assert.equal(String(id), String(questionId));
      return makeUpdateQuery({
        _id: questionId,
        productId,
        customer: { email: "ivan@example.com" },
        message: "Original question",
        productSnapshot: {
          name: { ua: "Стіл" },
          sku: "DESK-001",
          slug: "loft-apex-desk",
          pageUrl: "http://localhost:5173/products/loft-apex-desk",
        },
        adminReply: { message: update.$set["adminReply.message"], emailSent: false },
        status: "answered",
      });
    },
  };
  const productModel = {
    findById(id) {
      assert.equal(String(id), String(productId));
      return makeLeanSelectQuery({
        _id: productId,
        name: { ua: "Стіл Loft Apex", en: "Loft Apex Desk" },
        sku: "DESK-001",
        slug: "loft-apex-desk",
        category: "tables",
        subCategory: "desk",
      });
    },
  };

  let emailPayload = null;
  await replyToProductQuestion(
    {
      questionId: String(questionId),
      message: "Answer",
    },
    {
      questionModel,
      productModel,
      sendReplyEmail: async (payload) => {
        emailPayload = payload;
        return { sent: false, skipped: false, reason: "TEST" };
      },
    }
  );

  assert.ok(
    emailPayload.question.productSnapshot.pageUrl.endsWith(`/catalog/tables/desk/${productId}`)
  );
});

test("replyToProductQuestion accepts admin reply aliases", async () => {
  const questionId = objectId();
  const updates = [];
  const questionModel = {
    findByIdAndUpdate(id, update) {
      assert.equal(String(id), String(questionId));
      updates.push(update);
      return makeUpdateQuery({
        _id: questionId,
        customer: { phone: "+380501112233" },
        message: "Original question",
        productSnapshot: { name: { ua: "Крісло" }, sku: "CHAIR-001" },
        adminReply: { message: update.$set["adminReply.message"], emailSent: false },
        status: "answered",
      });
    },
  };

  const result = await replyToProductQuestion(
    {
      questionId: String(questionId),
      answer: " Alias answer ",
    },
    {
      questionModel,
      sendReplyEmail: async () => ({ sent: false, skipped: true, reason: "NO_CUSTOMER_EMAIL" }),
    }
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].$set["adminReply.message"], "Alias answer");
  assert.equal(result.question.adminReply.message, "Alias answer");
});

test("updateProductQuestionStatus validates and updates status", async () => {
  const questionId = objectId();
  const updates = [];
  const questionModel = {
    findByIdAndUpdate(id, update, options) {
      assert.equal(String(id), String(questionId));
      assert.deepEqual(options, { new: true });
      updates.push(update);
      return {
        lean() {
          return Promise.resolve({ _id: questionId, status: update.$set.status });
        },
      };
    },
  };

  const question = await updateProductQuestionStatus(
    { questionId: String(questionId), status: "closed" },
    { questionModel }
  );

  assert.equal(question.status, "closed");
  assert.deepEqual(updates[0], { $set: { status: "closed" } });
});
