import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mistswapRouter = require("./MistSwapRouter.json");
const benswapRouter = require("./BenSwapRouter.json");
const benswapFactory = require("./BenSwapFactory.json");
const uniswapV2Pair = require("./IUniswapV2Pair.json");
const pancakePair = require("./PancakePair.json");
const erc20 = require("./Erc20.json")
export default { mistswapRouter, benswapRouter, benswapFactory, uniswapV2Pair, pancakePair, erc20 };
