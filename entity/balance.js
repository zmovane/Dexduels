import { Data } from "dataclass";

class Balance extends Data {
  currency;
  total;
  available;
}

export { Balance };
