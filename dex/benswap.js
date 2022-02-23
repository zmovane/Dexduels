import _ from "lodash";
import Web3 from "web3";
import "../setup-env.js";
import BigNumber from "bignumber.js";
import {
  Dex,
  mainnet,
  abis,
  tokens,
  wallet,
  web3,
  gasPrice,
  newContract,
} from "./base.js";
import {
  Pair,
  Router,
  TokenAmount,
  Trade,
  Token,
  ChainId,
  CurrencyAmount,
  currencyEquals,
} from "@pancakeswap-libs/sdk-v2";

class Benswap extends Dex {
  routerContract = newContract(abis.benswapRouter, mainnet.benswap.router);

  async getQuotes([symIn, symOut], baseAmount) {
    const tokenIn = this._asToken(symIn);
    const tokenOut = this._asToken(symOut);
    const bid = await this._getOutputAmount(
      tokenIn,
      tokenOut,
      baseAmount,
      true
    );
    const ask = await this._getOutputAmount(
      tokenOut,
      tokenIn,
      baseAmount,
      false
    );
    return [new BigNumber(bid), new BigNumber(ask)];
  }

  async _getOutputAmount(tokenIn, tokenOut, amount, isExactIn = true) {
    const trade = await this._trade(tokenIn, tokenOut, amount, isExactIn);
    return (isExactIn ? trade.outputAmount : trade.inputAmount).toSignificant(
      6
    );
  }

  async swap(symIn, symOut, amountIn, amountOut) {
    const isExactIn = amountIn !== undefined && amountOut === undefined;
    const tokenIn = this._asToken(symIn);
    const tokenOut = this._asToken(symOut);
    const trade = await this._trade(
      tokenIn,
      tokenOut,
      amountIn || amountOut,
      isExactIn
    );
    const { methodName, args, value } = Router.swapCallParameters(
      trade,
      this.DEFAULT_SWAP_OPTIONS
    );
    const data = this.routerContract.methods[methodName](...args).encodeABI();
    const tx = {
      from: wallet,
      to: this.routerContract.options.address,
      data: data,
      value: value,
    };
    tx.gas = await web3.eth.estimateGas(tx);
    tx.gasPrice = gasPrice;
    return await web3.eth.sendTransaction(tx);
  }

  async _trade(
    tokenIn,
    tokenOut,
    amount,
    isExactIn,
    { maxHops } = this.TRADES_OPTIONS
  ) {
    const allowedPairs = await this._pairs(tokenIn, tokenOut);
    const amountInWei = Web3.utils.toWei(amount.toString(), "ether");

    const currencyInAmount = this._isEther(tokenIn)
      ? CurrencyAmount.ether(amountInWei)
      : new TokenAmount(tokenIn, amountInWei);
    const currencyOutAmount = this._isEther(tokenOut)
      ? CurrencyAmount.ether(amountInWei)
      : new TokenAmount(tokenOut, amountInWei);

    if (maxHops === 1) {
      return this._bestTrades(
        allowedPairs,
        tokenIn,
        tokenOut,
        isExactIn ? currencyInAmount : currencyOutAmount,
        isExactIn,
        {
          maxHops: 1,
          maxNumResults: 1,
        }
      )[0];
    }
    // search through trades with varying hops, find best trade out of them
    let bestTradeSoFar;
    for (let i = 1; i <= maxHops; i++) {
      const currentTrade = this._bestTrades(
        allowedPairs,
        tokenIn,
        tokenOut,
        isExactIn ? currencyInAmount : currencyOutAmount,
        isExactIn,
        {
          maxHops: i,
          maxNumResults: 1,
        }
      )[0];
      if (
        // if current trade is best yet, save it
        this._isTradeBetter(
          bestTradeSoFar,
          currentTrade,
          this.BETTER_TRADE_LESS_HOPS_THRESHOLD
        )
      ) {
        bestTradeSoFar = currentTrade;
      }
    }
    return bestTradeSoFar;
  }

  _bestTrades(
    allowedPairs,
    tokenIn,
    tokenOut,
    parsedAmount,
    isExactIn,
    options
  ) {
    return isExactIn
      ? Trade.bestTradeExactIn(allowedPairs, parsedAmount, tokenOut, options)
      : Trade.bestTradeExactOut(allowedPairs, tokenIn, parsedAmount, options);
  }

  _isTradeBetter(tradeA, tradeB, minimumDelta = this.ZERO_PERCENT) {
    if (tradeA && !tradeB) return false;
    if (tradeB && !tradeA) return true;
    if (!tradeA || !tradeB) return undefined;

    if (
      tradeA.tradeType !== tradeB.tradeType ||
      !currencyEquals(
        tradeA.inputAmount.currency,
        tradeB.inputAmount.currency
      ) ||
      !currencyEquals(
        tradeB.outputAmount.currency,
        tradeB.outputAmount.currency
      )
    ) {
      throw new Error("Comparing incomparable trades");
    }

    if (minimumDelta.equalTo(this.ZERO_PERCENT)) {
      return tradeA.executionPrice.lessThan(tradeB.executionPrice);
    } else {
      return tradeA.executionPrice.raw
        .multiply(minimumDelta.add(this.ONE_HUNDRED_PERCENT))
        .lessThan(tradeB.executionPrice);
    }
  }

  async _pairs(token0, token1) {
    const currencyCombinations = this._currencyCombinations(
      token0.symbol,
      token1.symbol
    );
    return (
      await Promise.all(
        currencyCombinations.map(async ([token0, token1]) => {
          return await this._pairOf(token0, token1);
        })
      )
    ).filter((pair) => pair !== undefined);
  }

  async _pairOf(token0, token1) {
    const pairAddress = this._getPairAddress(token0, token1);
    const pairContract = newContract(abis.pancakePair, pairAddress);
    const reserves = await pairContract.methods.getReserves().call();
    const [t0, t1] = token0.sortsBefore(token1)
      ? [token0, token1]
      : [token1, token0];
    const token0Amount = new TokenAmount(t0, reserves[0]);
    const token1Amount = new TokenAmount(t1, reserves[1]);
    return new Pair(token0Amount, token1Amount);
  }

  _getPairAddress(tokenA, tokenB) {
    return Pair.getAddress(tokenA, tokenB);
  }

  _asToken(symbol) {
    const json = tokens[symbol];
    return new Token(
      ChainId.MAINNET,
      json.address,
      json.decimals,
      json.symbol,
      json.name
    );
  }

  _currencyCombinations(
    sym0,
    sym1,
    basesToCheckTradesAgainst = ["WBCH", "flexUSD"]
  ) {
    return super
      ._currencyCombinations(sym0, sym1, basesToCheckTradesAgainst)
      .map(([tokenJson0, tokenJson1]) => [
        this._asToken(tokenJson0),
        this._asToken(tokenJson1),
      ])
      .filter(([token0, token1]) => !token0.equals(token1));
  }

  _isEther(token) {
    return token.symbol === "WBCH";
  }
}

export default Benswap;
