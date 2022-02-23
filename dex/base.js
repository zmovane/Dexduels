import "../setup-env.js";
import Web3 from "web3";
import abis from "../abis/index.js";
import { createRequire } from "module";
import { Balance } from "../entity/balance.js";
import { mainnet } from "../addresses/index.js";
import { BigNumber } from "../extensions/bignumber.js";
import { Percent, JSBI } from "@pancakeswap-libs/sdk-v2";

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.SMART_BCH_HTTPS)
);
const require = createRequire(import.meta.url);
const tokens = Object.fromEntries(
  require("../benswapbch-assets/tokens.json").map((e) => [e.symbol, e])
);

const { address: wallet } = web3.eth.accounts.wallet.add(
  process.env.WALLET_PRIVATE_KEY
);
const publicAddress = process.env.WALLET_ADDRESS;
const gasPrice = 1050000000;
const gasCost = 180000;

function newContract(abi, address) {
  return new web3.eth.Contract(abi, address);
}

async function transfer(receiver, currency, amount) {
  const contract = newContract(abis.erc20, tokens[currency].address);
  const amountInWei = Web3.utils.toWei(amount.toString(), "ether");
  const data = contract.methods.transfer(receiver, amountInWei).encodeABI();
  const tx = {
    to: receiver,
    from: wallet,
    data: data,
    value: amountInWei,
  };
  tx.gas = await web3.eth.estimateGas(tx);
  tx.gasPrice = gasPrice;
  return await web3.eth.sendTransaction(tx);
}

async function getBalance(currency) {
  let balance;
  if (currency === "BCH") {
    balance = await web3.eth.getBalance(publicAddress);
  } else {
    const contract = newContract(abis.erc20, tokens[currency].address);
    balance = await contract.methods.balanceOf(publicAddress).call();
  }
  balance = new BigNumber(web3.utils.fromWei(balance.toString(), "ether"));
  return Balance.create({
    currency: currency,
    total: balance,
    available: balance,
  });
}

class Dex {
  ZERO_PERCENT = new Percent("0");
  ONE_HUNDRED_PERCENT = new Percent("1");
  TRADES_OPTIONS = { maxHops: 3, maxmaxNumResults: 1 };
  BETTER_TRADE_LESS_HOPS_THRESHOLD = new Percent(
    JSBI.BigInt(50),
    JSBI.BigInt(10000)
  );
  DEFAULT_SWAP_OPTIONS = {
    ttl: 50,
    recipient: publicAddress,
    allowedSlippage: new Percent("1", "1000"),
  };

  constructor() {}

  async getBalances() {}

  async getQuotes([symIn, symOut], baseAmount) {}

  _currencyCombinations(sym0, sym1, basesToCheckTradesAgainst) {
    const bases = basesToCheckTradesAgainst;
    const basePairs = bases.flatMap((base, _) =>
      bases.map((otherBase) => [base, otherBase])
    );
    return [
      [sym0, sym1],
      ...bases.map((base) => [sym0, base]),
      ...bases.map((base) => [sym1, base]),
      ...basePairs,
    ].filter(([symA, symB]) => tokens[symA].address !== tokens[symB].address);
  }
}

export {
  web3,
  tokens,
  abis,
  mainnet,
  Dex,
  wallet,
  gasCost,
  gasPrice,
  newContract,
  transfer,
  getBalance,
};
