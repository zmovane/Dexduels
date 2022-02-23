import { createRequire } from "module";
const require = createRequire(import.meta.url);
export const mainnet = {
  benswap: require("./benswap-mainnet.json"),
  mistswap: require("./mistswap-mainnet.json"),
};
