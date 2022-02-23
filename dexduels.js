import _ from "lodash";
import "./setup-env.js";
import "lodash.combinations";
import installDB from "./io/db.js";
import { v1 as uuidv1 } from "uuid";
import { status, action } from "./entity/order.js";
import { classesMapper } from "./classes-mapper.js";
import { BigNumber, ONE } from "./extensions/bignumber.js";
import { delay } from "./extensions/time.js";

const {
  QUOTE_SYMBOLS,
  BASE_SYMBOL,
  DEXDUELS_DEXES,
  INTERVAL,
  BASE_QTY,
  TRIGGER_PROFIT_IN_USD,
} = process.env;

const stableCoin = "flexUSD";
const baseQty = new BigNumber(BASE_QTY);
const triggerProfitInUSD = new BigNumber(TRIGGER_PROFIT_IN_USD);

const db = await installDB("dexduels");
const orders = db.collection("orders");

const pairs = QUOTE_SYMBOLS.split(",").map((sym) => [BASE_SYMBOL, sym]);
const dexes = _.fromPairs(
  DEXDUELS_DEXES.split(",").map((name) => [name, new classesMapper[name]()])
);

console.info(
  `Attempts to find arbitrage opportunities with below pairs:\n ${pairs}`
);

const start = async () => {
  await checkAndComplete();
  const duels = _.combinations(Object.values(dexes), 2);
  while (true) {
    await dueling(duels);
    await delay(INTERVAL);
  }
};

/**
 * Query out the pending hedge orders and to complete
 */
async function checkAndComplete() {
  const pendingHedgeOrders = await orders
    .find({ status: status.New, action: action.Hedge })
    .sort({ ts: 1 })
    .toArray();
  for (const order of pendingHedgeOrders) {
    order.dex = dexes[order.exName];
    order.tx = await swap(order);
    await save(order);
  }
}

async function dueling(duels) {
  const opps = await checkOpportunities(duels);
  // only carry out the most profitable opportunity in every duels
  if (opps.length > 0) {
    const bestOpp = opps.reduce((prev, curr) => {
      if (curr.estimateProfit.gt(prev.estimateProfit)) {
        return curr;
      } else {
        return prev;
      }
    }, opps[0]);
    const [placedArb, placedHedge] = await excute(bestOpp);
    if (placedArb) save(placedArb);
    if (placedHedge) save(placedHedge);
  }
}

async function excute(opp) {
  const [arbOrder, hedgeOrder] = opp.orders;
  await save(arbOrder);
  arbOrder.tx = await swap(arbOrder);
  if (arbOrder.tx.status) {
    await save(hedgeOrder);
    // It will be better to check change of balance before hedge instead of use delay
    await delay(5000);
    hedgeOrder.tx = await swap(hedgeOrder);
    return [arbOrder, hedgeOrder];
  }
  return [arbOrder, undefined];
}

async function save(order) {
  const updatedStatus =
    order.tx === undefined
      ? status.New
      : order.tx.status
      ? status.Filled
      : status.Cancelled;
  order.exName = order.dex.constructor.name;
  order.status = updatedStatus;
  order.ts = Date.now();
  if (order.status === status.New) {
    const row = _.pick(order, [
      "id",
      "symIn",
      "symOut",
      "amountIn",
      "action",
      "hedgeTo",
      "exName",
      "status",
      "ts",
      "tx",
    ]);
    await orders.insertOne(row);
  } else {
    await orders.updateOne(
      { id: order.id },
      { $set: { status: order.status, tx: order.tx } }
    );
  }
}

async function checkOpportunities(duels) {
  const opps = [];
  for (const [dexA, dexB] of duels) {
    for (const pair of pairs) {
      const [base, quote] = pair;
      const [quotePx] = await dexA.getQuotes([quote, stableCoin], ONE);
      const [bidA, askA] = await dexA.getQuotes(pair, baseQty);
      const [bidB, askB] = await dexB.getQuotes(pair, baseQty);

      // Swap Base to Quote in Dex A and then swap Quote to Base in Dex B
      const profitA2B = bidA.minus(askB).multipliedBy(quotePx);
      if (profitA2B.gt(triggerProfitInUSD)) {
        const arbID = uuidv1();
        const hedgeID = uuidv1();
        opps.push({
          estimateProfit: profitA2B,
          orders: [
            {
              id: arbID,
              dex: dexA,
              symIn: base,
              symOut: quote,
              amountIn: baseQty,
              action: action.Arb,
            },
            {
              id: hedgeID,
              hedgeTo: arbID,
              dex: dexB,
              symIn: quote,
              symOut: base,
              amountOut: baseQty,
              action: action.Hedge,
            },
          ],
        });
      }
      // Swap Base to Quote in Dex B and then swap Quote to Base in Dex A
      const profitB2A = bidB.minus(askA).multipliedBy(quotePx);
      if (profitB2A.gt(triggerProfitInUSD)) {
        const arbID = uuidv1();
        const hedgeID = uuidv1();
        opps.push({
          estimateProfit: profitB2A,
          orders: [
            {
              id: arbID,
              dex: dexA,
              symIn: quote,
              symOut: base,
              amountOut: baseQty,
              action: action.Arb,
            },
            {
              id: hedgeID,
              hedgeTo: arbID,
              dex: dexB,
              symIn: base,
              symOut: quote,
              amountIn: baseQty,
              action: action.Hedge,
            },
          ],
        });
      }
    }
  }
  return opps;
}

async function swap({ dex, symIn, symOut, amountIn, amountOut }) {
  return await dex.swap(symIn, symOut, amountIn, amountOut);
}

start();
