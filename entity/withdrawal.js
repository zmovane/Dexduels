import { Data } from "dataclass";
import { Enum } from "../extensions/enum.js";

const withdrawalStatus = new Enum(
  "Pending",
  "Cancelled",
  "Failed",
  "Completed"
);

class Withdrawal extends Data {
  id;
  exName;
  currency;
  address;
  status;
  chain;
  amount;
  fee;
  ts;
}

function withdrawalStatusOf(word) {
  switch (word) {
    case "audit":
    case "pass":
    case "processing":
    case "confirming":
      return withdrawalStatus.Pending;
    case "not_pass":
    case "cancel":
      return withdrawalStatus.Cancelled;
    case "fail":
      return withdrawalStatus.Failed;
    case "finish":
      return withdrawalStatus.Completed;
  }
}

export { Withdrawal, withdrawalStatusOf, withdrawalStatus };
