import { Router } from "express";

import Category from "../../models/Category.js";
import Inventory from "../../models/Inventory.js";
import Location from "../../models/Location.js";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import User from "../../models/userModel.js";
import { countChatConversations } from "../lib/adminShared.js";

const router = Router();
const REVENUE_STATUSES = ["completed", "shipped"];
const ACTIVE_ORDER_STATUSES = ["new", "confirmed", "processing", "shipped"];

const startOfMonth = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const addMonths = (date, months) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const revenueForMatch = async (match) => {
  const [result] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: "$totals.cartTotal" },
      },
    },
  ]);

  return roundMoney(result?.total || 0);
};

const buildDashboardAnalytics = async () => {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const nextMonthStart = addMonths(monthStart, 1);
  const trailingStart = addMonths(monthStart, -5);

  const [
    ordersThisMonth,
    ordersLastMonth,
    newUsersThisMonth,
    activeUsers,
    totalRevenue,
    revenueThisMonth,
    revenueLastMonth,
    largestOrder,
    avgOrderAgg,
    statusAgg,
    monthlyAgg,
    topProducts,
    lowStockAgg,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: monthStart, $lt: nextMonthStart } }),
    Order.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: monthStart } }),
    User.countDocuments({ createdAt: { $gte: monthStart, $lt: nextMonthStart } }),
    User.countDocuments({ status: "active" }),
    revenueForMatch({ status: { $in: REVENUE_STATUSES } }),
    revenueForMatch({
      status: { $in: REVENUE_STATUSES },
      createdAt: { $gte: monthStart, $lt: nextMonthStart },
    }),
    revenueForMatch({
      status: { $in: REVENUE_STATUSES },
      createdAt: { $gte: lastMonthStart, $lt: monthStart },
    }),
    Order.findOne({ status: { $ne: "cancelled" } })
      .sort({ "totals.cartTotal": -1, createdAt: 1 })
      .select("_id status createdAt customer.fullName totals.cartTotal totals.subtotal delivery.city")
      .lean(),
    Order.aggregate([
      { $match: { status: { $in: REVENUE_STATUSES } } },
      {
        $group: {
          _id: null,
          value: { $avg: "$totals.cartTotal" },
        },
      },
    ]),
    Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $in: ["$status", REVENUE_STATUSES] }, "$totals.cartTotal", 0],
            },
          },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: trailingStart, $lt: nextMonthStart },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $in: ["$status", REVENUE_STATUSES] }, "$totals.cartTotal", 0],
            },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Order.aggregate([
      {
        $match: {
          status: { $in: REVENUE_STATUSES },
          items: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $last: "$items.name" },
          unitsSold: { $sum: "$items.qty" },
          revenue: { $sum: { $multiply: ["$items.qty", "$items.price"] } },
          ordersCount: { $sum: 1 },
          image: { $last: "$items.image" },
        },
      },
      { $sort: { revenue: -1, unitsSold: -1 } },
      { $limit: 5 },
    ]),
    Inventory.aggregate([
      {
        $project: {
          available: { $subtract: ["$onHand", "$reserved"] },
        },
      },
      { $match: { available: { $lte: 2 } } },
      { $count: "count" },
    ]),
  ]);

  const monthlyLookup = new Map(
    monthlyAgg.map((item) => [
      `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
      item,
    ])
  );

  const monthlySeries = Array.from({ length: 6 }, (_, index) => {
    const current = addMonths(trailingStart, index);
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    const stats = monthlyLookup.get(key);

    return {
      key,
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      label: current.toLocaleString("en-US", { month: "short", year: "numeric" }),
      orders: Number(stats?.orders || 0),
      revenue: roundMoney(stats?.revenue || 0),
    };
  });

  return {
    period: {
      currentMonthStart: monthStart,
      previousMonthStart: lastMonthStart,
      nextMonthStart,
    },
    orders: {
      thisMonth: ordersThisMonth,
      lastMonth: ordersLastMonth,
      delta: ordersThisMonth - ordersLastMonth,
      activePipeline: await Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
    },
    revenue: {
      total: totalRevenue,
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      delta: roundMoney(revenueThisMonth - revenueLastMonth),
      averageCompletedOrderValue: roundMoney(avgOrderAgg?.[0]?.value || 0),
    },
    users: {
      active: activeUsers,
      newThisMonth: newUsersThisMonth,
    },
    largestOrder: largestOrder
      ? {
          id: String(largestOrder._id),
          createdAt: largestOrder.createdAt,
          status: largestOrder.status,
          customerName: largestOrder.customer?.fullName || "",
          city: largestOrder.delivery?.city || "",
          total: roundMoney(largestOrder.totals?.cartTotal || 0),
          subtotal: roundMoney(largestOrder.totals?.subtotal || 0),
        }
      : null,
    statusBreakdown: statusAgg.map((item) => ({
      status: item._id || "unknown",
      count: Number(item.count || 0),
      revenue: roundMoney(item.revenue || 0),
    })),
    monthlySeries,
    topProducts: topProducts.map((item) => ({
      productId: String(item._id || ""),
      productName: item.productName || "",
      unitsSold: Number(item.unitsSold || 0),
      ordersCount: Number(item.ordersCount || 0),
      revenue: roundMoney(item.revenue || 0),
      image: item.image || "",
    })),
    inventory: {
      lowStockRows: Number(lowStockAgg?.[0]?.count || 0),
    },
  };
};

const getAdminDashboard = async (_req, res) => {
  try {
    const [
      products,
      categories,
      users,
      chatConversations,
      locations,
      inventoryRows,
      showcaseRows,
      analytics,
    ] = await Promise.all([
      Product.countDocuments({}),
      Category.countDocuments({}),
      User.countDocuments({}),
      countChatConversations(),
      Location.countDocuments({}),
      Inventory.countDocuments({}),
      Inventory.countDocuments({ isShowcase: true }),
      buildDashboardAnalytics(),
    ]);

    res.json({
      products,
      categories,
      users,
      chatConversations,
      locations,
      inventoryRows,
      showcaseRows,
      analytics,
      ts: Date.now(),
    });
  } catch (error) {
    console.error("[ADMIN dashboard]", error);
    res.status(500).json({ message: "Помилка сервера" });
  }
};

const getAdminDashboardAnalytics = async (_req, res) => {
  try {
    res.json(await buildDashboardAnalytics());
  } catch (error) {
    console.error("[ADMIN dashboard analytics]", error);
    res.status(500).json({ message: "Помилка сервера" });
  }
};

router.get("/dashboard", getAdminDashboard);
router.get("/stats", getAdminDashboard);
router.get("/dashboard/analytics", getAdminDashboardAnalytics);

export default router;
