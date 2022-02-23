import Benswap from "./dex/benswap.js";
import Mistswap from "./dex/mistswap.js";

const classesMapper = {
  Mistswap: Mistswap,
  Benswap: Benswap,
};

export { classesMapper, Mistswap, Benswap };
