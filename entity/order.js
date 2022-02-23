import { Data } from "dataclass";
import { Enum } from "../extensions/enum.js";

const side = new Enum("Buy", "Sell");
const type = new Enum("Limit", "Market");
const action = new Enum("Arb", "Hedge");
const status = new Enum("New", "Cancelled", "PartiallyFilled", "Filled");
const tif = new Enum("GTC", "IOC", "FOK");

function sideOf(word) {
  switch (word) {
    case "Buy":
    case "buy":
    case "BUY":
    case "bid":
      return side.Buy;
    case "Sell":
    case "sell":
    case "SELL":
    case "ask":
      return side.Sell;
  }
}

function typeOf(word) {
  switch (word) {
    case "limit":
    case "LIMIT":
      return type.Limit;
    case "market":
    case "MARKET":
      return type.Market;
  }
}

function statusOf(word) {
  switch (word) {
    case "not_deal":
      return status.New;
    case "part_deal":
      return status.PartiallyFilled;
    case "cancel":
      return status.Cancelled;
    case "done":
      return status.Filled;
  }
}

class Order extends Data {
  id;
  clID;
  exName;
  symbol;
  px;
  avgPx;
  qty;
  side;
  type;
  status;
  cumQty;
  value;
  tif;
  ts;
  action;
}
export {
  side,
  sideOf,
  type,
  typeOf,
  status,
  statusOf,
  tif,
  action,
  Order,
};
